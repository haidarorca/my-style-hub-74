/**
 * Écoute en direct les notifications Cockpit de l'admin connecté et joue
 * UN seul son par rafale (tampon de 10 s) : « 5 nouvelles commandes ».
 * Un seul onglet joue le son (verrou navigateur). Ne modifie aucune commande.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNotificationPrefs } from "@/hooks/use-notification-prefs";
import { playSound, unlockAudio, EVENT_TYPES, type EventTypeKey } from "@/lib/notification-sound";

type Incoming = { type: EventTypeKey; level: string; sound: string | null; title: string; message: string };
const LEVEL_RANK: Record<string, number> = { critical: 0, important: 1, attention: 2, info: 3 };
const WINDOW_MS = 10_000;

export function CockpitNotifier() {
  const { user, isAdmin, isSuperAdmin } = useAuth() as ReturnType<typeof useAuth> & { isAdmin?: boolean };
  const qc = useQueryClient();
  const { prefs } = useNotificationPrefs();
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const buffer = useRef<Incoming[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leader = useRef(false);

  // Débloque l'audio à la première interaction (exigence navigateur).
  useEffect(() => {
    const h = () => unlockAudio();
    window.addEventListener("pointerdown", h, { once: true });
    return () => window.removeEventListener("pointerdown", h);
  }, []);

  // Un seul onglet « leader » joue le son.
  useEffect(() => {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks) { leader.current = true; return; }
    let release: (() => void) | null = null;
    void locks.request("kz-cockpit-sound", () => new Promise<void>((resolve) => { leader.current = true; release = resolve; }));
    return () => { leader.current = false; release?.(); };
  }, []);

  useEffect(() => {
    if (!user?.id || !(isAdmin || isSuperAdmin)) return;
    const flush = () => {
      timer.current = null;
      const items = buffer.current.splice(0);
      if (!items.length) return;
      const p = prefsRef.current;
      const enabled = items.filter((i) => p.types[i.type]?.enabled !== false);
      if (!enabled.length) return;

      // Regroupement par type → un toast par type, un seul son global.
      const byType = new Map<string, Incoming[]>();
      for (const i of enabled) byType.set(i.type, [...(byType.get(i.type) ?? []), i]);
      for (const [type, list] of byType) {
        const meta = EVENT_TYPES.find((e) => e.key === type);
        if (list.length === 1) toast(list[0].title, { description: list[0].message });
        else if (type === "new_order") toast(`🔔 ${list.length} nouvelles commandes reçues`);
        else toast(`${meta?.icon ?? "🔔"} ${list.length} × ${meta?.label ?? type}`, { description: list[0].message });
      }

      if (!leader.current || !p.sound_enabled || p.muted) return;
      const top = [...enabled].sort((a, b) => (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9))[0];
      const meta = EVENT_TYPES.find((e) => e.key === top.type);
      const sound = top.type === "reminder"
        ? (top.sound ?? null)
        : (p.types[top.type]?.sound ?? top.sound ?? meta?.defaultSound ?? "bell");
      if (sound) playSound(sound, p.volume);
    };

    const channel = supabase
      .channel(`cockpit-notifier-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        const row = payload.new as { channel?: string; title: string; message: string; payload?: { type?: string; level?: string; sound?: string | null } };
        if (!row.channel?.startsWith("cockpit.")) return;
        buffer.current.push({
          type: (row.payload?.type ?? row.channel.slice(8)) as EventTypeKey,
          level: row.payload?.level ?? "info",
          sound: row.payload?.sound ?? null,
          title: row.title, message: row.message,
        });
        qc.invalidateQueries({ queryKey: ["cockpit-todo"] });
        qc.invalidateQueries({ queryKey: ["cockpit-orders"] });
        if (!timer.current) timer.current = setTimeout(flush, WINDOW_MS);
      })
      .subscribe();
    return () => { if (timer.current) clearTimeout(timer.current); void supabase.removeChannel(channel); };
  }, [user?.id, isAdmin, isSuperAdmin, qc]);

  return null;
}
