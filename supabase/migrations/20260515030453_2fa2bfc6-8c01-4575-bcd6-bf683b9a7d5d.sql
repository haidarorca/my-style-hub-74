DROP POLICY IF EXISTS cat_req_vendor_insert ON public.category_requests;

CREATE POLICY cat_req_vendor_insert
ON public.category_requests
FOR INSERT
WITH CHECK (
  auth.uid() = vendor_id
  AND has_role(auth.uid(), 'vendeur'::app_role)
  AND (
    parent_request_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.category_requests p
      WHERE p.id = category_requests.parent_request_id
        AND p.vendor_id = auth.uid()
    )
  )
);