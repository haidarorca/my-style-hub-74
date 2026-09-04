CREATE OR REPLACE FUNCTION public.guard_support_conversations_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  k text;
BEGIN
  IF v_uid IS NULL OR public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF OLD.client_id = v_uid THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      RAISE EXCEPTION 'L''identité de la conversation est immuable.';
    END IF;

    FOR k IN
      SELECT key FROM jsonb_each(to_jsonb(NEW))
      WHERE to_jsonb(NEW)->key IS DISTINCT FROM to_jsonb(OLD)->key
    LOOP
      IF k NOT IN (
        'subject','status','updated_at',
        'last_message_at','client_unread_count','client_last_read_at'
      ) THEN
        RAISE EXCEPTION 'Un client ne peut pas modifier ce champ (%).', k;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_support_conversations_update ON public.support_conversations;
CREATE TRIGGER trg_guard_support_conversations_update
BEFORE UPDATE ON public.support_conversations
FOR EACH ROW EXECUTE FUNCTION public.guard_support_conversations_update();

REVOKE EXECUTE ON FUNCTION public.guard_support_conversations_update() FROM PUBLIC, anon, authenticated;