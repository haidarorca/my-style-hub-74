CREATE OR REPLACE FUNCTION public.protect_order_item_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Identité de la ligne : jamais modifiable après création.
  NEW.product_id                  := OLD.product_id;
  NEW.variant_id                  := OLD.variant_id;
  NEW.unit_price                  := OLD.unit_price;
  NEW.quantity                    := OLD.quantity;

  -- Snapshots : écriture unique (NULL -> valeur), jamais de réécriture.
  NEW.sku_snapshot                := COALESCE(OLD.sku_snapshot, NEW.sku_snapshot);
  NEW.variant_label_snapshot      := COALESCE(OLD.variant_label_snapshot, NEW.variant_label_snapshot);
  NEW.unit_weight_kg              := COALESCE(OLD.unit_weight_kg, NEW.unit_weight_kg);
  NEW.total_weight_kg             := COALESCE(OLD.total_weight_kg, NEW.total_weight_kg);
  NEW.length_cm_snapshot          := COALESCE(OLD.length_cm_snapshot, NEW.length_cm_snapshot);
  NEW.width_cm_snapshot           := COALESCE(OLD.width_cm_snapshot, NEW.width_cm_snapshot);
  NEW.height_cm_snapshot          := COALESCE(OLD.height_cm_snapshot, NEW.height_cm_snapshot);
  NEW.unit_cbm                    := COALESCE(OLD.unit_cbm, NEW.unit_cbm);
  NEW.total_cbm                   := COALESCE(OLD.total_cbm, NEW.total_cbm);
  NEW.volumetric_weight_kg        := COALESCE(OLD.volumetric_weight_kg, NEW.volumetric_weight_kg);
  NEW.volumetric_divisor_snapshot := COALESCE(OLD.volumetric_divisor_snapshot, NEW.volumetric_divisor_snapshot);
  NEW.min_billable_qty_snapshot   := COALESCE(OLD.min_billable_qty_snapshot, NEW.min_billable_qty_snapshot);
  NEW.cost_price_snapshot         := COALESCE(OLD.cost_price_snapshot, NEW.cost_price_snapshot);
  NEW.cost_currency_snapshot      := COALESCE(OLD.cost_currency_snapshot, NEW.cost_currency_snapshot);
  NEW.cost_rate_snapshot          := COALESCE(OLD.cost_rate_snapshot, NEW.cost_rate_snapshot);

  -- Les 5 valeurs restantes + quantité/unité facturable et autres coûts.
  NEW.billable_qty                := COALESCE(OLD.billable_qty, NEW.billable_qty);
  NEW.billing_unit                := COALESCE(OLD.billing_unit, NEW.billing_unit);
  NEW.shipping_mode               := COALESCE(OLD.shipping_mode, NEW.shipping_mode);
  NEW.shipping_service_id         := COALESCE(OLD.shipping_service_id, NEW.shipping_service_id);
  NEW.shipping_rate_snapshot      := COALESCE(OLD.shipping_rate_snapshot, NEW.shipping_rate_snapshot);
  NEW.freight_cost                := COALESCE(OLD.freight_cost, NEW.freight_cost);
  NEW.line_total                  := COALESCE(OLD.line_total, NEW.line_total);
  NEW.purchase_cost_total         := COALESCE(OLD.purchase_cost_total, NEW.purchase_cost_total);
  NEW.other_costs                 := COALESCE(OLD.other_costs, NEW.other_costs);
  NEW.logistics_data_missing      := COALESCE(OLD.logistics_data_missing, NEW.logistics_data_missing);

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_order_item_snapshots() FROM PUBLIC, anon, authenticated;