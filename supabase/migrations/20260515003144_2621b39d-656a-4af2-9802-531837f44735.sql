
-- Site settings (singleton)
CREATE TABLE public.site_settings (
  id text PRIMARY KEY DEFAULT 'main',
  site_name text NOT NULL DEFAULT 'KawZone',
  logo_url text,
  primary_color text NOT NULL DEFAULT '#e85d3a',
  accent_color text NOT NULL DEFAULT '#1a1a1a',
  whatsapp_number text,
  whatsapp_default_message text DEFAULT 'Bonjour, je suis intéressé par vos produits.',
  promo_bar_enabled boolean NOT NULL DEFAULT false,
  promo_bar_text text DEFAULT '',
  promo_bar_bg_color text NOT NULL DEFAULT '#000000',
  promo_bar_text_color text NOT NULL DEFAULT '#ffffff',
  hero_title text DEFAULT '',
  hero_subtitle text DEFAULT '',
  footer_text text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_singleton CHECK (id = 'main')
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_settings_public_read ON public.site_settings FOR SELECT USING (true);
CREATE POLICY site_settings_admin_write ON public.site_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.site_settings (id) VALUES ('main') ON CONFLICT DO NOTHING;

-- Home banners (carousel)
CREATE TABLE public.home_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  link_url text,
  title text,
  position integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY home_banners_public_read ON public.home_banners FOR SELECT USING (true);
CREATE POLICY home_banners_admin_write ON public.home_banners FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER home_banners_updated_at
  BEFORE UPDATE ON public.home_banners
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Storage bucket for site assets
INSERT INTO storage.buckets (id, name, public) VALUES ('site-assets', 'site-assets', true)
  ON CONFLICT DO NOTHING;

CREATE POLICY "site_assets_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'site-assets');
CREATE POLICY "site_assets_admin_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "site_assets_admin_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "site_assets_admin_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));
