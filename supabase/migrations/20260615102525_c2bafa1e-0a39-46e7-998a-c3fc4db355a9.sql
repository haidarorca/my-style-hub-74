
CREATE TABLE IF NOT EXISTS public.order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount >= 0),
  method text NOT NULL,
  reference text,
  admin_name text NOT NULL DEFAULT 'Admin',
  admin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_payments_order_id_idx ON public.order_payments(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_payments TO authenticated;
GRANT ALL ON public.order_payments TO service_role;
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage order_payments" ON public.order_payments FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.payment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  action text NOT NULL,
  admin_name text NOT NULL DEFAULT 'Admin',
  admin_id uuid,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_audit_order_id_idx ON public.payment_audit(order_id);
GRANT SELECT, INSERT ON public.payment_audit TO authenticated;
GRANT ALL ON public.payment_audit TO service_role;
ALTER TABLE public.payment_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage payment_audit" ON public.payment_audit FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.order_payment_summary (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  total_paid numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_payment_summary TO authenticated;
GRANT ALL ON public.order_payment_summary TO service_role;
ALTER TABLE public.order_payment_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage order_payment_summary" ON public.order_payment_summary FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));
