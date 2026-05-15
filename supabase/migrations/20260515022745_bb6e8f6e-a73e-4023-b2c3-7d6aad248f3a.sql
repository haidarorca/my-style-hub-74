
CREATE TYPE public.category_request_status AS ENUM ('pending', 'approved', 'rejected', 'merged');

CREATE TABLE public.category_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL,
  level SMALLINT NOT NULL CHECK (level IN (1, 2, 3)),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  status public.category_request_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  resolved_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_category_requests_status ON public.category_requests(status);
CREATE INDEX idx_category_requests_vendor ON public.category_requests(vendor_id);

ALTER TABLE public.category_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cat_req_admin_all" ON public.category_requests
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cat_req_vendor_insert" ON public.category_requests
  FOR INSERT WITH CHECK (auth.uid() = vendor_id AND public.has_role(auth.uid(), 'vendeur'::app_role));

CREATE POLICY "cat_req_vendor_read" ON public.category_requests
  FOR SELECT USING (auth.uid() = vendor_id);

CREATE TRIGGER tg_category_requests_updated
  BEFORE UPDATE ON public.category_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
