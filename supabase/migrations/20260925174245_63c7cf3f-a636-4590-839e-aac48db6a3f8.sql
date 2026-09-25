-- lovable-cron-fallback-reviewed: reminders are time-based (delay since state entry, repeat every N minutes); user requires 5-minute reminder cadence, no event can trigger them
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS retention_days integer,
  ADD COLUMN IF NOT EXISTS purge_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_orders_archived_at ON public.orders(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_purge_at ON public.orders(purge_at) WHERE purge_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_cockpit_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid
    AND role IN ('admin'::app_role, 'super_admin'::app_role) AND coalesce(is_suspended,false) = false)
$$;

-- Réglages globaux
CREATE TABLE public.cockpit_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_retention_days integer DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.cockpit_settings TO authenticated;
GRANT ALL ON public.cockpit_settings TO service_role;
ALTER TABLE public.cockpit_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cockpit_settings admin read" ON public.cockpit_settings FOR SELECT TO authenticated USING (public.is_cockpit_admin(auth.uid()));
CREATE POLICY "cockpit_settings admin update" ON public.cockpit_settings FOR UPDATE TO authenticated USING (public.is_cockpit_admin(auth.uid())) WITH CHECK (public.is_cockpit_admin(auth.uid()));
INSERT INTO public.cockpit_settings(id) VALUES (1) ON CONFLICT DO NOTHING;

-- Règles de rappel
CREATE TABLE public.reminder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('status','payment_pending','paid_not_sent_cj','stock_issue','shipped_no_tracking','no_admin_action')),
  trigger_status text,
  delay_minutes integer NOT NULL DEFAULT 300 CHECK (delay_minutes >= 0),
  frequency_minutes integer NOT NULL DEFAULT 5 CHECK (frequency_minutes >= 5),
  max_count integer CHECK (max_count IS NULL OR max_count >= 1),
  level text NOT NULL DEFAULT 'important' CHECK (level IN ('info','attention','important','critical')),
  sound_enabled boolean NOT NULL DEFAULT true,
  sound text NOT NULL DEFAULT 'alarm',
  message_template text,
  enabled boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_rules TO authenticated;
GRANT ALL ON public.reminder_rules TO service_role;
ALTER TABLE public.reminder_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reminder_rules admin all" ON public.reminder_rules FOR ALL TO authenticated USING (public.is_cockpit_admin(auth.uid())) WITH CHECK (public.is_cockpit_admin(auth.uid()));
CREATE TRIGGER trg_reminder_rules_updated BEFORE UPDATE ON public.reminder_rules FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

INSERT INTO public.reminder_rules(name, trigger_type, trigger_status, delay_minutes, frequency_minutes, max_count, level, sound, message_template) VALUES
 ('Commande non confirmée','status','new',300,5,5,'important','alarm','La commande {ref} n''a toujours pas été confirmée depuis {duration}.'),
 ('Paiement en attente','payment_pending',NULL,120,15,3,'attention','chime','La commande {ref} attend toujours son paiement depuis {duration}.'),
 ('Payée mais pas envoyée à CJ','paid_not_sent_cj',NULL,360,30,4,'critical','alarm','La commande {ref} est payée mais n''est pas envoyée à CJ depuis {duration}.'),
 ('Problème de stock','stock_issue',NULL,60,10,5,'critical','alert','La commande {ref} a un problème de stock CJ depuis {duration}.'),
 ('Commande en préparation','status','preparing',2880,60,3,'attention','chime','Commande {ref} toujours en préparation depuis {duration}.'),
 ('Tracking absent','shipped_no_tracking',NULL,1440,60,3,'attention','chime','Commande {ref} expédiée : tracking non reçu depuis {duration}.');

-- Rappels par commande
CREATE TABLE public.order_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.reminder_rules(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  next_at timestamptz NOT NULL,
  sent_count integer NOT NULL DEFAULT 0,
  max_count integer,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','active','exhausted','resolved')),
  last_sent_at timestamptz,
  resolved_at timestamptz,
  resolved_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_order_reminders_live ON public.order_reminders(rule_id, order_id) WHERE state IN ('pending','active','exhausted');
CREATE INDEX idx_order_reminders_due ON public.order_reminders(next_at) WHERE state IN ('pending','active');
CREATE INDEX idx_order_reminders_order ON public.order_reminders(order_id);
GRANT SELECT ON public.order_reminders TO authenticated;
GRANT ALL ON public.order_reminders TO service_role;
ALTER TABLE public.order_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_reminders admin read" ON public.order_reminders FOR SELECT TO authenticated USING (public.is_cockpit_admin(auth.uid()));

-- Historique
CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  order_id uuid,
  order_ref text,
  rule_id uuid,
  reminder_id uuid,
  level text NOT NULL DEFAULT 'info',
  sound text,
  title text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_log_created ON public.notification_log(created_at DESC);
CREATE INDEX idx_notification_log_order ON public.notification_log(order_id);
GRANT SELECT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_log admin read" ON public.notification_log FOR SELECT TO authenticated USING (public.is_cockpit_admin(auth.uid()));

-- Préférences
CREATE TABLE public.admin_notification_prefs (
  user_id uuid PRIMARY KEY,
  sound_enabled boolean NOT NULL DEFAULT true,
  muted boolean NOT NULL DEFAULT false,
  volume integer NOT NULL DEFAULT 70 CHECK (volume BETWEEN 0 AND 100),
  types jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.admin_notification_prefs TO authenticated;
GRANT ALL ON public.admin_notification_prefs TO service_role;
ALTER TABLE public.admin_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prefs own" ON public.admin_notification_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_cockpit_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_cockpit_admin(auth.uid()));

-- Anti-doublon notifications cockpit
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_cockpit_event ON public.notifications(user_id, event_key) WHERE channel LIKE 'cockpit.%';

-- Émission (log + notification par admin), jamais bloquante
CREATE OR REPLACE FUNCTION public.cockpit_emit(_type text, _order_id uuid, _level text, _sound text, _title text, _message text, _event_key text, _rule_id uuid DEFAULT NULL, _reminder_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ref text;
BEGIN
  SELECT reference INTO v_ref FROM orders WHERE id = _order_id;
  INSERT INTO notification_log(event_type, order_id, order_ref, rule_id, reminder_id, level, sound, title, message)
  VALUES (_type, _order_id, v_ref, _rule_id, _reminder_id, _level, _sound, _title, _message);
  INSERT INTO notifications(user_id, title, message, link, channel, payload, event_key)
  SELECT DISTINCT ur.user_id, _title, _message,
         CASE WHEN _order_id IS NULL THEN '/admin/cockpit' ELSE '/admin/cockpit?orderId=' || _order_id::text END,
         'cockpit.' || _type,
         jsonb_build_object('type', _type, 'level', _level, 'sound', _sound, 'order_id', _order_id, 'rule_id', _rule_id),
         _event_key
  FROM user_roles ur
  WHERE ur.role IN ('admin'::app_role,'super_admin'::app_role) AND coalesce(ur.is_suspended,false) = false
  ON CONFLICT (user_id, event_key) WHERE channel LIKE 'cockpit.%' DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.kz_human_duration(_i interval)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN extract(epoch FROM _i) < 3600 THEN greatest(1, floor(extract(epoch FROM _i)/60))::int || ' min'
    WHEN extract(epoch FROM _i) < 172800 THEN floor(extract(epoch FROM _i)/3600)::int || ' h'
    ELSE floor(extract(epoch FROM _i)/86400)::int || ' jours' END
$$;

-- Candidats d'une règle (état réel actuel)
CREATE OR REPLACE FUNCTION public.reminder_candidates(_rule_id uuid, _order_id uuid DEFAULT NULL)
RETURNS TABLE(order_id uuid, started_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r reminder_rules;
BEGIN
  SELECT * INTO r FROM reminder_rules WHERE id = _rule_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF r.trigger_type = 'status' THEN
    RETURN QUERY SELECT o.id, coalesce((SELECT max(h.created_at) FROM order_status_history h WHERE h.order_id = o.id AND h.to_status = o.status), o.created_at)
      FROM orders o WHERE o.archived_at IS NULL AND (_order_id IS NULL OR o.id = _order_id) AND o.status = r.trigger_status;
  ELSIF r.trigger_type = 'payment_pending' THEN
    RETURN QUERY SELECT o.id, o.created_at FROM orders o LEFT JOIN order_payment_summary p ON p.order_id = o.id
      WHERE o.archived_at IS NULL AND (_order_id IS NULL OR o.id = _order_id)
        AND o.status NOT IN ('cancelled','delivered','validated') AND coalesce(p.total_paid,0) < coalesce(o.total,0);
  ELSIF r.trigger_type = 'paid_not_sent_cj' THEN
    RETURN QUERY SELECT o.id, coalesce(p.updated_at, o.created_at) FROM orders o JOIN order_payment_summary p ON p.order_id = o.id
      WHERE o.archived_at IS NULL AND (_order_id IS NULL OR o.id = _order_id)
        AND o.status NOT IN ('cancelled') AND o.cj_order_id IS NULL AND o.total > 0 AND p.total_paid >= o.total
        AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.cj_variant_id IS NOT NULL);
  ELSIF r.trigger_type = 'stock_issue' THEN
    RETURN QUERY SELECT o.id, coalesce(o.cj_stock_checked_at, o.created_at) FROM orders o
      WHERE o.archived_at IS NULL AND (_order_id IS NULL OR o.id = _order_id)
        AND o.cj_stock_status = 'issue' AND o.cj_order_id IS NULL AND o.status <> 'cancelled';
  ELSIF r.trigger_type = 'shipped_no_tracking' THEN
    RETURN QUERY SELECT o.id, coalesce((SELECT max(h.created_at) FROM order_status_history h WHERE h.order_id = o.id AND h.to_status = 'shipped'), o.created_at)
      FROM orders o WHERE o.archived_at IS NULL AND (_order_id IS NULL OR o.id = _order_id)
        AND o.status = 'shipped' AND coalesce(o.cj_tracking_number,'') = '';
  ELSIF r.trigger_type = 'no_admin_action' THEN
    RETURN QUERY SELECT o.id, greatest(o.created_at,
        coalesce((SELECT max(h.created_at) FROM order_status_history h WHERE h.order_id = o.id), o.created_at),
        coalesce((SELECT max(e.created_at) FROM order_events e WHERE e.order_id = o.id), o.created_at))
      FROM orders o WHERE o.archived_at IS NULL AND (_order_id IS NULL OR o.id = _order_id)
        AND o.status NOT IN ('cancelled','delivered','validated');
  END IF;
END $$;

-- Moteur (idempotent, verrou global)
CREATE OR REPLACE FUNCTION public.run_reminder_engine()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r reminder_rules; rem record; v_fired int := 0; v_created int := 0; v_resolved int := 0; n int;
  v_ref text; v_msg text; v_icon text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('kz_reminder_engine')) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  UPDATE order_reminders SET state = 'resolved', resolved_at = now(), resolved_reason = 'Règle désactivée'
   WHERE state IN ('pending','active','exhausted') AND rule_id IN (SELECT id FROM reminder_rules WHERE NOT enabled);
  GET DIAGNOSTICS n = ROW_COUNT; v_resolved := v_resolved + n;

  FOR r IN SELECT * FROM reminder_rules WHERE enabled LOOP
    CREATE TEMP TABLE IF NOT EXISTS _kz_cand(order_id uuid PRIMARY KEY, started_at timestamptz) ON COMMIT DROP;
    TRUNCATE _kz_cand;
    INSERT INTO _kz_cand SELECT c.order_id, c.started_at FROM reminder_candidates(r.id, NULL) c ON CONFLICT DO NOTHING;

    FOR rem IN UPDATE order_reminders m SET state = 'resolved', resolved_at = now(), resolved_reason = 'Condition terminée — rappels arrêtés'
      WHERE m.rule_id = r.id AND m.state IN ('pending','active','exhausted')
        AND NOT EXISTS (SELECT 1 FROM _kz_cand c WHERE c.order_id = m.order_id)
      RETURNING m.id, m.order_id, m.sent_count LOOP
      v_resolved := v_resolved + 1;
      IF rem.sent_count > 0 THEN
        SELECT reference INTO v_ref FROM orders WHERE id = rem.order_id;
        INSERT INTO notification_log(event_type, order_id, order_ref, rule_id, reminder_id, level, title, message)
        VALUES ('reminder_resolved', rem.order_id, v_ref, r.id, rem.id, 'info', '✅ ' || r.name || ' — rappels arrêtés', 'Commande ' || coalesce(v_ref,'') || ' : condition terminée.');
      END IF;
    END LOOP;

    INSERT INTO order_reminders(rule_id, order_id, started_at, next_at, max_count, state)
    SELECT r.id, c.order_id, c.started_at, c.started_at + make_interval(mins => r.delay_minutes), r.max_count, 'pending'
      FROM _kz_cand c
    ON CONFLICT (rule_id, order_id) WHERE state IN ('pending','active','exhausted') DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_created := v_created + n;

    v_icon := CASE r.level WHEN 'critical' THEN '🔴' WHEN 'important' THEN '🟠' WHEN 'attention' THEN '🟡' ELSE '🔵' END;
    FOR rem IN UPDATE order_reminders m SET sent_count = m.sent_count + 1, last_sent_at = now(),
        next_at = now() + make_interval(mins => r.frequency_minutes),
        state = CASE WHEN m.max_count IS NOT NULL AND m.sent_count + 1 >= m.max_count THEN 'exhausted' ELSE 'active' END
      WHERE m.rule_id = r.id AND m.state IN ('pending','active') AND m.next_at <= now()
      RETURNING m.id, m.order_id, m.sent_count, m.started_at LOOP
      SELECT reference INTO v_ref FROM orders WHERE id = rem.order_id;
      v_msg := replace(replace(coalesce(r.message_template, 'Commande {ref} : ' || r.name || ' depuis {duration}.'),
                 '{ref}', coalesce(v_ref, 'sans référence')), '{duration}', kz_human_duration(now() - rem.started_at));
      PERFORM cockpit_emit('reminder', rem.order_id, r.level, CASE WHEN r.sound_enabled THEN r.sound ELSE NULL END,
        v_icon || ' RAPPEL — ' || upper(r.name), v_msg, 'rem:' || rem.id::text || ':' || rem.sent_count, r.id, rem.id);
      v_fired := v_fired + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('fired', v_fired, 'created', v_created, 'resolved', v_resolved);
END $$;

-- Résolution immédiate pour une commande
CREATE OR REPLACE FUNCTION public.reminders_reconcile_order(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rem record; v_ref text;
BEGIN
  FOR rem IN SELECT m.id, m.rule_id, m.sent_count, rr.name FROM order_reminders m JOIN reminder_rules rr ON rr.id = m.rule_id
     WHERE m.order_id = _order_id AND m.state IN ('pending','active','exhausted') LOOP
    IF NOT EXISTS (SELECT 1 FROM reminder_candidates(rem.rule_id, _order_id)) THEN
      UPDATE order_reminders SET state = 'resolved', resolved_at = now(), resolved_reason = 'Condition terminée — rappels arrêtés' WHERE id = rem.id AND state <> 'resolved';
      IF rem.sent_count > 0 THEN
        SELECT reference INTO v_ref FROM orders WHERE id = _order_id;
        INSERT INTO notification_log(event_type, order_id, order_ref, rule_id, reminder_id, level, title, message)
        VALUES ('reminder_resolved', _order_id, v_ref, rem.rule_id, rem.id, 'info', '✅ ' || rem.name || ' — rappels arrêtés', 'Commande ' || coalesce(v_ref,'') || ' : condition terminée.');
      END IF;
    END IF;
  END LOOP;
END $$;

-- Triggers commandes (jamais bloquants)
CREATE OR REPLACE FUNCTION public.tg_orders_cockpit_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM cockpit_emit('new_order', NEW.id, 'important', 'bell', '🔔 Nouvelle commande',
        'Commande ' || coalesce(NEW.reference, '') || ' — ' || coalesce(NEW.customer_name, 'client'), 'new:' || NEW.id::text);
    ELSE
      IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'shipped' THEN
        PERFORM cockpit_emit('order_shipped', NEW.id, 'info', 'soft', '🚚 Commande expédiée',
          'Commande ' || coalesce(NEW.reference, '') || ' expédiée.', 'shipped:' || NEW.id::text || ':' || extract(epoch FROM now())::bigint);
      END IF;
      IF NEW.cj_stock_status IS DISTINCT FROM OLD.cj_stock_status AND NEW.cj_stock_status = 'issue' THEN
        PERFORM cockpit_emit('stock_issue', NEW.id, 'critical', 'alert', '❌ Problème de stock',
          'Commande ' || coalesce(NEW.reference, '') || ' : rupture chez CJ, action requise.', 'stock:' || NEW.id::text || ':' || extract(epoch FROM now())::bigint);
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status OR NEW.cj_stock_status IS DISTINCT FROM OLD.cj_stock_status
         OR NEW.cj_order_id IS DISTINCT FROM OLD.cj_order_id OR NEW.cj_tracking_number IS DISTINCT FROM OLD.cj_tracking_number
         OR NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
        PERFORM reminders_reconcile_order(NEW.id);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'cockpit events: %', SQLERRM;
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_orders_cockpit_events AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.tg_orders_cockpit_events();

CREATE OR REPLACE FUNCTION public.tg_payment_summary_cockpit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total numeric; v_ref text; v_old numeric;
BEGIN
  BEGIN
    SELECT total, reference INTO v_total, v_ref FROM orders WHERE id = NEW.order_id;
    v_old := CASE WHEN TG_OP = 'UPDATE' THEN coalesce(OLD.total_paid,0) ELSE 0 END;
    IF v_total > 0 AND coalesce(NEW.total_paid,0) >= v_total AND v_old < v_total THEN
      PERFORM cockpit_emit('payment_confirmed', NEW.order_id, 'info', 'cash', '💰 Paiement confirmé',
        'Commande ' || coalesce(v_ref,'') || ' entièrement payée.', 'paid:' || NEW.order_id::text || ':' || extract(epoch FROM now())::bigint);
    END IF;
    PERFORM reminders_reconcile_order(NEW.order_id);
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'payment cockpit: %', SQLERRM;
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_payment_summary_cockpit AFTER INSERT OR UPDATE ON public.order_payment_summary FOR EACH ROW EXECUTE FUNCTION public.tg_payment_summary_cockpit();

-- Purge des archives expirées
CREATE OR REPLACE FUNCTION public.purge_expired_archived_orders()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_deleted int := 0; v_kept int := 0;
BEGIN
  FOR o IN SELECT id, reference, total, status FROM orders
     WHERE archived_at IS NOT NULL AND purge_at IS NOT NULL AND purge_at <= now() AND retention_days IS NOT NULL
     LIMIT 500 LOOP
    IF EXISTS (SELECT 1 FROM orders WHERE id = o.id AND cj_order_id IS NOT NULL)
       OR EXISTS (SELECT 1 FROM return_cases WHERE order_id = o.id) THEN
      v_kept := v_kept + 1;
      INSERT INTO admin_action_log(actor_id, actor_email, action, target_type, target_id, details)
      VALUES (NULL, 'système', 'order.auto_purge_skipped', 'order', o.id::text, jsonb_build_object('reference', o.reference, 'reason', 'Commande CJ ou dossier SAV lié'));
      UPDATE orders SET purge_at = NULL WHERE id = o.id;
      CONTINUE;
    END IF;
    INSERT INTO admin_action_log(actor_id, actor_email, action, target_type, target_id, details)
    VALUES (NULL, 'système', 'order.auto_purge', 'order', o.id::text, jsonb_build_object('reference', o.reference, 'total', o.total, 'status', o.status));
    DELETE FROM order_status_history WHERE order_id = o.id;
    DELETE FROM orders WHERE id = o.id;
    v_deleted := v_deleted + 1;
  END LOOP;
  RETURN jsonb_build_object('deleted', v_deleted, 'kept', v_kept);
END $$;

REVOKE ALL ON FUNCTION public.run_reminder_engine() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_archived_orders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reminders_reconcile_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reminder_candidates(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cockpit_emit(text, uuid, text, text, text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_reminder_engine() TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_archived_orders() TO service_role;

DO $$ BEGIN PERFORM cron.unschedule('kz-reminder-engine'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('kz-purge-archived-orders'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('kz-reminder-engine', '*/5 * * * *', $c$ SELECT public.run_reminder_engine(); $c$);
SELECT cron.schedule('kz-purge-archived-orders', '17 3 * * *', $c$ SELECT public.purge_expired_archived_orders(); $c$);
