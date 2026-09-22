-- 1. category_classification_feedback: owner or admin only
DROP POLICY IF EXISTS "auth can read classification feedback" ON public.category_classification_feedback;
CREATE POLICY "ccf_read_own_or_admin"
ON public.category_classification_feedback
FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_super_admin(auth.uid())
);

-- 2. product_customizations: only for visible products, or vendor/admin
DROP POLICY IF EXISTS "pc_read" ON public.product_customizations;
CREATE POLICY "pc_read_visible_or_owner"
ON public.product_customizations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_customizations.product_id
      AND (
        (p.is_active = true AND p.status = 'approved'::public.product_status)
        OR p.vendor_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.is_super_admin(auth.uid())
      )
  )
);

-- 3. moderation_reason_templates: signed-in users only, enabled rows (admins keep full access)
DROP POLICY IF EXISTS "mrt_vendor_read" ON public.moderation_reason_templates;
CREATE POLICY "mrt_read_enabled_authenticated"
ON public.moderation_reason_templates
FOR SELECT TO authenticated
USING (is_enabled = true);

-- 4. currency_rates: no future-dated rates for regular users
DROP POLICY IF EXISTS "Authenticated read currency rates" ON public.currency_rates;
CREATE POLICY "currency_rates_read_effective"
ON public.currency_rates
FOR SELECT TO authenticated
USING (effective_from <= now());

-- 5. site_settings: scoped predicate + hide sender identity from anonymous visitors
DROP POLICY IF EXISTS "site_settings_public_read" ON public.site_settings;
CREATE POLICY "site_settings_public_read_main"
ON public.site_settings
FOR SELECT
USING (id = 'main');

REVOKE SELECT ON public.site_settings FROM anon;
GRANT SELECT (
  id, site_name, logo_url, primary_color, accent_color,
  whatsapp_number, whatsapp_default_message, commission_whatsapp_number,
  promo_bar_enabled, promo_bar_text, promo_bar_bg_color, promo_bar_text_color,
  hero_title, hero_subtitle, footer_text,
  hero_title_i18n, hero_subtitle_i18n, footer_text_i18n, promo_bar_text_i18n,
  banner_autoplay, banner_interval_ms, banner_transition, banner_show_arrows, banner_show_dots,
  cny_to_xof_rate, created_at, updated_at
) ON public.site_settings TO anon;