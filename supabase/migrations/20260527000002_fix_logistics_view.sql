-- Migration : Correction vue logistique — inclut TOUTES les commandes confirmed
-- Le probleme : la vue originale ne remontait que les commandes avec evaluation existante.
-- Solution : la vue inclut maintenant toutes les commandes confirmed, et les
-- evaluations/paiements/tracking sont crees automatiquement quand on clique "Peser".

-- ═══════════════════════════════════════════════════════════
-- 1. VUE LOGISTIQUE CORRIGÉE — Toutes les commandes confirmed
-- ═══════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.logistics_order_view;

CREATE OR REPLACE VIEW public.logistics_order_view AS
SELECT
  o.id AS order_id,
  o.status AS order_status,
  o.customer_name,
  o.customer_phone,
  o.total AS order_total,
  o.created_at AS order_created_at,
  o.archived_at,
  o.destination_country_id,
  o.shipping_service_id,

  -- Évaluation (NULL si pas encore créée)
  osa.id AS assessment_id,
  COALESCE(osa.status, 'pending_arrival') AS logistics_status,
  osa.real_weight_kg,
  osa.volumetric_weight_kg,
  osa.air_freight_fee,
  osa.service_fee,
  osa.extra_fees,
  osa.admin_comment,
  osa.parcel_photo_url,

  -- Frais total
  COALESCE(osa.air_freight_fee, 0) + COALESCE(osa.service_fee, 0) + COALESCE(osa.extra_fees, 0) AS total_shipping_fees,

  -- Paiement (NULL si pas encore créé)
  sp.id AS payment_id,
  COALESCE(sp.payment_status, 'pending') AS payment_status,
  COALESCE(sp.amount_requested, 0) AS amount_requested,
  COALESCE(sp.amount_paid, 0) AS amount_paid,
  COALESCE(sp.amount_requested, 0) - COALESCE(sp.amount_paid, 0) AS amount_remaining,
  sp.payment_method,
  sp.payment_reference,
  sp.confirmed_at,

  -- Tracking (NULL si pas encore créé)
  st.id AS tracking_id,
  st.tracking_number,
  st.carrier_name,
  st.warehouse_received_at,
  st.weighed_at,
  st.shipped_at,
  st.estimated_arrival_at,

  -- Nombre d'articles
  (SELECT COUNT(*) FROM public.order_items oi WHERE oi.order_id = o.id) AS item_count,

  -- A-t-elle des produits import/commission ? (pour filtrage métier)
  EXISTS (
    SELECT 1 FROM public.order_items oi2
    JOIN public.products p ON p.id = oi2.product_id
    JOIN public.profiles prof ON prof.id = p.vendor_id
    WHERE oi2.order_id = o.id
    AND (p.requires_international_shipping = true OR prof.vendor_mode = 'commission')
  ) AS has_import_items

FROM public.orders o
LEFT JOIN public.order_shipment_assessments osa ON osa.order_id = o.id
LEFT JOIN public.shipment_payments sp ON sp.order_shipment_assessment_id = osa.id
LEFT JOIN public.shipment_tracking st ON st.order_shipment_assessment_id = osa.id
WHERE o.archived_at IS NULL
  AND o.status = 'confirmed';

-- ═══════════════════════════════════════════════════════════
-- 2. FONCTION : Créer évaluation si elle n'existe pas
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_or_create_shipment_assessment(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  existing_id uuid;
  new_id uuid;
BEGIN
  -- Check if assessment already exists
  SELECT id INTO existing_id FROM public.order_shipment_assessments WHERE order_id = _order_id;
  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  -- Create assessment
  INSERT INTO public.order_shipment_assessments (order_id, status)
  VALUES (_order_id, 'awaiting_weighing')
  RETURNING id INTO new_id;

  -- Create payment record
  INSERT INTO public.shipment_payments (order_shipment_assessment_id, order_id, amount_requested, amount_paid, payment_status)
  VALUES (new_id, _order_id, 0, 0, 'pending');

  -- Create tracking record
  INSERT INTO public.shipment_tracking (order_shipment_assessment_id, order_id)
  VALUES (new_id, _order_id);

  RETURN new_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. FONCTION : Stats logistiques rapides
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_logistics_stats()
RETURNS TABLE (
  to_weigh bigint,
  awaiting_payment bigint,
  partial_payment bigint,
  to_ship bigint,
  shipped bigint,
  total_remaining numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.logistics_order_view WHERE logistics_status = 'awaiting_weighing'),
    (SELECT COUNT(*) FROM public.logistics_order_view WHERE payment_status = 'pending'),
    (SELECT COUNT(*) FROM public.logistics_order_view WHERE payment_status = 'partial'),
    (SELECT COUNT(*) FROM public.logistics_order_view WHERE logistics_status = 'validated'),
    (SELECT COUNT(*) FROM public.logistics_order_view WHERE logistics_status = 'shipped'),
    (SELECT COALESCE(SUM(amount_remaining), 0) FROM public.logistics_order_view WHERE amount_remaining > 0);
END;
$$;
