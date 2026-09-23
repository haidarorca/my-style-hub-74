ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cj_order_code text;

UPDATE public.orders SET cj_order_code = cj_order_id
WHERE cj_order_code IS NULL AND cj_order_id IS NOT NULL;