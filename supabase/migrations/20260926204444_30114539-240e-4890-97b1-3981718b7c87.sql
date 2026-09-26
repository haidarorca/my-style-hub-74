-- 1) Tailles enfants perdues : la valeur était rangée dans les options CJ
--    (« Suitable For Height », « Child size », « Age »…) mais jamais copiée
--    dans la colonne taille. On la restaure sans rien inventer.
WITH cand AS (
  SELECT pv.id,
    (SELECT e.value FROM jsonb_each_text(pv.cj_options) e
      WHERE e.key ~* '(size|taille|height|stature|age|身高|年龄|尺码|尺寸)'
        AND e.value ~* '^([0-9]{2,3} ?cm|[0-9]{1,2} ?[tmy]|xs|s|m|l|xl|xxl|xxxl|[2-6]xl|[0-9]{1,3}(\.[0-9])?)$'
      LIMIT 1) AS sz,
    (SELECT string_agg(e.value, ' / ') FROM jsonb_each_text(pv.cj_options) e
      WHERE e.key !~* '(size|taille|height|stature|age|身高|年龄|尺码|尺寸)') AS rest
  FROM product_variants pv
  WHERE pv.size IS NULL AND pv.cj_options IS NOT NULL
)
UPDATE public.product_variants pv
SET size = c.sz,
    color = COALESCE(NULLIF(c.rest, ''), pv.color)
FROM cand c
WHERE c.id = pv.id AND c.sz IS NOT NULL;

-- 2) Taille et couleur inversées (« Navy Blue » en taille, « 2T » en couleur).
UPDATE public.product_variants pv
SET size = pv.color, color = pv.size
WHERE pv.size IS NOT NULL AND pv.color IS NOT NULL
  AND pv.color ~* '^([0-9]{2,3} ?cm|[0-9]{1,2} ?[TMY]|XS|S|M|L|XL|XXL|[2-6]XL)$'
  AND pv.size !~* '^([0-9]{2,3} ?cm|[0-9]{1,2} ?[tmy]|xs|s|m|l|xl|xxl|xxxl|[2-6]xl|[0-9]{1,3}(\.[0-9])?|one size|free size)$';