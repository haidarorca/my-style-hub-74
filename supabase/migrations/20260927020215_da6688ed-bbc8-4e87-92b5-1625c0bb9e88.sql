CREATE OR REPLACE FUNCTION public.currency_recompute_summary(_code text)
RETURNS TABLE(product_count integer, to_change integer, old_total numeric, new_total numeric, rate numeric, margin numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_rate numeric; v_margin numeric; v_code text := upper(_code);
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT c.rate, c.margin INTO v_rate, v_margin FROM public.current_currency_rate(v_code) c;
  IF v_rate IS NULL THEN RAISE EXCEPTION 'Aucun taux configuré pour %', v_code; END IF;
  RETURN QUERY
  SELECT count(*)::int,
         count(*) FILTER (WHERE p.price IS DISTINCT FROM ROUND(p.origin_price * v_rate * (1 + COALESCE(v_margin,0)/100), 0))::int,
         COALESCE(sum(p.price),0)::numeric,
         COALESCE(sum(ROUND(p.origin_price * v_rate * (1 + COALESCE(v_margin,0)/100), 0)),0)::numeric,
         v_rate, COALESCE(v_margin,0)
  FROM public.products p
  WHERE p.origin_currency_code = v_code AND p.origin_price IS NOT NULL AND p.deleted_at IS NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.apply_currency_recompute_batch(_code text, _after uuid DEFAULT NULL, _limit integer DEFAULT 1000)
RETURNS TABLE(updated integer, last_id uuid, done boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_code text := upper(_code); v_last uuid; v_n int; v_upd int;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  CREATE TEMP TABLE IF NOT EXISTS _cr_ids(id uuid) ON COMMIT DROP;
  DELETE FROM _cr_ids;
  INSERT INTO _cr_ids SELECT p.id FROM public.products p
   WHERE p.origin_currency_code = v_code AND p.origin_price IS NOT NULL AND p.deleted_at IS NULL
     AND (_after IS NULL OR p.id > _after)
   ORDER BY p.id LIMIT GREATEST(1, LEAST(_limit, 3000));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  SELECT max(id) INTO v_last FROM _cr_ids;
  -- self-write : le trigger existant recalcule prix + snapshots
  UPDATE public.products p SET origin_price = p.origin_price FROM _cr_ids i WHERE p.id = i.id;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  RETURN QUERY SELECT v_upd, v_last, (v_n < GREATEST(1, LEAST(_limit, 3000)));
END; $$;

GRANT EXECUTE ON FUNCTION public.currency_recompute_summary(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_currency_recompute_batch(text, uuid, integer) TO authenticated;

-- Produits CJ : poids/dimensions parent depuis la 1re variante renseignée ; vidéos retirées.
UPDATE public.products p SET
  weight_kg = v.weight_kg,
  length_cm = COALESCE(p.length_cm, v.length_cm),
  width_cm  = COALESCE(p.width_cm, v.width_cm),
  height_cm = COALESCE(p.height_cm, v.height_cm)
FROM (
  SELECT DISTINCT ON (pv.product_id) pv.product_id, pv.weight_kg, pv.length_cm, pv.width_cm, pv.height_cm
  FROM public.product_variants pv WHERE pv.weight_kg > 0
  ORDER BY pv.product_id, pv.created_at
) v
WHERE v.product_id = p.id AND p.source = 'cj_import' AND (p.weight_kg IS NULL OR p.weight_kg = 0);

UPDATE public.products SET video_url = NULL WHERE source = 'cj_import' AND video_url IS NOT NULL;