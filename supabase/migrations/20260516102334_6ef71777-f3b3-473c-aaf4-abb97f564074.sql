
-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.vendor_account_status AS ENUM ('active','pending','suspended','expired','blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vendor_status public.vendor_account_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS access_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_ends_at   timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at     timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS blocked_at       timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason   text;

-- 3. Backfill existing vendors
UPDATE public.profiles p
SET vendor_status = CASE WHEN p.is_verified THEN 'active'::public.vendor_account_status
                         ELSE 'pending'::public.vendor_account_status END,
    access_starts_at = COALESCE(p.access_starts_at, p.created_at)
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.id AND ur.role = 'vendeur'::public.app_role
);

-- 4. Helper to check vendor operability
CREATE OR REPLACE FUNCTION public.vendor_is_active(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND p.vendor_status = 'active'::public.vendor_account_status
      AND (p.access_ends_at IS NULL OR p.access_ends_at > now())
  )
$$;

-- 5. Trigger: auto-expire on read/write
CREATE OR REPLACE FUNCTION public.tg_auto_expire_vendor()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.vendor_status = 'active'::public.vendor_account_status
     AND NEW.access_ends_at IS NOT NULL
     AND NEW.access_ends_at <= now() THEN
    NEW.vendor_status := 'expired'::public.vendor_account_status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS auto_expire_vendor_trg ON public.profiles;
CREATE TRIGGER auto_expire_vendor_trg
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_auto_expire_vendor();

-- 6. Update public read policy for shops
DROP POLICY IF EXISTS profiles_public_shop_read ON public.profiles;
CREATE POLICY profiles_public_shop_read ON public.profiles
FOR SELECT USING (
  is_verified = true
  AND vendor_status = 'active'::public.vendor_account_status
  AND (access_ends_at IS NULL OR access_ends_at > now())
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = profiles.id AND ur.role = 'vendeur'::public.app_role)
);

-- 7. Update products public read
DROP POLICY IF EXISTS products_public_read_approved ON public.products;
CREATE POLICY products_public_read_approved ON public.products
FOR SELECT USING (
  (status = 'approved'::public.product_status
    AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = products.vendor_id
        AND pr.is_verified = true
        AND pr.vendor_status = 'active'::public.vendor_account_status
        AND (pr.access_ends_at IS NULL OR pr.access_ends_at > now())
    ))
  OR vendor_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::public.app_role)
);

-- 8. Tighten product insert: only active vendors
DROP POLICY IF EXISTS products_vendor_insert ON public.products;
CREATE POLICY products_vendor_insert ON public.products
FOR INSERT WITH CHECK (
  auth.uid() = vendor_id
  AND has_role(auth.uid(), 'vendeur'::public.app_role)
  AND public.vendor_is_active(auth.uid())
);

-- 9. Block new order_items toward inactive vendors
CREATE OR REPLACE FUNCTION public.tg_block_inactive_vendor_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.vendor_is_active(NEW.vendor_id) THEN
    RAISE EXCEPTION 'Ce vendeur n''accepte pas de nouvelles commandes (compte % ).',
      (SELECT vendor_status FROM public.profiles WHERE id = NEW.vendor_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS block_inactive_vendor_order_trg ON public.order_items;
CREATE TRIGGER block_inactive_vendor_order_trg
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.tg_block_inactive_vendor_order();

-- 10. Schedule auto-expiry
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('vendor-auto-expire');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'vendor-auto-expire',
  '7 * * * *',
  $$ UPDATE public.profiles
     SET vendor_status = 'expired'::public.vendor_account_status
     WHERE vendor_status = 'active'::public.vendor_account_status
       AND access_ends_at IS NOT NULL
       AND access_ends_at <= now(); $$
);
