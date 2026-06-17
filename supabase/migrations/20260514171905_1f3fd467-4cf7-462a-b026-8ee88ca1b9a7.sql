-- Prevent duplicate barcodes within a single vendor's shop
ALTER TABLE public.products
  ADD CONSTRAINT products_vendor_code_unique UNIQUE (vendor_id, code);