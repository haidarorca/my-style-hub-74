SET statement_timeout = '600s';

-- 1) Déplacer les sous-familles restantes de « Phones & Accessories » sous « Électronique »
UPDATE public.categories c
SET parent_id = (SELECT id FROM public.categories WHERE name = 'Électronique' AND level = 1 LIMIT 1),
    level = 2
WHERE c.parent_id = (SELECT id FROM public.categories WHERE name = 'Phones & Accessories' AND level = 1 LIMIT 1);

DELETE FROM public.categories
WHERE name = 'Phones & Accessories' AND level = 1
  AND NOT EXISTS (SELECT 1 FROM public.categories k WHERE k.parent_id = categories.id)
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = categories.id);

-- 2) Recalculer les niveaux depuis la racine (Famille = 1, Sous-famille = 2, Sous-sous-famille = 3)
WITH RECURSIVE tree AS (
  SELECT id, 1 AS lvl FROM public.categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, t.lvl + 1 FROM public.categories c JOIN tree t ON c.parent_id = t.id
)
UPDATE public.categories c
SET level = t.lvl
FROM tree t
WHERE c.id = t.id AND c.level IS DISTINCT FROM t.lvl;