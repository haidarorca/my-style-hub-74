
ALTER TABLE public.home_banners
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS subtitle_i18n jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_label text,
  ADD COLUMN IF NOT EXISTS cta_label_i18n jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS text_align text NOT NULL DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS text_color text NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS overlay_opacity numeric NOT NULL DEFAULT 0.35,
  ADD COLUMN IF NOT EXISTS height_mobile integer NOT NULL DEFAULT 220,
  ADD COLUMN IF NOT EXISTS height_tablet integer NOT NULL DEFAULT 320,
  ADD COLUMN IF NOT EXISTS height_desktop integer NOT NULL DEFAULT 480,
  ADD COLUMN IF NOT EXISTS object_fit text NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS focal_x numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS focal_y numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS zoom numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS rotation integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url_mobile text,
  ADD COLUMN IF NOT EXISTS image_url_tablet text;

ALTER TABLE public.home_banners
  DROP CONSTRAINT IF EXISTS home_banners_text_align_check,
  ADD CONSTRAINT home_banners_text_align_check CHECK (text_align IN ('left','center','right'));

ALTER TABLE public.home_banners
  DROP CONSTRAINT IF EXISTS home_banners_object_fit_check,
  ADD CONSTRAINT home_banners_object_fit_check CHECK (object_fit IN ('cover','contain','fill'));

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS banner_autoplay boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS banner_interval_ms integer NOT NULL DEFAULT 4500,
  ADD COLUMN IF NOT EXISTS banner_transition text NOT NULL DEFAULT 'slide',
  ADD COLUMN IF NOT EXISTS banner_show_arrows boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS banner_show_dots boolean NOT NULL DEFAULT true;

ALTER TABLE public.site_settings
  DROP CONSTRAINT IF EXISTS site_settings_banner_transition_check,
  ADD CONSTRAINT site_settings_banner_transition_check CHECK (banner_transition IN ('slide','fade'));
