
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- ── Normalisation multilingue (FR/EN accents, arabe : diacritiques, alef, ta marbuta, article) ──
CREATE OR REPLACE FUNCTION public.search_norm(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, extensions AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      translate(
        regexp_replace(
          lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p,''))),
          '[\u064B-\u065F\u0670\u0640]', '', 'g'),
        'أإآٱةىؤئ', 'اااايهيوي'),
      '(^|\s)(وال|بال|ال)(\S{3,})', '\1\3', 'g'),
    '([[:punct:]]|[،؛؟«»“”’‘•·]|\s)+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.search_jtxt(j jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT coalesce((SELECT string_agg(v #>> '{}', ' ') FROM jsonb_path_query(coalesce(j,'null'::jsonb), 'strict $.** ? (@.type() == "string")') v), '')
$$;

-- ── Index de recherche (séparé de products : aucun impact sur ses règles) ──
CREATE TABLE public.product_search_index (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  vendor_id uuid, category_id uuid, price numeric, status text, created_at timestamptz,
  names text NOT NULL DEFAULT '', cats text NOT NULL DEFAULT '', attrs text NOT NULL DEFAULT '', descr text NOT NULL DEFAULT '',
  doc text NOT NULL DEFAULT '', codes text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.product_search_index TO service_role;
ALTER TABLE public.product_search_index ENABLE ROW LEVEL SECURITY;
CREATE INDEX psi_doc_trgm ON public.product_search_index USING gin (doc extensions.gin_trgm_ops);
CREATE INDEX psi_codes_gin ON public.product_search_index USING gin (codes);
CREATE INDEX psi_status ON public.product_search_index (status, created_at DESC);

CREATE TABLE public.search_vocab (word text PRIMARY KEY);
GRANT ALL ON public.search_vocab TO service_role;
ALTER TABLE public.search_vocab ENABLE ROW LEVEL SECURITY;
CREATE INDEX search_vocab_trgm ON public.search_vocab USING gin (word extensions.gin_trgm_ops);

CREATE TABLE public.search_synonyms (id bigserial PRIMARY KEY, grp int NOT NULL, term text NOT NULL, UNIQUE (grp, term));
GRANT SELECT ON public.search_synonyms TO anon, authenticated;
GRANT ALL ON public.search_synonyms TO service_role;
ALTER TABLE public.search_synonyms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Synonymes lisibles" ON public.search_synonyms FOR SELECT USING (true);
CREATE INDEX search_synonyms_term ON public.search_synonyms (term);
CREATE INDEX search_synonyms_trgm ON public.search_synonyms USING gin (term extensions.gin_trgm_ops);

INSERT INTO public.search_synonyms (grp, term)
SELECT g.ord, public.search_norm(t) FROM (VALUES
 (ARRAY['pantalon','pantalons','pants','pant','trousers','trouser','jogging','jogger','joggers','chino','بنطال','بنطلون','سروال','سراويل','بناطيل']),
 (ARRAY['jean','jeans','denim','جينز']),
 (ARRAY['chaussure','chaussures','shoe','shoes','soulier','footwear','حذاء','احذية']),
 (ARRAY['basket','baskets','sneaker','sneakers','trainers','سنيكرز']),
 (ARRAY['sport','sports','sportif','sportive','athletic','fitness','running','رياضي','رياضية','رياضة']),
 (ARRAY['robe','robes','dress','dresses','فستان','فساتين']),
 (ARRAY['femme','femmes','women','womens','woman','ladies','lady','female','feminin','نسائي','نسائية','نساء','امرأة']),
 (ARRAY['homme','hommes','men','mens','man','male','masculin','رجالي','رجالية','رجال','رجل']),
 (ARRAY['enfant','enfants','kid','kids','child','children','اطفال','طفل']),
 (ARRAY['bebe','baby','babies','رضيع']),
 (ARRAY['fille','filles','girl','girls','بنات','بنت']),
 (ARRAY['garcon','garcons','boy','boys','اولاد','ولد']),
 (ARRAY['sac','sacs','bag','bags','handbag','handbags','حقيبة','حقائب','شنطة']),
 (ARRAY['cartable','backpack','backpacks','schoolbag','ظهر']),
 (ARRAY['ecole','scolaire','school','مدرسة','مدرسي','مدرسية']),
 (ARRAY['telephone','telephones','phone','phones','smartphone','smartphones','mobile','portable','هاتف','هواتف','جوال','موبايل']),
 (ARRAY['coque','coques','case','cases','cover','etui','جراب','غطاء']),
 (ARRAY['chargeur','charger','chargers','شاحن']),
 (ARRAY['ecouteur','ecouteurs','earphone','earphones','earbuds','headphone','headphones','casque','headset','سماعة','سماعات']),
 (ARRAY['montre','montres','watch','watches','smartwatch','ساعة']),
 (ARRAY['chemise','chemises','shirt','shirts','قميص']),
 (ARRAY['tee','tshirt','تيشيرت']),
 (ARRAY['veste','vestes','jacket','jackets','blouson','جاكيت','سترة']),
 (ARRAY['manteau','manteaux','coat','coats','معطف']),
 (ARRAY['pull','pulls','sweater','sweaters','sweat','hoodie','hoodies','كنزة','هودي']),
 (ARRAY['jupe','jupes','skirt','skirts','تنورة']),
 (ARRAY['short','shorts','شورت']),
 (ARRAY['sandale','sandales','sandal','sandals','صندل']),
 (ARRAY['bijou','bijoux','jewelry','jewellery','مجوهرات']),
 (ARRAY['collier','colliers','necklace','necklaces','قلادة']),
 (ARRAY['bague','bagues','ring','rings','خاتم']),
 (ARRAY['bracelet','bracelets','سوار']),
 (ARRAY['boucle','earring','earrings','حلق','اقراط']),
 (ARRAY['lunette','lunettes','glasses','sunglasses','نظارة','نظارات']),
 (ARRAY['chapeau','chapeaux','hat','hats','casquette','cap','caps','قبعة']),
 (ARRAY['parfum','parfums','perfume','fragrance','عطر']),
 (ARRAY['maquillage','makeup','cosmetic','cosmetics','مكياج']),
 (ARRAY['cheveux','hair','perruque','wig','wigs','شعر','باروكة']),
 (ARRAY['cuisine','kitchen','مطبخ']),
 (ARRAY['jouet','jouets','toy','toys','لعبة','العاب']),
 (ARRAY['ordinateur','computer','laptop','laptops','حاسوب','كمبيوتر','لابتوب']),
 (ARRAY['lampe','lampes','lamp','lamps','light','lights','lumiere','مصباح','اضاءة']),
 (ARRAY['voiture','car','cars','auto','سيارة']),
 (ARRAY['samsung','سامسونج']),
 (ARRAY['iphone','apple','ايفون','ابل']),
 (ARRAY['bouteille','bottle','bottles','gourde','زجاجة']),
 (ARRAY['noir','black','اسود']),
 (ARRAY['blanc','white','ابيض']),
 (ARRAY['rouge','red','احمر']),
 (ARRAY['bleu','blue','ازرق']),
 (ARRAY['vert','green','اخضر']),
 (ARRAY['maillot','swimsuit','swimwear','bikini','مايوه']),
 (ARRAY['vetement','vetements','clothing','clothes','ملابس']),
 (ARRAY['pyjama','pyjamas','pajama','pajamas','بيجامة']),
 (ARRAY['chaussette','chaussettes','sock','socks','جوارب']),
 (ARRAY['ceinture','ceintures','belt','belts','حزام']),
 (ARRAY['portefeuille','wallet','wallets','محفظة']),
 (ARRAY['tapis','rug','rugs','carpet','carpets','سجادة']),
 (ARRAY['rideau','rideaux','curtain','curtains','ستارة']),
 (ARRAY['coussin','coussins','cushion','pillow','pillows','oreiller','وسادة'])
) AS s(arr) CROSS JOIN LATERAL (SELECT 0) z
CROSS JOIN LATERAL unnest(s.arr) t
CROSS JOIN LATERAL (SELECT (SELECT count(*) FROM (VALUES (1)) x) ) q
JOIN LATERAL (SELECT md5(array_to_string(s.arr, ','))) h ON true
CROSS JOIN LATERAL (SELECT ('x'||substr(md5(array_to_string(s.arr, ',')),1,7))::bit(28)::int AS ord) g
ON CONFLICT DO NOTHING;

-- ── Reconstruction de l'index pour une liste de produits ──
CREATE OR REPLACE FUNCTION public.search_index_rebuild(p_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  INSERT INTO product_search_index AS psi (product_id, vendor_id, category_id, price, status, created_at, names, cats, attrs, descr, doc, codes, updated_at)
  SELECT p.id, p.vendor_id, p.category_id, p.price, p.status::text, p.created_at,
         x.names, x.cats, x.attrs, x.descr,
         ' ' || x.names || ' ' || x.cats || ' ' || x.attrs || ' ' || x.descr || ' ', x.codes, now()
  FROM products p
  CROSS JOIN LATERAL (
    SELECT
      search_norm(concat_ws(' ', p.name, search_jtxt(p.name_i18n), p.designation, search_jtxt(p.designation_i18n))) AS names,
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
    created_at = EXCLUDED.created_at, names = EXCLUDED.names, cats = EXCLUDED.cats, attrs = EXCLUDED.attrs,
    descr = EXCLUDED.descr, doc = EXCLUDED.doc, codes = EXCLUDED.codes, updated_at = now();

  INSERT INTO search_vocab (word)
  SELECT DISTINCT w FROM product_search_index i, regexp_split_to_table(i.names || ' ' || i.cats, '\s+') w
  WHERE i.product_id = ANY(p_ids) AND length(w) BETWEEN 4 AND 30 AND w !~ '[0-9]'
  ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.search_index_rebuild(uuid[]) FROM public, anon, authenticated;

-- ── Triggers de maintenance ──
CREATE OR REPLACE FUNCTION public.trg_search_index_product() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM search_index_rebuild(ARRAY[NEW.id]); RETURN NULL; END $$;

CREATE TRIGGER search_index_product_ins AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_search_index_product();
CREATE TRIGGER search_index_product_upd AFTER UPDATE OF name, name_i18n, designation, designation_i18n, description, description_i18n,
  category_id, vendor_id, price, status, brand, brand_id, material, material_i18n, specifications, specifications_i18n, code, sku, barcode
ON public.products FOR EACH ROW EXECUTE FUNCTION public.trg_search_index_product();

CREATE OR REPLACE FUNCTION public.trg_search_index_variants_stmt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids uuid[];
BEGIN
  IF TG_OP = 'DELETE' THEN SELECT array_agg(DISTINCT product_id) INTO ids FROM old_rows;
  ELSE SELECT array_agg(DISTINCT product_id) INTO ids FROM new_rows; END IF;
  IF ids IS NOT NULL THEN PERFORM search_index_rebuild(ids); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER search_index_variants_ins AFTER INSERT ON public.product_variants
REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_search_index_variants_stmt();
CREATE TRIGGER search_index_variants_del AFTER DELETE ON public.product_variants
REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_search_index_variants_stmt();

CREATE OR REPLACE FUNCTION public.trg_search_index_variant_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM search_index_rebuild(ARRAY[NEW.product_id]); RETURN NULL; END $$;
CREATE TRIGGER search_index_variants_upd AFTER UPDATE OF color, size, supplier_sku, variant_ref ON public.product_variants
FOR EACH ROW WHEN (OLD.color IS DISTINCT FROM NEW.color OR OLD.size IS DISTINCT FROM NEW.size
  OR OLD.supplier_sku IS DISTINCT FROM NEW.supplier_sku OR OLD.variant_ref IS DISTINCT FROM NEW.variant_ref)
EXECUTE FUNCTION public.trg_search_index_variant_row();

CREATE OR REPLACE FUNCTION public.trg_search_index_category() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids uuid[];
BEGIN
  SELECT array_agg(p.id) INTO ids FROM products p WHERE p.category_id IN (
    SELECT NEW.id UNION SELECT id FROM categories WHERE parent_id = NEW.id
    UNION SELECT c2.id FROM categories c1 JOIN categories c2 ON c2.parent_id = c1.id WHERE c1.parent_id = NEW.id);
  IF ids IS NOT NULL THEN PERFORM search_index_rebuild(ids); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER search_index_category_upd AFTER UPDATE OF name, name_i18n, parent_id ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.trg_search_index_category();

-- ── Analyse de la requête : tokens, correction, synonymes ──
CREATE OR REPLACE FUNCTION public.search_expand(p_q text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  qn text := search_norm(p_q);
  tok text; t2 text; fixed text; ord int := 0;
  terms jsonb; exp jsonb := '{}'; pats text[] := '{}'; corr text[] := '{}';
  stop text[] := ARRAY['de','du','des','la','le','les','l','d','un','une','pour','en','et','a','au','aux','avec','the','for','and','of','with','to','in','من','في','مع','على'];
BEGIN
  IF qn = '' THEN RETURN jsonb_build_object('q', '', 'exp', '{}'::jsonb, 'pats', '[]'::jsonb); END IF;
  FOREACH tok IN ARRAY string_to_array(qn, ' ') LOOP
    CONTINUE WHEN tok = '' OR tok = ANY(stop);
    ord := ord + 1;
    t2 := CASE WHEN length(tok) > 4 AND tok ~ '[a-z](s|x)$' THEN left(tok, -1) ELSE tok END;
    fixed := t2;
    -- Correction orthographique si le mot n'existe nulle part (index + dictionnaire)
    IF length(t2) >= 4
       AND NOT EXISTS (SELECT 1 FROM search_synonyms s WHERE s.term LIKE t2 || '%')
       AND NOT EXISTS (SELECT 1 FROM search_vocab v WHERE v.word LIKE t2 || '%') THEN
      SELECT w INTO fixed FROM (
        SELECT s.term w, similarity(s.term, t2) sim FROM search_synonyms s WHERE s.term % t2
        UNION ALL
        SELECT v.word, similarity(v.word, t2) FROM search_vocab v WHERE v.word % t2
      ) z WHERE sim >= 0.4 ORDER BY sim DESC, length(w) LIMIT 1;
      fixed := coalesce(fixed, t2);
      IF fixed <> t2 THEN corr := corr || fixed; END IF;
    END IF;
    -- Termes : le mot (préfixe) + ses synonymes (FR/EN/AR)
    SELECT jsonb_agg(DISTINCT jsonb_build_object('t', term, 'w', w, 'p', prefix)) INTO terms FROM (
      SELECT fixed AS term, 1.0 AS w, true AS prefix
      UNION ALL
      SELECT s2.term, 0.85, length(s2.term) >= 5
      FROM search_synonyms s1 JOIN search_synonyms s2 ON s2.grp = s1.grp
      WHERE s1.term = fixed OR s1.term = fixed || 's'
         OR (length(fixed) >= 4 AND s1.term LIKE fixed || '%')
         OR (length(fixed) >= 5 AND similarity(s1.term, fixed) >= 0.55)
    ) e;
    exp := exp || jsonb_build_object(ord::text, terms);
    SELECT pats || array_agg(CASE WHEN (e->>'p')::boolean THEN '% ' || (e->>'t') || '%' ELSE '% ' || (e->>'t') || ' %' END)
      INTO pats FROM jsonb_array_elements(terms) e;
  END LOOP;
  RETURN jsonb_build_object('q', qn, 'n', ord, 'exp', exp, 'pats', to_jsonb(pats), 'corrected', to_jsonb(corr));
END $$;

-- ── Recherche produits classée ──
CREATE OR REPLACE FUNCTION public.search_products_v2(
  p_q text, p_vendor_ids uuid[] DEFAULT NULL, p_min numeric DEFAULT NULL, p_max numeric DEFAULT NULL,
  p_limit int DEFAULT 60, p_offset int DEFAULT 0)
RETURNS TABLE (product_id uuid, score numeric, match_kind text, total bigint, corrected text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  x jsonb := search_expand(p_q);
  qn text := x->>'q';
  raw text := lower(trim(coalesce(p_q, '')));
  pats text[];
  n int := coalesce((x->>'n')::int, 0);
  corr text := nullif(array_to_string(ARRAY(SELECT jsonb_array_elements_text(x->'corrected')), ' '), '');
BEGIN
  IF raw = '' THEN RETURN; END IF;
  SELECT coalesce(array_agg(v), '{}') INTO pats FROM jsonb_array_elements_text(x->'pats') v;
  RETURN QUERY
  WITH base AS (
    SELECT i.* FROM product_search_index i
    WHERE i.status = 'approved'
      AND (p_vendor_ids IS NULL OR i.vendor_id = ANY(p_vendor_ids))
      AND (p_min IS NULL OR i.price >= p_min) AND (p_max IS NULL OR i.price <= p_max)
  ),
  codes AS (
    SELECT b.product_id, CASE WHEN raw = ANY(b.codes) THEN 1000 ELSE 500 END::numeric AS s
    FROM base b
    WHERE raw = ANY(b.codes)
       OR (length(raw) >= 4 AND EXISTS (SELECT 1 FROM unnest(b.codes) c WHERE c LIKE raw || '%'))
  ),
  cand AS (
    SELECT b.* FROM base b WHERE n > 0 AND b.doc LIKE ANY(pats) LIMIT 8000
  ),
  tk AS (
    SELECT e.key::int AS ord, t->>'t' AS term, (t->>'w')::numeric AS w,
           CASE WHEN (t->>'p')::boolean THEN '% ' || (t->>'t') || '%' ELSE '% ' || (t->>'t') || ' %' END AS pat
    FROM jsonb_each(x->'exp') e, jsonb_array_elements(e.value) t
  ),
  sc AS (
    SELECT c.product_id, tk.ord, max((
      CASE WHEN (' ' || c.names || ' ') LIKE tk.pat THEN 10
           WHEN (' ' || c.cats  || ' ') LIKE tk.pat THEN 8
           WHEN (' ' || c.attrs || ' ') LIKE tk.pat THEN 5
           ELSE 2 END
      + CASE WHEN (' ' || c.names || ' ') LIKE '% ' || tk.term || ' %' THEN 2 ELSE 0 END) * tk.w) AS s
    FROM cand c JOIN tk ON c.doc LIKE tk.pat
    GROUP BY 1, 2
  ),
  agg AS (
    SELECT sc.product_id, count(*) AS matched, sum(sc.s) AS s FROM sc GROUP BY 1
  ),
  lim AS (SELECT CASE WHEN max(matched) >= n THEN n ELSE greatest(1, max(matched)) END AS need FROM agg),
  txt AS (
    SELECT a.product_id,
      (a.s + a.matched * 20
        + CASE WHEN (' ' || c.names || ' ') LIKE '% ' || qn || '%' THEN 15 ELSE 0 END
        + CASE WHEN c.names LIKE qn || '%' THEN 5 ELSE 0 END)::numeric AS s
    FROM agg a JOIN cand c USING (product_id), lim
    WHERE a.matched >= lim.need
  ),
  allr AS (
    SELECT product_id, max(s) AS s, max(k) AS k FROM (
      SELECT product_id, s, 'code' AS k FROM codes
      UNION ALL SELECT product_id, s, 'text' FROM txt
    ) u GROUP BY 1
  )
  SELECT r.product_id, r.s, r.k, count(*) OVER (), corr
  FROM allr r JOIN base b USING (product_id)
  ORDER BY r.s DESC, b.created_at DESC
  LIMIT greatest(1, least(p_limit, 200)) OFFSET greatest(0, p_offset);
END $$;
GRANT EXECUTE ON FUNCTION public.search_products_v2(text, uuid[], numeric, numeric, int, int) TO anon, authenticated;

-- ── Catégories suggérées (secondaires) ──
CREATE OR REPLACE FUNCTION public.search_categories_v2(p_q text, p_limit int DEFAULT 8)
RETURNS TABLE (id uuid, name text, name_i18n jsonb, level int, logo_url text, score int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE x jsonb := search_expand(p_q); pats text[];
BEGIN
  SELECT coalesce(array_agg(v), '{}') INTO pats FROM jsonb_array_elements_text(x->'pats') v;
  IF cardinality(pats) = 0 THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.name, c.name_i18n, c.level::int, c.logo_url,
    (SELECT count(*)::int FROM unnest(pats) pt WHERE (' ' || search_norm(c.name || ' ' || search_jtxt(c.name_i18n)) || ' ') LIKE pt) AS s
  FROM categories c
  WHERE (' ' || search_norm(c.name || ' ' || search_jtxt(c.name_i18n)) || ' ') LIKE ANY(pats)
  ORDER BY s DESC, c.level NULLS LAST, c.name
  LIMIT p_limit;
END $$;
GRANT EXECUTE ON FUNCTION public.search_categories_v2(text, int) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.search_expand(text) FROM public, anon, authenticated;

-- ── Remplissage initial ──
SELECT public.search_index_rebuild(ARRAY(SELECT id FROM public.products));
