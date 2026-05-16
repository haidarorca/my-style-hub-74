
-- 1) Site settings: admin commission WhatsApp
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS commission_whatsapp_number text;

-- 2) Orders: commission flag + forward timestamp
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_commission boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS forwarded_to_vendor_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_is_commission ON public.orders(is_commission) WHERE is_commission = true;

-- 3) Trigger: mark order as commission when any item has commission_amount > 0
CREATE OR REPLACE FUNCTION public.mark_order_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.commission_amount, 0) > 0 THEN
    UPDATE public.orders SET is_commission = true
    WHERE id = NEW.order_id AND is_commission = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_order_commission ON public.order_items;
CREATE TRIGGER trg_mark_order_commission
AFTER INSERT OR UPDATE OF commission_amount ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.mark_order_commission();

-- 4) Notify admins on new commission order
CREATE OR REPLACE FUNCTION public.notify_admins_on_commission_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_user record;
BEGIN
  IF NEW.is_commission = true AND COALESCE(OLD.is_commission, false) = false THEN
    FOR admin_user IN
      SELECT DISTINCT user_id FROM public.user_roles
      WHERE role IN ('admin'::app_role, 'super_admin'::app_role)
        AND is_suspended = false
    LOOP
      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (
        admin_user.user_id,
        '💼 Nouvelle commande commission',
        'Commande #' || substring(NEW.id::text from 1 for 8) || ' — ' || COALESCE(NEW.customer_name, 'Client') || ' · ' || COALESCE(NEW.total::text, '0') || ' FCFA',
        '/admin/commission-orders'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_commission_order ON public.orders;
CREATE TRIGGER trg_notify_admins_commission_order
AFTER UPDATE OF is_commission ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_commission_order();
