/** Sélection PostgREST commune pour les cartes produits du catalogue. */
export const PRODUCT_CARD_SELECT =
  "id, name, name_i18n, price, code, category_id, views_count, created_at, home_priority, home_position, home_excluded, weight_kg, length_cm, width_cm, height_cm, warranty_days, material, material_composition_items, min_order_qty, stock_status, origin_country:countries!products_origin_country_id_fkey(name, flag_emoji), profiles!products_vendor_id_profiles_fkey(source_country_id), product_images(url, position), product_variants(measurements)";
