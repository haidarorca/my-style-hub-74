
-- 1) Add weight_mode column
ALTER TABLE public.order_shipment_assessments
  ADD COLUMN IF NOT EXISTS weight_mode text
  CHECK (weight_mode IN ('declared','unknown'));

CREATE INDEX IF NOT EXISTS idx_osa_weight_mode ON public.order_shipment_assessments(weight_mode);

-- 2) Backfill existing assessments:
--    - if status already 'fees_calculated' and air_freight_fee > 0  → declared
--    - else → unknown
UPDATE public.order_shipment_assessments
SET weight_mode = CASE
  WHEN status::text = 'fees_calculated' AND COALESCE(air_freight_fee,0) > 0 THEN 'declared'
  ELSE 'unknown'
END
WHERE weight_mode IS NULL;

-- 3) For each existing international order_item where the product has a declared
--    weight AND an assessment with freight exists, fix-stamp __freight_fee and
--    __shipping_service_id in customization (idempotent: only sets if missing).
WITH intl AS (
  SELECT
    oi.id                                        AS item_id,
    oi.quantity,
    oi.unit_price,
    oi.customization,
    p.weight_kg, p.length_cm, p.width_cm, p.height_cm,
    pr.source_country_id                         AS src,
    o.destination_country_id                     AS dst,
    o.id                                         AS order_id,
    osa.air_freight_fee,
    osa.real_weight_kg                           AS osa_real_kg,
    osa.shipping_service_id,
    osa.price_per_kg_snapshot
  FROM public.order_items oi
  JOIN public.orders   o   ON o.id = oi.order_id
  JOIN public.products p   ON p.id = oi.product_id
  JOIN public.profiles pr  ON pr.id = p.vendor_id
  LEFT JOIN public.order_shipment_assessments osa ON osa.order_id = o.id
  WHERE pr.source_country_id IS NOT NULL
    AND pr.source_country_id <> o.destination_country_id
    AND COALESCE(p.weight_kg,0) > 0
    AND osa.weight_mode = 'declared'
),
calc AS (
  SELECT
    item_id,
    shipping_service_id,
    CASE
      WHEN COALESCE(price_per_kg_snapshot,0) > 0 THEN
        ROUND(
          GREATEST(
            COALESCE(weight_kg,0),
            CASE WHEN COALESCE(length_cm,0) > 0 AND COALESCE(width_cm,0) > 0 AND COALESCE(height_cm,0) > 0
                 THEN (length_cm * width_cm * height_cm) / 5000.0
                 ELSE 0 END
          ) * quantity * price_per_kg_snapshot
        )
      ELSE NULL
    END AS line_freight
  FROM intl
)
UPDATE public.order_items oi
SET customization = COALESCE(oi.customization, '{}'::jsonb)
  || jsonb_build_object(
       '__freight_fee', c.line_freight,
       '__shipping_service_id', c.shipping_service_id
     )
FROM calc c
WHERE oi.id = c.item_id
  AND c.line_freight IS NOT NULL
  AND (oi.customization->>'__freight_fee') IS NULL;
