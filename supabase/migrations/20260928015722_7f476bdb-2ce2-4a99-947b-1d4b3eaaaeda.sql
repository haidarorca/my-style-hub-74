CREATE OR REPLACE FUNCTION public.ensure_cj_category_path(_path text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parts text[]; seg text; parent uuid := NULL; cur uuid; lvl int := 0; s text;
BEGIN
  IF _path IS NULL OR btrim(_path) = '' THEN RETURN NULL; END IF;
  parts := regexp_split_to_array(_path, '\s*(>|›|/)\s*');
  FOREACH seg IN ARRAY parts LOOP
    seg := btrim(seg);
    CONTINUE WHEN seg = '';
    lvl := lvl + 1;
    EXIT WHEN lvl > 3;
    SELECT id INTO cur FROM categories
      WHERE level = lvl AND parent_id IS NOT DISTINCT FROM parent AND lower(btrim(name)) = lower(seg) LIMIT 1;
    IF cur IS NULL THEN
      s := trim(both '-' from regexp_replace(lower(seg), '[^a-z0-9]+', '-', 'g'));
      IF s = '' THEN s := 'cat'; END IF;
      IF EXISTS (SELECT 1 FROM categories WHERE slug = s AND parent_id IS NOT DISTINCT FROM parent) THEN
        s := s || '-cj';
      END IF;
      INSERT INTO categories(name, slug, level, parent_id) VALUES (seg, s, lvl, parent)
        ON CONFLICT DO NOTHING RETURNING id INTO cur;
      IF cur IS NULL THEN
        SELECT id INTO cur FROM categories WHERE slug = s AND parent_id IS NOT DISTINCT FROM parent AND level = lvl LIMIT 1;
      END IF;
    END IF;
    parent := cur; cur := NULL;
  END LOOP;
  RETURN parent;
END $$;
REVOKE ALL ON FUNCTION public.ensure_cj_category_path(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_cj_category_path(text) TO service_role;