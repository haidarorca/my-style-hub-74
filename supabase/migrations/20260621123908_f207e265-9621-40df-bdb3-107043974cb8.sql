
-- ============================================================
-- KAWZONE — Système Multi-Devises (Étape A: Fondation DB)
-- ============================================================

-- 1) Table currencies (référentiel)
CREATE TABLE public.currencies (
  code text PRIMARY KEY,
  name text NOT NULL,
  symbol text NOT NULL,
  decimals int NOT NULL DEFAULT 2,
  is_active boolean NOT NULL DEFAULT true,
  is_base boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.currencies TO anon, authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Currencies are readable by everyone"
  ON public.currencies FOR SELECT
  USING (true);

CREATE POLICY "Super admins manage currencies"
  ON public.currencies FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER currencies_set_updated_at
  BEFORE UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Unique base currency
CREATE UNIQUE INDEX currencies_one_base_idx ON public.currencies (is_base) WHERE is_base = true;

-- 2) Table currency_rates (historique manuel)
CREATE TABLE public.currency_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code text NOT NULL REFERENCES public.currencies(code) ON DELETE CASCADE,
  rate_to_base numeric(18,6) NOT NULL CHECK (rate_to_base > 0),
  safety_margin_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (safety_margin_pct >= 0 AND safety_margin_pct <= 100),
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX currency_rates_lookup_idx ON public.currency_rates (currency_code, effective_from DESC);

GRANT SELECT ON public.currency_rates TO authenticated;
GRANT ALL ON public.currency_rates TO service_role;
ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read currency rates"
  ON public.currency_rates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins manage rates"
  ON public.currency_rates FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 3) Seed des devises (XOF = base)
INSERT INTO public.currencies (code, name, symbol, decimals, is_base, display_order) VALUES
  ('XOF', 'Franc CFA',  'FCFA', 0, true,  1),
  ('USD', 'US Dollar',  '$',    2, false, 2),
  ('EUR', 'Euro',       '€',    2, false, 3),
  ('RMB', 'Yuan',       '¥',    2, false, 4),
  ('TRY', 'Lira',       '₺',    2, false, 5);

-- Taux initiaux
INSERT INTO public.currency_rates (currency_code, rate_to_base, safety_margin_pct, note) VALUES
  ('XOF', 1,       0,  'Devise de base'),
  ('USD', 585,     5,  'Taux initial'),
  ('EUR', 656,     5,  'Taux initial (parité fixe XOF/EUR)'),
  ('RMB', 82,      8,  'Taux initial'),
  ('TRY', 18,      10, 'Taux initial');

-- 4) Colonnes vendeur
ALTER TABLE public.profiles
  ADD COLUMN default_currency_code text REFERENCES public.currencies(code) ON DELETE SET NULL DEFAULT 'XOF';

-- 5) Colonnes produits
ALTER TABLE public.products
  ADD COLUMN origin_price numeric(14,2),
  ADD COLUMN origin_currency_code text REFERENCES public.currencies(code) ON DELETE SET NULL,
  ADD COLUMN origin_rate_snapshot numeric(18,6),
  ADD COLUMN origin_margin_snapshot numeric(5,2);

-- Backfill produits existants → XOF
UPDATE public.products
   SET origin_price = price,
       origin_currency_code = 'XOF',
       origin_rate_snapshot = 1,
       origin_margin_snapshot = 0
 WHERE origin_currency_code IS NULL;

-- 6) Colonnes orders / order_items
ALTER TABLE public.orders
  ADD COLUMN display_currency_code text REFERENCES public.currencies(code) ON DELETE SET NULL;

ALTER TABLE public.order_items
  ADD COLUMN origin_currency_code text REFERENCES public.currencies(code) ON DELETE SET NULL,
  ADD COLUMN origin_unit_price numeric(14,2),
  ADD COLUMN origin_rate_snapshot numeric(18,6);

-- 7) Fonctions
CREATE OR REPLACE FUNCTION public.current_currency_rate(_code text)
RETURNS TABLE(rate numeric, margin numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT rate_to_base, safety_margin_pct
  FROM public.currency_rates
  WHERE currency_code = _code
    AND effective_from <= now()
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.convert_amount(_amount numeric, _from text, _to text)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r_from numeric := 1;
  r_to numeric := 1;
  amount_xof numeric;
BEGIN
  IF _amount IS NULL THEN RETURN NULL; END IF;
  IF _from = _to THEN RETURN _amount; END IF;
  SELECT rate INTO r_from FROM public.current_currency_rate(_from);
  SELECT rate INTO r_to   FROM public.current_currency_rate(_to);
  IF r_from IS NULL OR r_to IS NULL OR r_to = 0 THEN RETURN NULL; END IF;
  amount_xof := _amount * r_from;
  RETURN amount_xof / r_to;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_currency_rate(
  _code text,
  _rate numeric,
  _margin numeric DEFAULT 0,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF _rate IS NULL OR _rate <= 0 THEN
    RAISE EXCEPTION 'Rate must be > 0';
  END IF;
  INSERT INTO public.currency_rates(currency_code, rate_to_base, safety_margin_pct, created_by, note)
  VALUES (_code, _rate, COALESCE(_margin, 0), auth.uid(), _note)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 8) Trigger recalcul prix XOF des produits
CREATE OR REPLACE FUNCTION public.recompute_product_price_xof()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rate numeric;
  v_margin numeric;
BEGIN
  IF NEW.origin_currency_code IS NULL OR NEW.origin_price IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.origin_currency_code = 'XOF' THEN
    NEW.origin_rate_snapshot := 1;
    NEW.origin_margin_snapshot := 0;
    NEW.price := NEW.origin_price;
    RETURN NEW;
  END IF;

  SELECT rate, margin INTO v_rate, v_margin
  FROM public.current_currency_rate(NEW.origin_currency_code);

  IF v_rate IS NULL THEN
    RAISE EXCEPTION 'No rate configured for currency %', NEW.origin_currency_code;
  END IF;

  NEW.origin_rate_snapshot := v_rate;
  NEW.origin_margin_snapshot := COALESCE(v_margin, 0);
  NEW.price := ROUND(NEW.origin_price * v_rate * (1 + COALESCE(v_margin, 0) / 100), 0);
  RETURN NEW;
END;
$$;

CREATE TRIGGER products_recompute_price_xof
  BEFORE INSERT OR UPDATE OF origin_price, origin_currency_code ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.recompute_product_price_xof();
