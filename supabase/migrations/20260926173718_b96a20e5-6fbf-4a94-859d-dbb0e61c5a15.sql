ALTER TABLE public.product_search_index ADD COLUMN IF NOT EXISTS pname text;
CREATE INDEX IF NOT EXISTS psi_category ON public.product_search_index (category_id);

CREATE OR REPLACE FUNCTION public.search_index_rebuild(p_ids uuid[])
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  INSERT INTO product_search_index AS psi (product_id, vendor_id, category_id, price, status, created_at, names, pname, cats, attrs, descr, doc, codes, updated_at)
  SELECT p.id, p.vendor_id, p.category_id, p.price, p.status::text, p.created_at,
         x.names, x.pname, x.cats, x.attrs, x.descr,
         ' ' || x.names || ' ' || x.cats || ' ' || x.attrs || ' ' || x.descr || ' ', x.codes, now()
  FROM products p
  CROSS JOIN LATERAL (
    SELECT
      search_norm(concat_ws(' ', p.name, search_jtxt(p.name_i18n), p.designation, search_jtxt(p.designation_i18n))) AS names,
      search_norm(concat_ws(' ', p.name, search_jtxt(p.name_i18n))) AS pname,
      search_norm(coalesce((SELECT string_agg(concat_ws(' ', c.name, search_jtxt(c.name_i18n)), ' ')
        FROM categories c WHERE c.id IN (
          p.category_id,
          (SELECT c1.parent_id FROM categories c1 WHERE c1.id = p.category_id),
          (SELECT c2.parent_id FROM categories c1 JOIN categories c2 ON c2.id = c1.parent_id WHERE c1.id = p.category_id))), '')) AS cats,
      search_norm(concat_ws(' ', p.brand, (SELECT b.name FROM brands b WHERE b.id = p.brand_id), p.material::text,
        search_jtxt(p.material_i18n), search_jtxt(p.specifications), search_jtxt(p.specifications_i18n),
        (SELECT string_agg(DISTINCT concat_ws(' ', v.color, v.size), ' ') FROM product_variants v WHERE v.product_id = p.id))) AS attrs,
      left(search_norm(regexp_replace(concat_ws(' ', p.description, search_jtxt(p.description_i18n)), '<[^>]+>', ' ', 'g')), 6000) AS descr,
      coalesce((SELECT array_agg(DISTINCT lower(trim(c))) FROM unnest(
        ARRAY[p.code, p.sku, p.barcode] ||
        coalesce((SELECT array_agg(v.supplier_sku) || array_agg(v.variant_ref) FROM product_variants v WHERE v.product_id = p.id), '{}'::text[])
      ) c WHERE c IS NOT NULL AND trim(c) <> ''), '{}') AS codes
  ) x
  WHERE p.id = ANY(p_ids)
  ON CONFLICT (product_id) DO UPDATE SET
    vendor_id = EXCLUDED.vendor_id, category_id = EXCLUDED.category_id, price = EXCLUDED.price, status = EXCLUDED.status,
    created_at = EXCLUDED.created_at, names = EXCLUDED.names, pname = EXCLUDED.pname, cats = EXCLUDED.cats, attrs = EXCLUDED.attrs,
    descr = EXCLUDED.descr, doc = EXCLUDED.doc, codes = EXCLUDED.codes, updated_at = now();

  INSERT INTO search_vocab (word)
  SELECT DISTINCT w FROM product_search_index i, regexp_split_to_table(i.names || ' ' || i.cats, '\s+') w
  WHERE i.product_id = ANY(p_ids) AND length(w) BETWEEN 4 AND 30 AND w !~ '[0-9]'
  ON CONFLICT DO NOTHING;
END $function$;

-- Recherche v3 : contenu produit > attributs > branche de catégories (récursive), pagination par curseur, sans plafond.
CREATE OR REPLACE FUNCTION public.search_products_v3(
  p_q text, p_vendor_ids uuid[] DEFAULT NULL, p_min numeric DEFAULT NULL, p_max numeric DEFAULT NULL,
  p_limit integer DEFAULT 20, p_after_score numeric DEFAULT NULL, p_after_id uuid DEFAULT NULL)
 RETURNS TABLE(product_id uuid, score numeric, match_kind text, total bigint, corrected text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
DECLARE
  x jsonb := search_expand(p_q);
  qn text := x->>'q';
  raw text := lower(trim(coalesce(p_q, '')));
  n int := coalesce((x->>'n')::int, 0);
  corr text := nullif(array_to_string(ARRAY(SELECT jsonb_array_elements_text(x->'corrected')), ' '), '');
  stk jsonb; allw text[]; code_ids uuid[] := '{}';
BEGIN
  IF raw = '' THEN RETURN; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('ord', ord, 'term', term, 'w', w,
           'pat', CASE WHEN pfx THEN '% ' || term || '%' ELSE '% ' || term || ' %' END,
           'cpat', CASE WHEN pfx AND length(term) >= 4 THEN '% ' || term || '%' ELSE '% ' || term || ' %' END,
           'words', to_jsonb(words))), '[]') INTO stk FROM (
    SELECT e.key::int AS ord, t->>'t' AS term, (t->>'w')::numeric AS w, (t->>'p')::boolean AS pfx,
           CASE WHEN (t->>'p')::boolean
                THEN ARRAY[t->>'t'] || ARRAY(SELECT v.word FROM search_vocab v WHERE v.word LIKE (t->>'t') || '%' LIMIT 300)
                ELSE ARRAY[t->>'t'] END AS words
    FROM jsonb_each(x->'exp') e, jsonb_array_elements(e.value) t
  ) z;

  SELECT coalesce(array_agg(DISTINCT w), '{}') INTO allw
    FROM jsonb_array_elements(stk) s, jsonb_array_elements_text(s->'words') w;

  SELECT coalesce(array_agg(i.product_id), '{}') INTO code_ids FROM product_search_index i
    WHERE i.status = 'approved' AND i.codes @> ARRAY[raw];
  IF length(raw) >= 4 AND raw !~ '\s' AND raw ~ '[0-9]' THEN
    code_ids := code_ids || ARRAY(SELECT i.product_id FROM product_search_index i
      WHERE i.status = 'approved' AND EXISTS (SELECT 1 FROM unnest(i.codes) c WHERE c LIKE raw || '%') LIMIT 500);
  END IF;

  RETURN QUERY
  WITH RECURSIVE
  tk AS MATERIALIZED (
    SELECT (s->>'ord')::int AS ord, s->>'term' AS term, (s->>'w')::numeric AS w, s->>'pat' AS pat, s->>'cpat' AS cpat
    FROM jsonb_array_elements(stk) s
  ),
  ctxt AS MATERIALIZED (
    SELECT c.id, coalesce(c.level, 1) AS lvl, ' ' || search_norm(c.name || ' ' || search_jtxt(c.name_i18n)) || ' ' AS t FROM categories c
  ),
  cm AS (
    SELECT tk.ord, ct.id, ct.lvl, max(tk.w) AS w FROM ctxt ct JOIN tk ON ct.t LIKE tk.cpat GROUP BY 1, 2, 3
  ),
  cr AS (
    SELECT cm.ord, cm.id, cm.lvl, cm.w FROM cm
    UNION ALL
    SELECT cr.ord, c.id, cr.lvl, cr.w FROM cr JOIN categories c ON c.parent_id = cr.id
  ),
  cs AS MATERIALIZED (   -- score catégorie par (terme, catégorie) : sous-sous-famille 30 > sous-famille 20 > famille 10
    SELECT ord, id AS cat_id, max((CASE WHEN lvl >= 3 THEN 30 WHEN lvl = 2 THEN 20 ELSE 10 END) * w) AS s FROM cr GROUP BY 1, 2
  ),
  t_ids AS MATERIALIZED (
    SELECT i.product_id FROM product_search_index i WHERE n > 0 AND i.toks && allw AND i.status = 'approved'
  ),
  cand AS MATERIALIZED (
    SELECT i.product_id, i.category_id, (t.product_id IS NOT NULL) AS is_txt, (i.product_id = ANY(code_ids)) AS is_code,
           ' ' || coalesce(i.pname,'') || ' ' AS pn, ' ' || coalesce(i.names,'') || ' ' AS nm,
           ' ' || coalesce(i.descr,'') || ' ' AS ds, ' ' || coalesce(i.attrs,'') || ' ' AS at, i.codes
    FROM product_search_index i
    LEFT JOIN t_ids t ON t.product_id = i.product_id
    WHERE i.status = 'approved'
      AND (t.product_id IS NOT NULL OR i.product_id = ANY(code_ids) OR i.category_id IN (SELECT cat_id FROM cs))
      AND (p_vendor_ids IS NULL OR i.vendor_id = ANY(p_vendor_ids))
      AND (p_min IS NULL OR i.price >= p_min) AND (p_max IS NULL OR i.price <= p_max)
  ),
  txt_sc AS (
    SELECT c.product_id AS pid, tk.ord,
      max((CASE WHEN c.pn LIKE tk.pat THEN 100 WHEN c.nm LIKE tk.pat THEN 80
                WHEN c.ds LIKE tk.pat THEN 60 WHEN c.at LIKE tk.pat THEN 40 ELSE 0 END) * tk.w) AS s
    FROM cand c CROSS JOIN tk WHERE c.is_txt GROUP BY 1, 2
  ),
  cat_sc AS (
    SELECT c.product_id AS pid, cs.ord, cs.s FROM cand c JOIN cs ON cs.cat_id = c.category_id
  ),
  sc AS (
    SELECT pid, ord, max(s) AS s FROM (SELECT * FROM txt_sc UNION ALL SELECT * FROM cat_sc) u WHERE s > 0 GROUP BY 1, 2
  ),
  agg AS (SELECT sc.pid, count(*)::int AS matched, sum(sc.s) AS s, min(sc.s) AS weakest FROM sc GROUP BY 1),
  lim AS (SELECT CASE WHEN max(matched) >= n THEN n ELSE greatest(1, max(matched)) END AS need FROM agg),
  txt AS (
    SELECT a.pid,
      round(a.s / greatest(n, 1)
        + CASE WHEN c.pn LIKE '% ' || qn || '%' THEN 4 ELSE 0 END
        + CASE WHEN c.pn LIKE ' ' || qn || '%' THEN 1 ELSE 0 END, 2) AS s,
      CASE WHEN a.weakest >= 85 THEN 'name' WHEN a.weakest >= 68 THEN 'designation' WHEN a.weakest >= 51 THEN 'description'
           WHEN a.weakest >= 34 THEN 'attribute' WHEN a.weakest >= 25 THEN 'category_3' WHEN a.weakest >= 17 THEN 'category_2'
           ELSE 'category_1' END AS k
    FROM agg a JOIN cand c ON c.product_id = a.pid CROSS JOIN lim WHERE a.matched >= lim.need
  ),
  codes AS (
    SELECT c.product_id AS pid, (CASE WHEN raw = ANY(c.codes) THEN 1000 ELSE 500 END)::numeric AS s, 'code' AS k FROM cand c WHERE c.is_code
  ),
  allr AS (
    SELECT DISTINCT ON (pid) pid, s, k FROM (SELECT * FROM codes UNION ALL SELECT * FROM txt) u ORDER BY pid, s DESC
  ),
  cnt AS (SELECT count(*) AS total FROM allr)
  SELECT r.pid, r.s, r.k, cnt.total, corr
  FROM allr r CROSS JOIN cnt
  WHERE p_after_score IS NULL OR r.s < p_after_score OR (r.s = p_after_score AND r.pid > p_after_id)
  ORDER BY r.s DESC, r.pid
  LIMIT greatest(1, least(coalesce(p_limit, 20), 100));
END $function$;

GRANT EXECUTE ON FUNCTION public.search_products_v3(text, uuid[], numeric, numeric, integer, numeric, uuid) TO anon, authenticated, service_role;