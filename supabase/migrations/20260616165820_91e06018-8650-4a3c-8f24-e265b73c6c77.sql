
-- ═══════════════════════════════════════════════════════════════
-- Phase 1 : Double validation + Centre SAV (sav_cases)
-- ═══════════════════════════════════════════════════════════════

-- 1. Colonnes de double validation (traçabilité opérationnelle)
ALTER TABLE public.order_decisions
  ADD COLUMN IF NOT EXISTS validated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS validated_at timestamptz;

ALTER TABLE public.financial_movements
  ADD COLUMN IF NOT EXISTS validated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS validated_at timestamptz;

-- 2. Enums Centre SAV
DO $$ BEGIN
  CREATE TYPE public.sav_status AS ENUM ('open','in_progress','waiting','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_owner_party AS ENUM ('kawzone','vendor','supplier','client');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_problem_type AS ENUM (
    'stock_break',
    'product_deleted',
    'shop_deleted',
    'dispute',
    'payment_blocked',
    'delivery_blocked',
    'supplier_unavailable',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Table sav_cases
CREATE TABLE IF NOT EXISTS public.sav_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  problem_type public.sav_problem_type NOT NULL,
  status public.sav_status NOT NULL DEFAULT 'open',
  owner_party public.sav_owner_party NOT NULL DEFAULT 'kawzone',
  title text NOT NULL,
  description text,
  financial_impact_amount numeric NOT NULL DEFAULT 0,
  financial_impact_currency text NOT NULL DEFAULT 'XOF',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  assigned_to uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sav_cases_status ON public.sav_cases(status);
CREATE INDEX IF NOT EXISTS idx_sav_cases_owner_party ON public.sav_cases(owner_party);
CREATE INDEX IF NOT EXISTS idx_sav_cases_order ON public.sav_cases(order_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_sav_cases_opened_at ON public.sav_cases(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_sav_cases_last_activity ON public.sav_cases(last_activity_at DESC);

-- 4. GRANTS (obligatoire — Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sav_cases TO authenticated;
GRANT ALL ON public.sav_cases TO service_role;

-- 5. RLS — admin only (back-office)
ALTER TABLE public.sav_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sav_cases_admin_all" ON public.sav_cases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- 6. Trigger updated_at
DROP TRIGGER IF EXISTS trg_sav_cases_updated_at ON public.sav_cases;
CREATE TRIGGER trg_sav_cases_updated_at
  BEFORE UPDATE ON public.sav_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
