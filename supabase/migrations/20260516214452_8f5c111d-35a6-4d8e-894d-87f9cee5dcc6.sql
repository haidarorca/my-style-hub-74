
-- 1) PROFILES: drop the over-permissive public policy and expose a safe view
DROP POLICY IF EXISTS profiles_public_shop_read ON public.profiles;

CREATE OR REPLACE VIEW public.public_vendor_profiles
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  p.id,
  p.full_name,
  p.shop_name,
  p.shop_logo_url,
  p.shop_banner_url,
  p.shop_description,
  p.shop_description_i18n,
  p.shop_hours,
  p.shop_hours_i18n,
  p.shop_hours_schedule,
  p.address,
  p.latitude,
  p.longitude,
  p.source_country_id,
  p.ships_internationally,
  p.allowed_destination_country_ids,
  p.vendor_mode,
  p.hide_contact_publicly,
  p.is_verified,
  p.vendor_status,
  p.access_ends_at,
  p.created_at,
  p.updated_at,
  CASE WHEN p.hide_contact_publicly OR p.vendor_mode = 'commission'::public.vendor_mode
       THEN NULL ELSE p.phone END         AS phone,
  CASE WHEN p.hide_contact_publicly OR p.vendor_mode = 'commission'::public.vendor_mode
       THEN NULL ELSE p.shop_whatsapp END  AS shop_whatsapp
FROM public.profiles p
WHERE p.is_verified = true
  AND p.vendor_status = 'active'::public.vendor_account_status
  AND (p.access_ends_at IS NULL OR p.access_ends_at > now())
  AND public.has_role(p.id, 'vendeur'::public.app_role);

GRANT SELECT ON public.public_vendor_profiles TO anon, authenticated;

-- 2) REALTIME: restrict subscriptions on realtime.messages to the user's own topic
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "realtime_user_own_topic_select" ON realtime.messages;
DROP POLICY IF EXISTS "realtime_user_own_topic_insert" ON realtime.messages;

-- Allow access only when topic is one of the user's own dedicated channels.
-- Accepted topic patterns: `user:<uid>:*`, `admin-notif-<uid>`, `notif-<uid>`, `notifications:<uid>`
CREATE POLICY "realtime_user_own_topic_select"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    realtime.topic() = 'user:' || auth.uid()::text
    OR realtime.topic() LIKE 'user:' || auth.uid()::text || ':%'
    OR realtime.topic() = 'admin-notif-' || auth.uid()::text
    OR realtime.topic() = 'notif-' || auth.uid()::text
    OR realtime.topic() = 'notifications:' || auth.uid()::text
  )
);

CREATE POLICY "realtime_user_own_topic_insert"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    realtime.topic() = 'user:' || auth.uid()::text
    OR realtime.topic() LIKE 'user:' || auth.uid()::text || ':%'
    OR realtime.topic() = 'admin-notif-' || auth.uid()::text
    OR realtime.topic() = 'notif-' || auth.uid()::text
    OR realtime.topic() = 'notifications:' || auth.uid()::text
  )
);
