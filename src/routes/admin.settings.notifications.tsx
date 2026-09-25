import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, BellOff, Pencil, Play, Plus, RefreshCw, Trash2, Volume2 } from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useNotificationPrefs } from "@/hooks/use-notification-prefs";
import { EVENT_TYPES, SOUNDS, playSound, unlockAudio } from "@/lib/notification-sound";
import {
  listReminderRules, saveReminderRule, toggleReminderRule, deleteReminderRule, runReminderEngineNow,
  listNotificationLog, type ReminderRule, type Level,
} from "@/lib/reminders.functions";

export const Route = createFileRoute("/admin/settings/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications & rappels — Admin KawZone" },
      { name: "description", content: "Réglez les sons, les notifications et les règles de rappel du Cockpit KawZone." },
      { property: "og:title", content: "Notifications & rappels — Admin KawZone" },
      { property: "og:description", content: "Sons, notifications et règles de rappel du Cockpit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PermissionGate perm="orders"><NotificationSettingsPage /></PermissionGate>,
});

const TRIGGERS: { value: ReminderRule["trigger_type"]; label: string }[] = [
  { value: "status", label: "Statut de commande" },
  { value: "payment_pending", label: "Paiement en attente" },
  { value: "paid_not_sent_cj", label: "Payée mais pas envoyée à CJ" },
  { value: "stock_issue", label: "Problème de stock CJ" },
  { value: "shipped_no_tracking", label: "Expédiée sans tracking" },
  { value: "no_admin_action", label: "Aucune action administrateur" },
];
const STATUSES = [
  ["new", "Nouvelle"], ["confirmed", "Confirmée"], ["preparing", "En préparation"], ["ready", "Prête"], ["shipped", "Expédiée"],
] as const;
const LEVELS: { value: Level; label: string; cls: string }[] = [
  { value: "info", label: "Information", cls: "bg-sky-100 text-sky-800" },
  { value: "attention", label: "Attention", cls: "bg-amber-100 text-amber-800" },
  { value: "important", label: "Important", cls: "bg-orange-100 text-orange-800" },
  { value: "critical", label: "Critique", cls: "bg-red-100 text-red-800" },
];
const UNITS = [{ v: 1, l: "minutes" }, { v: 60, l: "heures" }, { v: 1440, l: "jours" }];

function splitMinutes(m: number) {
  if (m > 0 && m % 1440 === 0) return { n: m / 1440, u: 1440 };
  if (m > 0 && m % 60 === 0) return { n: m / 60, u: 60 };
  return { n: m, u: 1 };
}
function fmtMinutes(m: number) {
  const { n, u } = splitMinutes(m);
  return `${n} ${UNITS.find((x) => x.v === u)!.l}`;
}

function NotificationSettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Notifications & rappels</h1>
        <p className="text-sm text-muted-foreground">Les notifications signalent une action à faire. Elles ne modifient jamais une commande.</p>
      </div>
      <Tabs defaultValue="sounds">
        <TabsList>
          <TabsTrigger value="sounds">Sons</TabsTrigger>
          <TabsTrigger value="rules">Règles de rappel</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>
        <TabsContent value="sounds"><SoundsPanel /></TabsContent>
        <TabsContent value="rules"><RulesPanel /></TabsContent>
        <TabsContent value="history"><HistoryPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function SoundSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm">
      {SOUNDS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  );
}

function SoundsPanel() {
  const { prefs, save } = useNotificationPrefs();
  const set = async (patch: Partial<typeof prefs>) => {
    try { await save({ ...prefs, ...patch }); } catch (e) { toast.error((e as Error).message); }
  };
  const test = (s: string) => { unlockAudio(); playSound(s, prefs.volume); };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sons du Cockpit</CardTitle>
        <CardDescription>Plusieurs commandes reçues en quelques secondes déclenchent un seul son (« 5 nouvelles commandes »). Réglages propres à votre compte.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm"><Switch checked={prefs.sound_enabled} onCheckedChange={(v) => set({ sound_enabled: v })} /> Sons activés</label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={prefs.muted} onCheckedChange={(v) => set({ muted: v })} />
            {prefs.muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />} Mode silencieux
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Volume2 className="h-4 w-4 text-muted-foreground" />
          <Slider className="max-w-xs" min={0} max={100} step={5} value={[prefs.volume]} onValueChange={([v]) => set({ volume: v })} />
          <span className="w-10 text-sm tabular-nums">{prefs.volume}%</span>
        </div>
        <div className="divide-y rounded-lg border">
          {EVENT_TYPES.map((e) => {
            const t = prefs.types[e.key] ?? {};
            const sound = t.sound ?? e.defaultSound;
            return (
              <div key={e.key} className="flex flex-wrap items-center gap-3 p-3">
                <Switch checked={t.enabled !== false} onCheckedChange={(v) => set({ types: { ...prefs.types, [e.key]: { ...t, enabled: v } } })} />
                <span className="flex-1 text-sm"><span className="mr-1">{e.icon}</span>{e.label}</span>
                {e.key !== "reminder" && (
                  <SoundSelect value={sound} onChange={(v) => set({ types: { ...prefs.types, [e.key]: { ...t, sound: v } } })} />
                )}
                <Button size="sm" variant="outline" onClick={() => test(sound)}><Play className="mr-1 h-3.5 w-3.5" />Tester</Button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Le son ne peut jouer que si KawZone est ouvert (le navigateur l'exige). Les rappels restent visibles dans la cloche et l'historique.</p>
      </CardContent>
    </Card>
  );
}

type Draft = Omit<ReminderRule, "id" | "created_at" | "updated_at"> & { id?: string };
const EMPTY: Draft = {
  name: "", trigger_type: "status", trigger_status: "new", delay_minutes: 300, frequency_minutes: 5, max_count: 5,
  level: "important", sound_enabled: true, sound: "alarm", message_template: null, enabled: true,
};

function RulesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReminderRules);
  const toggleFn = useServerFn(toggleReminderRule);
  const delFn = useServerFn(deleteReminderRule);
  const runFn = useServerFn(runReminderEngineNow);
  const { data: rules = [] } = useQuery({ queryKey: ["reminder-rules"], queryFn: () => listFn() });
  const [draft, setDraft] = useState<Draft | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["reminder-rules"] }); qc.invalidateQueries({ queryKey: ["cockpit-todo"] }); };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Règles de rappel</CardTitle>
          <CardDescription>Vérifiées par le serveur toutes les 5 minutes, même navigateur fermé. Dès que la commande change d'état, les rappels de la règle s'arrêtent.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={async () => { try { const r = await runFn(); toast.success(`Vérification faite : ${r.fired ?? 0} rappel(s) envoyé(s), ${r.resolved ?? 0} arrêté(s)`); refresh(); } catch (e) { toast.error((e as Error).message); } }}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />Vérifier maintenant
          </Button>
          <Button size="sm" onClick={() => setDraft({ ...EMPTY })}><Plus className="mr-1 h-3.5 w-3.5" />Nouvelle règle</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rules.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Aucune règle.</p>}
        {rules.map((r) => {
          const lv = LEVELS.find((l) => l.value === r.level)!;
          const trig = TRIGGERS.find((t) => t.value === r.trigger_type)?.label ?? r.trigger_type;
          const st = STATUSES.find((s) => s[0] === r.trigger_status)?.[1];
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <Switch checked={r.enabled} onCheckedChange={async (v) => { await toggleFn({ data: { id: r.id, enabled: v } }); refresh(); }} />
              <div className="min-w-[200px] flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {r.name}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${lv.cls}`}>{lv.label}</span>
                  {!r.enabled && <Badge variant="outline" className="text-[10px]">Désactivée</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {trig}{st ? ` = ${st}` : ""} · après {fmtMinutes(r.delay_minutes)} · toutes les {fmtMinutes(r.frequency_minutes)} · {r.max_count ? `max ${r.max_count}` : "illimité"} · {r.sound_enabled ? `son « ${SOUNDS.find((s) => s.key === r.sound)?.label ?? r.sound} »` : "sans son"}
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDraft({ ...r })}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={async () => { if (!confirm(`Supprimer la règle « ${r.name} » ?`)) return; await delFn({ data: { id: r.id } }); refresh(); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          );
        })}
      </CardContent>
      {draft && <RuleDialog draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); refresh(); }} />}
    </Card>
  );
}

function DurationInput({ label, minutes, onChange, min = 0 }: { label: string; minutes: number; onChange: (m: number) => void; min?: number }) {
  const { n, u } = splitMinutes(minutes);
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input type="number" min={min} className="w-24" value={n} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0) * u)} />
        <select value={u} onChange={(e) => onChange(n * Number(e.target.value))} className="h-9 rounded-md border bg-background px-2 text-sm">
          {UNITS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
        </select>
      </div>
    </div>
  );
}

function RuleDialog({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const saveFn = useServerFn(saveReminderRule);
  const [d, setD] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit() {
    if (d.frequency_minutes < 5) { toast.error("La fréquence minimale est de 5 minutes."); return; }
    setBusy(true);
    try { await saveFn({ data: d }); toast.success("Règle enregistrée"); onSaved(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{d.id ? "Modifier la règle" : "Nouvelle règle"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1"><Label>Nom</Label><Input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Commande non confirmée" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Déclencheur</Label>
              <select value={d.trigger_type} onChange={(e) => set("trigger_type", e.target.value as Draft["trigger_type"])} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {d.trigger_type === "status" && (
              <div className="space-y-1">
                <Label>Statut</Label>
                <select value={d.trigger_status ?? "new"} onChange={(e) => set("trigger_status", e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DurationInput label="Premier rappel après" minutes={d.delay_minutes} onChange={(m) => set("delay_minutes", m)} />
            <DurationInput label="Puis toutes les" minutes={d.frequency_minutes} onChange={(m) => set("frequency_minutes", m)} min={5} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nombre maximum</Label>
              <select value={d.max_count ?? "unlimited"} onChange={(e) => set("max_count", e.target.value === "unlimited" ? null : Number(e.target.value))} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                {[1, 2, 3, 4, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                <option value="unlimited">Illimité</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Niveau</Label>
              <select value={d.level} onChange={(e) => set("level", e.target.value as Level)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm"><Switch checked={d.sound_enabled} onCheckedChange={(v) => set("sound_enabled", v)} />Son</label>
            {d.sound_enabled && <><SoundSelect value={d.sound} onChange={(v) => set("sound", v)} /><Button type="button" size="sm" variant="outline" onClick={() => { unlockAudio(); playSound(d.sound, 70); }}><Play className="mr-1 h-3.5 w-3.5" />Tester</Button></>}
          </div>
          <div className="space-y-1">
            <Label>Message (facultatif)</Label>
            <Textarea rows={2} value={d.message_template ?? ""} onChange={(e) => set("message_template", e.target.value || null)} placeholder="La commande {ref} n'a toujours pas été confirmée depuis {duration}." />
            <p className="text-[11px] text-muted-foreground">{"{ref}"} = référence de la commande, {"{duration}"} = durée écoulée.</p>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={d.enabled} onCheckedChange={(v) => set("enabled", v)} />Règle activée</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={busy || d.name.trim().length < 2} onClick={submit}>{busy ? "…" : "Enregistrer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EVENT_ICON: Record<string, string> = { new_order: "🔔", reminder: "⏰", reminder_resolved: "✅", payment_confirmed: "💰", order_shipped: "🚚", stock_issue: "❌" };

function HistoryPanel() {
  const fn = useServerFn(listNotificationLog);
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["notification-log"], queryFn: () => fn({ data: { limit: 300 } }), refetchInterval: 60_000 });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Historique</CardTitle><CardDescription>Ce que le système a réellement envoyé ou arrêté.</CardDescription></CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Chargement…</p>
          : rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Aucun événement pour l'instant.</p>
          : (
            <div className="divide-y">
              {rows.map((r) => (
                <div key={r.id} className="flex gap-3 py-2 text-sm">
                  <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span>{EVENT_ICON[r.event_type] ?? "•"}</span>
                  <div className="min-w-0">
                    <div className="font-medium">{r.title}</div>
                    {r.message && <div className="text-xs text-muted-foreground">{r.message}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
      </CardContent>
    </Card>
  );
}
