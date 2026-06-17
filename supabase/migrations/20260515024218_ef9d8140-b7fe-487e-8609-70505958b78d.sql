ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS pending_category_request_id uuid NULL REFERENCES public.category_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_pending_cat_req
ON public.products(pending_category_request_id)
WHERE pending_category_request_id IS NOT NULL;