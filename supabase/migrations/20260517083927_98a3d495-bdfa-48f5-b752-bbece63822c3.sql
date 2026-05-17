-- Admin-only metadata for products created in admin shops (e.g. dropshipping source link)
CREATE TABLE IF NOT EXISTS public.product_admin_metadata (
  product_id uuid NOT NULL PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_admin_metadata ENABLE ROW LEVEL SECURITY;

-- Only admins / super_admins can read or write this metadata.
CREATE POLICY pam_admin_all
ON public.product_admin_metadata
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_pam_updated_at
BEFORE UPDATE ON public.product_admin_metadata
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();