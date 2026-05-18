ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_products_archived_at ON public.products (archived_at) WHERE archived_at IS NOT NULL;

UPDATE public.products
SET archived_at = COALESCE(updated_at, now())
WHERE archived_at IS NULL
  AND status = 'rejected'
  AND rejection_reason = 'Archivé par l''administration';