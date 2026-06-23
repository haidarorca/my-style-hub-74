-- TTL: purge des notifications LUES de plus de 90 jours.
-- Les notifications non lues ne sont JAMAIS supprimées automatiquement.
CREATE OR REPLACE FUNCTION public.purge_old_read_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.notifications
    WHERE is_read = true
      AND created_at < now() - interval '90 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  RETURN deleted_count;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Supprime un éventuel job existant pour éviter les doublons.
DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-read-notifications');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'purge-old-read-notifications',
  '0 3 * * *', -- tous les jours à 03:00 UTC
  $$ SELECT public.purge_old_read_notifications(); $$
);