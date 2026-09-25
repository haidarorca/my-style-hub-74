-- lovable-cron-fallback-reviewed: worker is armed only when an admin starts a translation job and unscheduled as soon as no job is queued/running (wake-on-enqueue, unschedule-after-drain)
SET lock_timeout = '20s';
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source_lang text,
  ADD COLUMN IF NOT EXISTS i18n_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS specifications_i18n jsonb,
  ADD COLUMN IF NOT EXISTS material_i18n jsonb,
  ADD COLUMN IF NOT EXISTS group_option_label_i18n jsonb;

CREATE OR REPLACE FUNCTION public.product_i18n_hash(_name text, _designation text, _description text, _specs jsonb, _material text, _grp text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(coalesce(_name,'')||'|'||coalesce(_designation,'')||'|'||coalesce(_description,'')||'|'||coalesce(_specs::text,'')||'|'||coalesce(_material,'')||'|'||coalesce(_grp,''))
$$;

-- Protect manual translations: any i18n value typed by a signed-in user is flagged manual.
CREATE OR REPLACE FUNCTION public.tg_products_mark_manual_i18n()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE l text; f text; newv text; oldv text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  FOREACH f IN ARRAY ARRAY['name_i18n','designation_i18n','description_i18n'] LOOP
    FOR l IN SELECT jsonb_object_keys(coalesce(to_jsonb(NEW)->f, '{}'::jsonb)) LOOP
      newv := to_jsonb(NEW)->f->>l;
      oldv := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD)->f->>l ELSE NULL END;
      IF coalesce(btrim(newv),'') <> '' AND newv IS DISTINCT FROM oldv THEN
        NEW.i18n_meta := jsonb_set(coalesce(NEW.i18n_meta,'{}'::jsonb), ARRAY[l],
          coalesce(NEW.i18n_meta->l,'{}'::jsonb) || '{"manual":true}'::jsonb, true);
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS products_mark_manual_i18n ON public.products;
CREATE TRIGGER products_mark_manual_i18n BEFORE INSERT OR UPDATE OF name_i18n, designation_i18n, description_i18n
  ON public.products FOR EACH ROW EXECUTE FUNCTION public.tg_products_mark_manual_i18n();

-- Shared dictionary for variant option names / values
CREATE TABLE IF NOT EXISTS public.translation_dictionary (
  kind text NOT NULL CHECK (kind IN ('opt_name','opt_value')),
  src_norm text NOT NULL,
  src text NOT NULL,
  tr jsonb NOT NULL DEFAULT '{}'::jsonb,
  manual jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, src_norm)
);
GRANT SELECT ON public.translation_dictionary TO anon, authenticated;
GRANT ALL ON public.translation_dictionary TO service_role;
ALTER TABLE public.translation_dictionary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dictionary readable by everyone" ON public.translation_dictionary FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.translation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','paused','cancelled','done','error')),
  langs text[] NOT NULL,
  scopes text[] NOT NULL,
  current_scope text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  failed jsonb NOT NULL DEFAULT '{}'::jsonb,
  pause_reason text,
  last_error text,
  lease_until timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
GRANT ALL ON public.translation_jobs TO service_role;
ALTER TABLE public.translation_jobs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.translation_seed_dictionary()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH vals AS (
    SELECT 'opt_value'::text AS kind, btrim(color) AS v FROM product_variants WHERE color IS NOT NULL
    UNION SELECT 'opt_value', btrim(size) FROM product_variants WHERE size IS NOT NULL
    UNION SELECT 'opt_value', btrim(e.value) FROM product_variants pv,
      jsonb_each_text(CASE WHEN jsonb_typeof(pv.cj_options)='object' THEN pv.cj_options ELSE '{}'::jsonb END) e
    UNION SELECT 'opt_name', btrim(e.key) FROM product_variants pv,
      jsonb_each_text(CASE WHEN jsonb_typeof(pv.cj_options)='object' THEN pv.cj_options ELSE '{}'::jsonb END) e
  ), d AS (
    SELECT DISTINCT ON (kind, lower(v)) kind, lower(v) AS n, v FROM vals WHERE length(v) BETWEEN 1 AND 200
  )
  INSERT INTO translation_dictionary(kind, src_norm, src) SELECT kind, n, v FROM d
  ON CONFLICT (kind, src_norm) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.translation_pending_products(_langs text[], _exclude uuid[], _limit int)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM products p
  WHERE NOT (p.id = ANY(coalesce(_exclude, '{}'::uuid[])))
    AND EXISTS (SELECT 1 FROM unnest(_langs) l
      WHERE coalesce(p.i18n_meta->l->>'hash','') <> product_i18n_hash(p.name,p.designation,p.description,p.specifications,p.material,p.group_option_label))
  ORDER BY p.created_at DESC
  LIMIT _limit
$$;

CREATE OR REPLACE FUNCTION public.translation_preview(_langs text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'products', (SELECT jsonb_build_object(
        'pending', count(*) FILTER (WHERE s),
        'total', count(*))
      FROM (SELECT EXISTS (SELECT 1 FROM unnest(_langs) l WHERE coalesce(p.i18n_meta->l->>'hash','') <> product_i18n_hash(p.name,p.designation,p.description,p.specifications,p.material,p.group_option_label)) s FROM products p) x),
    'variants', (SELECT jsonb_build_object('pending', count(*) FILTER (WHERE NOT (tr ?& _langs) AND attempts < 3), 'total', count(*)) FROM translation_dictionary),
    'categories', (SELECT jsonb_build_object('pending', count(*) FILTER (WHERE coalesce(name,'')<>'' AND (translated_hash IS DISTINCT FROM content_hash OR NOT (coalesce(name_i18n,'{}'::jsonb) ?& _langs))), 'total', count(*)) FROM categories),
    'countries', (SELECT jsonb_build_object('pending', count(*) FILTER (WHERE coalesce(name,'')<>'' AND (translated_hash IS DISTINCT FROM content_hash OR NOT (coalesce(name_i18n,'{}'::jsonb) ?& _langs))), 'total', count(*)) FROM countries),
    'shops', (SELECT jsonb_build_object('pending', count(*) FILTER (WHERE (coalesce(btrim(shop_description),'')<>'' AND NOT (coalesce(shop_description_i18n,'{}'::jsonb) ?& _langs)) OR (coalesce(btrim(shop_hours),'')<>'' AND NOT (coalesce(shop_hours_i18n,'{}'::jsonb) ?& _langs))), 'total', count(*) FILTER (WHERE coalesce(btrim(shop_description),'')<>'' OR coalesce(btrim(shop_hours),'')<>'')) FROM profiles),
    'banners', (SELECT jsonb_build_object('pending', count(*) FILTER (WHERE (coalesce(btrim(title),'')<>'' AND NOT (coalesce(title_i18n,'{}'::jsonb) ?& _langs)) OR (coalesce(btrim(subtitle),'')<>'' AND NOT (coalesce(subtitle_i18n,'{}'::jsonb) ?& _langs)) OR (coalesce(btrim(cta_label),'')<>'' AND NOT (coalesce(cta_label_i18n,'{}'::jsonb) ?& _langs))), 'total', count(*)) FROM home_banners),
    'settings', (SELECT jsonb_build_object('pending', count(*) FILTER (WHERE (coalesce(btrim(hero_title),'')<>'' AND NOT (coalesce(hero_title_i18n,'{}'::jsonb) ?& _langs)) OR (coalesce(btrim(hero_subtitle),'')<>'' AND NOT (coalesce(hero_subtitle_i18n,'{}'::jsonb) ?& _langs)) OR (coalesce(btrim(footer_text),'')<>'' AND NOT (coalesce(footer_text_i18n,'{}'::jsonb) ?& _langs)) OR (coalesce(btrim(promo_bar_text),'')<>'' AND NOT (coalesce(promo_bar_text_i18n,'{}'::jsonb) ?& _langs))), 'total', count(*)) FROM site_settings WHERE id='main')
  )
$$;

CREATE OR REPLACE FUNCTION public.translation_try_lease(_seconds int)
RETURNS SETOF public.translation_jobs LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE translation_jobs j SET lease_until = now() + make_interval(secs => _seconds),
    status = 'running', started_at = coalesce(j.started_at, now()), updated_at = now()
  WHERE j.id = (SELECT id FROM translation_jobs WHERE status IN ('queued','running')
      AND (lease_until IS NULL OR lease_until < now()) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING j.*
$$;

REVOKE ALL ON FUNCTION public.translation_seed_dictionary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.translation_pending_products(text[], uuid[], int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.translation_preview(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.translation_try_lease(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.translation_seed_dictionary() TO service_role;
GRANT EXECUTE ON FUNCTION public.translation_pending_products(text[], uuid[], int) TO service_role;
GRANT EXECUTE ON FUNCTION public.translation_preview(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.translation_try_lease(int) TO service_role;

CREATE OR REPLACE FUNCTION public.translation_disarm_worker()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='translation-worker') THEN
    PERFORM cron.unschedule('translation-worker');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.translation_arm_worker()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='translation-worker') THEN RETURN; END IF;
  PERFORM cron.schedule('translation-worker', '* * * * *', $cron$
  SELECT net.http_post(url := u, headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 55000)
  FROM unnest(ARRAY['https://project--fa78f6b9-1ce8-4e6e-8494-e0b16eb5f978.lovable.app/api/public/translation-worker','https://project--fa78f6b9-1ce8-4e6e-8494-e0b16eb5f978-dev.lovable.app/api/public/translation-worker']) AS u
  WHERE EXISTS (SELECT 1 FROM public.translation_jobs WHERE status IN ('queued','running'));
$cron$);
END $$;
REVOKE ALL ON FUNCTION public.translation_arm_worker() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.translation_disarm_worker() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.translation_arm_worker() TO service_role;
GRANT EXECUTE ON FUNCTION public.translation_disarm_worker() TO service_role;