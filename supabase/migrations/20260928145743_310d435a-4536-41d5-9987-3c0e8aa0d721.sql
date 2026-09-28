SET statement_timeout = '600s';

CREATE OR REPLACE FUNCTION public.merge_category(_src uuid, _tgt uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_clash uuid;
  v_tgt_level int;
BEGIN
  IF _src IS NULL OR _tgt IS NULL OR _src = _tgt THEN RETURN; END IF;
  SELECT level INTO v_tgt_level FROM public.categories WHERE id = _tgt;
  IF v_tgt_level IS NULL THEN RETURN; END IF;

  UPDATE public.products SET category_id = _tgt WHERE category_id = _src;
  UPDATE public.cj_category_map SET kawzone_category_id = _tgt WHERE kawzone_category_id = _src;

  FOR r IN SELECT id, slug FROM public.categories WHERE parent_id = _src LOOP
    SELECT id INTO v_clash FROM public.categories
      WHERE parent_id = _tgt AND slug = r.slug AND id <> r.id LIMIT 1;
    IF v_clash IS NULL THEN
      UPDATE public.categories SET parent_id = _tgt, level = v_tgt_level + 1 WHERE id = r.id;
    ELSE
      PERFORM public.merge_category(r.id, v_clash);
    END IF;
  END LOOP;

  DELETE FROM public.categories WHERE id = _src
    AND NOT EXISTS (SELECT 1 FROM public.categories k WHERE k.parent_id = _src)
    AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = _src);
END $$;

REVOKE ALL ON FUNCTION public.merge_category(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_category(uuid, uuid) TO service_role;

SELECT public.merge_category('aa4b15e4-b6bd-4e2f-8af2-6d0d263dc340'::uuid, 'de1f1a13-a6ef-4b50-85ba-7ef1eb0bc721'::uuid);