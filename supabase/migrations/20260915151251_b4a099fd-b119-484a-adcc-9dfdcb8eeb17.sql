-- ===== Groupes de produits =====
CREATE TABLE IF NOT EXISTS public.product_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  criterion_label text NOT NULL DEFAULT 'Modèle',
  cover_url text,
  show_in_catalog boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_group_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.product_groups(id) ON DELETE CASCADE,
  url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  poster_url text,
  position integer NOT NULL DEFAULT 0,
  source_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_group_media_group ON public.product_group_media(group_id, position);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.product_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_option_label text,
  ADD COLUMN IF NOT EXISTS group_position integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_individually boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_products_group ON public.products(group_id, group_position);

GRANT SELECT ON public.product_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_groups TO authenticated;
GRANT ALL ON public.product_groups TO service_role;
GRANT SELECT ON public.product_group_media TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_group_media TO authenticated;
GRANT ALL ON public.product_group_media TO service_role;

ALTER TABLE public.product_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_group_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_groups_public_read" ON public.product_groups;
CREATE POLICY "product_groups_public_read" ON public.product_groups FOR SELECT USING (true);
DROP POLICY IF EXISTS "product_groups_vendor_manage" ON public.product_groups;
CREATE POLICY "product_groups_vendor_manage" ON public.product_groups
  FOR ALL TO authenticated
  USING (vendor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (vendor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "product_group_media_public_read" ON public.product_group_media;
CREATE POLICY "product_group_media_public_read" ON public.product_group_media FOR SELECT USING (true);
DROP POLICY IF EXISTS "product_group_media_vendor_manage" ON public.product_group_media;
CREATE POLICY "product_group_media_vendor_manage" ON public.product_group_media
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.product_groups g WHERE g.id = group_id AND (g.vendor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.product_groups g WHERE g.id = group_id AND (g.vendor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))));

DROP TRIGGER IF EXISTS trg_product_groups_updated_at ON public.product_groups;
CREATE TRIGGER trg_product_groups_updated_at
  BEFORE UPDATE ON public.product_groups
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ===== Journal d'événements =====
CREATE TABLE IF NOT EXISTS public.user_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  anon_id text,
  type text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  query text,
  weight real NOT NULL DEFAULT 1,
  dwell_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.user_events TO authenticated;
GRANT SELECT, INSERT ON public.user_events TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.user_events_id_seq TO authenticated, anon;
GRANT ALL ON public.user_events TO service_role;
GRANT ALL ON SEQUENCE public.user_events_id_seq TO service_role;

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_events_insert_own" ON public.user_events;
CREATE POLICY "user_events_insert_own" ON public.user_events
  FOR INSERT TO authenticated, anon
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
DROP POLICY IF EXISTS "user_events_select_own" ON public.user_events;
CREATE POLICY "user_events_select_own" ON public.user_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_events_user ON public.user_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_anon ON public.user_events (anon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_product ON public.user_events (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_category ON public.user_events (category_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_recent ON public.user_events (created_at DESC);

-- ===== Favoris =====
CREATE TABLE IF NOT EXISTS public.favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "favorites_own" ON public.favorites;
CREATE POLICY "favorites_own" ON public.favorites
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_favorites_product ON public.favorites (product_id);

-- ===== Recommandations =====
CREATE OR REPLACE FUNCTION public.reco_category_affinity(_user uuid, _anon text)
RETURNS TABLE (category_id uuid, score double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(e.category_id, p.category_id) AS category_id,
         SUM(e.weight * exp(-EXTRACT(epoch FROM now() - e.created_at) / (86400 * 30.0)))::double precision AS score
  FROM public.user_events e
  LEFT JOIN public.products p ON p.id = e.product_id
  WHERE e.created_at > now() - interval '180 days'
    AND ((_user IS NOT NULL AND e.user_id = _user) OR (_anon IS NOT NULL AND e.anon_id = _anon))
    AND COALESCE(e.category_id, p.category_id) IS NOT NULL
  GROUP BY 1
  HAVING SUM(e.weight * exp(-EXTRACT(epoch FROM now() - e.created_at) / (86400 * 30.0))) > 0
  ORDER BY 2 DESC
  LIMIT 30;
$$;

CREATE OR REPLACE FUNCTION public.reco_trending(_limit integer DEFAULT 24)
RETURNS TABLE (product_id uuid, category_id uuid, score double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH ev AS (
    SELECT e.product_id,
           SUM(e.weight * exp(-EXTRACT(epoch FROM now() - e.created_at) / (86400 * 7.0))) AS s
    FROM public.user_events e
    WHERE e.created_at > now() - interval '14 days' AND e.product_id IS NOT NULL AND e.weight > 0
    GROUP BY 1
  )
  SELECT p.id, p.category_id,
         (COALESCE(ev.s, 0) * 3.0 + ln(1 + GREATEST(p.views_count, 0)))::double precision AS score
  FROM public.products p
  LEFT JOIN ev ON ev.product_id = p.id
  WHERE p.status = 'approved' AND p.is_active = true AND p.category_id IS NOT NULL
    AND p.deleted_at IS NULL
    AND (p.group_id IS NULL OR p.show_individually = true OR p.group_position = 0)
  ORDER BY score DESC, p.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 120));
$$;

CREATE OR REPLACE FUNCTION public.reco_products(
  _user uuid, _anon text, _limit integer DEFAULT 40, _exclude uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE (product_id uuid, category_id uuid, score double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH aff AS (SELECT * FROM public.reco_category_affinity(_user, _anon)),
  aff_max AS (SELECT GREATEST(COALESCE(MAX(score), 0), 0.0001) AS m FROM aff),
  seen AS (
    SELECT e.product_id, COUNT(*) AS n FROM public.user_events e
    WHERE e.product_id IS NOT NULL AND e.created_at > now() - interval '30 days'
      AND ((_user IS NOT NULL AND e.user_id = _user) OR (_anon IS NOT NULL AND e.anon_id = _anon))
    GROUP BY 1
  ),
  trend AS (SELECT * FROM public.reco_trending(200)),
  trend_max AS (SELECT GREATEST(COALESCE(MAX(score), 0), 0.0001) AS m FROM trend)
  SELECT p.id, p.category_id,
         (4.0 * COALESCE(aff.score, 0) / (SELECT m FROM aff_max)
          + 1.5 * COALESCE(t.score, 0) / (SELECT m FROM trend_max)
          + 0.8 * exp(-EXTRACT(epoch FROM now() - p.created_at) / (86400 * 30.0))
          - 1.2 * LEAST(COALESCE(seen.n, 0), 3) / 3.0)::double precision AS score
  FROM public.products p
  LEFT JOIN aff ON aff.category_id = p.category_id
  LEFT JOIN trend t ON t.product_id = p.id
  LEFT JOIN seen ON seen.product_id = p.id
  WHERE p.status = 'approved' AND p.is_active = true AND p.category_id IS NOT NULL
    AND p.deleted_at IS NULL
    AND (p.group_id IS NULL OR p.show_individually = true OR p.group_position = 0)
    AND NOT (p.id = ANY(COALESCE(_exclude, '{}'::uuid[])))
  ORDER BY score DESC, p.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 120));
$$;

GRANT EXECUTE ON FUNCTION public.reco_category_affinity(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reco_trending(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reco_products(uuid, text, integer, uuid[]) TO anon, authenticated, service_role;

-- ===== Affichage & page d'accueil =====
CREATE TABLE IF NOT EXISTS public.display_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','category','product')),
  scope_id uuid,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS display_presets_scope_uidx
  ON public.display_presets (scope, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT ON public.display_presets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.display_presets TO authenticated;
GRANT ALL ON public.display_presets TO service_role;
ALTER TABLE public.display_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "display_presets_public_read" ON public.display_presets;
CREATE POLICY "display_presets_public_read" ON public.display_presets FOR SELECT USING (true);
DROP POLICY IF EXISTS "display_presets_admin_write" ON public.display_presets;
CREATE POLICY "display_presets_admin_write" ON public.display_presets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.home_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('hero','categories','featured','new','popular','category')),
  title text,
  subtitle text,
  enabled boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  product_ids uuid[] NOT NULL DEFAULT '{}',
  max_items integer NOT NULL DEFAULT 8,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.home_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_sections TO authenticated;
GRANT ALL ON public.home_sections TO service_role;
ALTER TABLE public.home_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "home_sections_public_read" ON public.home_sections;
CREATE POLICY "home_sections_public_read" ON public.home_sections FOR SELECT USING (true);
DROP POLICY IF EXISTS "home_sections_admin_write" ON public.home_sections;
CREATE POLICY "home_sections_admin_write" ON public.home_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS display_presets_set_updated_at ON public.display_presets;
CREATE TRIGGER display_presets_set_updated_at BEFORE UPDATE ON public.display_presets
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
DROP TRIGGER IF EXISTS home_sections_set_updated_at ON public.home_sections;
CREATE TRIGGER home_sections_set_updated_at BEFORE UPDATE ON public.home_sections
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

INSERT INTO public.display_presets (scope, scope_id, config)
SELECT 'global', NULL, '{"imageRatio":"3/4","cardStyle":"normal","showPrice":true,"showButton":true,"showBadges":true,"showName":true,"gap":"normal","colsMobile":2,"colsDesktop":5}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.display_presets WHERE scope = 'global' AND scope_id IS NULL);

INSERT INTO public.home_sections (kind, title, position, max_items)
SELECT * FROM (VALUES
  ('hero', NULL::text, 0, 0),
  ('categories', 'Nos catégories', 1, 8),
  ('featured', 'Produits à la une', 2, 8),
  ('new', 'Nouveautés', 3, 8),
  ('popular', 'Les plus consultés', 4, 8)
) v(kind, title, position, max_items)
WHERE NOT EXISTS (SELECT 1 FROM public.home_sections);

-- ===== Mise en avant accueil =====
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS home_priority smallint,
  ADD COLUMN IF NOT EXISTS home_position smallint,
  ADD COLUMN IF NOT EXISTS home_excluded boolean NOT NULL DEFAULT false;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_home_priority_range;
ALTER TABLE public.products ADD CONSTRAINT products_home_priority_range CHECK (home_priority IS NULL OR (home_priority >= 1 AND home_priority <= 10));
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_home_position_range;
ALTER TABLE public.products ADD CONSTRAINT products_home_position_range CHECK (home_position IS NULL OR (home_position >= 1 AND home_position <= 100));
CREATE INDEX IF NOT EXISTS idx_products_home_merch ON public.products (home_excluded, home_priority, home_position);

CREATE OR REPLACE FUNCTION public.protect_product_home_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('role', true);
BEGIN
  IF v_uid IS NULL OR v_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;
  IF NEW.home_priority IS DISTINCT FROM OLD.home_priority
     OR NEW.home_position IS DISTINCT FROM OLD.home_position
     OR NEW.home_excluded IS DISTINCT FROM OLD.home_excluded THEN
    RAISE EXCEPTION 'Only admins can change homepage merchandising settings.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_product_home_fields() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_protect_product_home_fields ON public.products;
CREATE TRIGGER trg_protect_product_home_fields
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.protect_product_home_fields();

-- ===== Liens de partage =====
CREATE TABLE IF NOT EXISTS public.share_links (
  code TEXT PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  platform TEXT,
  shared_by UUID,
  click_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_share_links_product ON public.share_links(product_id);
CREATE INDEX IF NOT EXISTS idx_share_links_shared_by ON public.share_links(shared_by);
GRANT SELECT, INSERT ON public.share_links TO anon;
GRANT SELECT, INSERT ON public.share_links TO authenticated;
GRANT ALL ON public.share_links TO service_role;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Share links are publicly readable" ON public.share_links;
CREATE POLICY "Share links are publicly readable" ON public.share_links FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can create a share link" ON public.share_links;
CREATE POLICY "Anyone can create a share link" ON public.share_links FOR INSERT
  WITH CHECK (shared_by IS NULL OR shared_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.share_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL REFERENCES public.share_links(code) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'click',
  platform TEXT,
  referer TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_share_events_code ON public.share_events(code);
CREATE INDEX IF NOT EXISTS idx_share_events_created ON public.share_events(created_at DESC);
GRANT ALL ON public.share_events TO service_role;
GRANT SELECT ON public.share_events TO authenticated;
ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can read share events" ON public.share_events;
CREATE POLICY "Admins can read share events" ON public.share_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.register_share_click(_code TEXT, _referer TEXT DEFAULT NULL, _user_agent TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.share_links SET click_count = click_count + 1 WHERE code = _code;
  IF FOUND THEN
    INSERT INTO public.share_events (code, event_type, referer, user_agent)
    VALUES (_code, 'click', _referer, left(coalesce(_user_agent, ''), 400));
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_share_click(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;