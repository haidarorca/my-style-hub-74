/**
 * Sons de notification synthétisés (Web Audio) — aucun fichier externe.
 * Le navigateur exige une interaction utilisateur avant le premier son :
 * unlockAudio() est appelé au premier clic.
 */
export const SOUNDS = [
  { key: "bell", label: "Cloche" },
  { key: "chime", label: "Carillon" },
  { key: "alarm", label: "Alarme" },
  { key: "alert", label: "Alerte" },
  { key: "soft", label: "Doux" },
  { key: "cash", label: "Caisse" },
] as const;
export type SoundKey = (typeof SOUNDS)[number]["key"];

type Note = [freq: number, start: number, dur: number, type?: OscillatorType];
const PATTERNS: Record<string, Note[]> = {
  bell: [[880, 0, 0.6, "sine"], [1320, 0, 0.4, "sine"]],
  chime: [[660, 0, 0.25], [880, 0.18, 0.25], [1100, 0.36, 0.4]],
  alarm: [[980, 0, 0.15, "square"], [760, 0.18, 0.15, "square"], [980, 0.36, 0.15, "square"], [760, 0.54, 0.15, "square"]],
  alert: [[520, 0, 0.2, "sawtooth"], [520, 0.3, 0.2, "sawtooth"], [780, 0.6, 0.35, "sawtooth"]],
  soft: [[523, 0, 0.35], [659, 0.2, 0.45]],
  cash: [[1500, 0, 0.08, "triangle"], [2000, 0.1, 0.25, "triangle"]],
};

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
}

export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

export function playSound(key: string, volume = 70) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const notes = PATTERNS[key] ?? PATTERNS.bell;
  const gainMax = Math.max(0, Math.min(1, volume / 100)) * 0.35;
  const t0 = c.currentTime + 0.02;
  for (const [freq, start, dur, type] of notes) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type ?? "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0 + start);
    g.gain.exponentialRampToValueAtTime(gainMax || 0.0001, t0 + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + dur + 0.05);
  }
}

/** Types d'événements réglables dans Paramètres → Notifications. */
export const EVENT_TYPES = [
  { key: "new_order", label: "Nouvelle commande", icon: "🔔", defaultSound: "bell" },
  { key: "payment_confirmed", label: "Paiement confirmé", icon: "💰", defaultSound: "cash" },
  { key: "order_shipped", label: "Commande expédiée", icon: "🚚", defaultSound: "soft" },
  { key: "stock_issue", label: "Problème de stock", icon: "❌", defaultSound: "alert" },
  { key: "reminder", label: "Rappels (son défini par chaque règle)", icon: "⏰", defaultSound: "alarm" },
] as const;
export type EventTypeKey = (typeof EVENT_TYPES)[number]["key"];

export type NotificationPrefs = {
  sound_enabled: boolean;
  muted: boolean;
  volume: number;
  types: Partial<Record<EventTypeKey, { enabled?: boolean; sound?: string }>>;
};
export const DEFAULT_PREFS: NotificationPrefs = { sound_enabled: true, muted: false, volume: 70, types: {} };
