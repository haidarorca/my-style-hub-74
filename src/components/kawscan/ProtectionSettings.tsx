import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Crosshair, KeyRound, Loader2, MapPin, RotateCcw, Save, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ProtectionMode } from "@/lib/kawscan/session";
import type { LatLng, ZoneMapHandle } from "./ZoneMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ZoneMap = lazy(() => import("./ZoneMap"));

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
// Colonnes récentes, non encore présentes dans le typage généré.
const db = supabase as unknown as { from: (t: string) => any };

const DURATIONS = [5, 10, 15, 30, 60];
const MODES: { v: ProtectionMode; label: string; hint: string }[] = [
  { v: "none", label: "Protection désactivée", hint: "Tout le monde peut voir les prix en scannant le QR." },
  { v: "gps", label: "Zone GPS", hint: "Le client doit se trouver dans la boutique." },
  { v: "code", label: "Code", hint: "Le client entre un code donné par votre personnel." },
  { v: "gps_code", label: "Zone GPS + Code", hint: "Les deux à la fois." },
];

type Op = "+" | "*";
type Settings = {
  protection_mode: ProtectionMode;
  zone_polygon: LatLng[] | null;
  code_period_minutes: number;
  session_max_minutes: number;
  code_op1: Op;
  code_n1: number;
  code_op2: Op | null;
  code_n2: number | null;
};
type View = "main" | "zone" | "code" | "sessions";

const opSym = (o: Op) => (o === "*" ? "×" : "+");
export function applyFormula(h: number, s: Pick<Settings, "code_op1" | "code_n1" | "code_op2" | "code_n2">) {
  const r1 = s.code_op1 === "*" ? h * s.code_n1 : h + s.code_n1;
  if (!s.code_op2 || s.code_n2 == null) return r1;
  return s.code_op2 === "*" ? r1 * s.code_n2 : r1 + s.code_n2;
}
function formulaText(s: Settings, h?: number) {
  const base = h ?? "Heure";
  const first = `${base} ${opSym(s.code_op1)} ${s.code_n1}`;
  if (!s.code_op2 || s.code_n2 == null) return first;
  const wrap = s.code_op1 === "+" && s.code_op2 === "*" ? `(${first})` : first;
  return `${wrap} ${opSym(s.code_op2)} ${s.code_n2}`;
}

function rectAround([lat, lng]: LatLng, m = 20): LatLng[] {
  const dLat = m / 110540;
  const dLng = m / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[lat + dLat, lng - dLng], [lat + dLat, lng + dLng], [lat - dLat, lng + dLng], [lat - dLat, lng - dLng]];
}

function Chips({ value, onChange, custom }: { value: number; onChange: (n: number) => void; custom?: boolean }) {
  const isCustom = !DURATIONS.includes(value);
  return (
    <div className="flex flex-wrap gap-2">
      {DURATIONS.map((d) => (
        <button key={d} type="button" onClick={() => onChange(d)}
          className={`h-10 rounded-full border px-4 text-sm font-medium ${value === d ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
          {d} min
        </button>
      ))}
      {custom && (
        <div className="flex items-center gap-1">
          <Input type="number" min={2} max={240} className={`h-10 w-20 ${isCustom ? "border-primary" : ""}`} placeholder="Autre"
            value={isCustom ? value : ""} onChange={(e) => { const n = Number(e.target.value); if (n >= 2 && n <= 240) onChange(n); }} />
          <span className="text-xs text-muted-foreground">min</span>
        </div>
      )}
    </div>
  );
}

function OpPicker({ value, onChange }: { value: Op; onChange: (o: Op) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border">
      {(["+", "*"] as Op[]).map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} aria-label={o === "*" ? "multiplier" : "ajouter"}
          className={`h-11 w-12 text-lg font-bold ${value === o ? "bg-primary text-primary-foreground" : "bg-background"}`}>
          {opSym(o)}
        </button>
      ))}
    </div>
  );
}

/** En-tête de sous-écran : un seul bouton Retour, clair et accessible au pouce. */
function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" className="h-11 gap-1 px-2" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" /> Retour
      </Button>
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
}

function Row({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border bg-background p-4 text-left active:bg-accent">
      <span className="text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </button>
  );
}

export function ProtectionSettings({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const [s, setS] = useState<Settings | null>(null);
  const [view, setView] = useState<View>("main");
  const [saving, setSaving] = useState(false);
  const [here, setHere] = useState<LatLng | null>(null);
  const [mounted, setMounted] = useState(false);
  const mapHandle = useRef<ZoneMapHandle | null>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);

  const q = useQuery({
    queryKey: ["kawscan-protection", storeId],
    queryFn: async () => {
      const { data, error } = await db.from("kawscan_stores")
        .select("protection_mode, zone_polygon, code_period_minutes, session_max_minutes, code_op1, code_n1, code_op2, code_n2")
        .eq("id", storeId).single();
      if (error) throw error;
      return data as Settings;
    },
  });
  useEffect(() => { if (q.data && !s) setS(q.data); }, [q.data, s]);
  const sessionsCount = useSessions(storeId, !!q.data && q.data.protection_mode !== "none").data?.length ?? 0;

  if (!s) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  const needsGps = s.protection_mode === "gps" || s.protection_mode === "gps_code";
  const needsCode = s.protection_mode === "code" || s.protection_mode === "gps_code";
  const zone = s.zone_polygon ?? [];

  function locateMe() {
    if (!navigator.geolocation) return toast.error("Localisation indisponible sur cet appareil.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c: LatLng = [p.coords.latitude, p.coords.longitude];
        setHere(c);
        setS((o) => (o ? { ...o, zone_polygon: rectAround(c) } : o));
      },
      () => toast.error("Autorisez la localisation pour placer votre boutique."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function resetZone() {
    const c = mapHandle.current?.center() ?? here ?? zone[0] ?? null;
    if (!c) return locateMe();
    setS((o) => (o ? { ...o, zone_polygon: rectAround(c) } : o));
  }

  async function save(msg = "Paramètres enregistrés") {
    if (!s) return false;
    if (needsGps && zone.length < 3) {
      toast.error("Définissez d'abord la zone de votre boutique.");
      setView("zone");
      return false;
    }
    setSaving(true);
    const { error } = await db.from("kawscan_stores").update({
      protection_mode: s.protection_mode,
      zone_polygon: s.zone_polygon,
      code_period_minutes: s.code_period_minutes,
      session_max_minutes: s.session_max_minutes,
      code_op1: s.code_op1,
      code_n1: s.code_n1,
      code_op2: s.code_op2,
      code_n2: s.code_op2 ? (s.code_n2 ?? 0) : null,
    }).eq("id", storeId);
    setSaving(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: ["kawscan-protection", storeId] });
    void qc.invalidateQueries({ queryKey: ["kawscan-code", storeId] });
    return true;
  }

  const saveBtn = (label: string, msg?: string, disabled = false) => (
    <Button className="h-12 w-full" onClick={() => void save(msg)} disabled={saving || disabled}>
      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
      {label}
    </Button>
  );

  if (view === "zone") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <SubHeader title="Zone de la boutique" onBack={() => setView("main")} />
        <ol className="space-y-1 rounded-xl bg-muted p-3 text-sm">
          <li>1. Placez-vous dans la boutique et appuyez sur <b>Ma position</b>.</li>
          <li>2. Basculez en <b>Satellite</b> (bouton en haut à droite) pour repérer votre magasin, puis déplacez les points <b>1, 2, 3, 4</b> avec le doigt aux coins. Le marqueur 📍 central déplace toute la zone.</li>
          <li>3. Appuyez sur <b>Enregistrer la zone</b>.</li>
        </ol>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" className="h-11" onClick={locateMe}><Crosshair className="mr-2 h-4 w-4" />Ma position</Button>
          <Button type="button" variant="outline" className="h-11" onClick={resetZone}><RotateCcw className="mr-2 h-4 w-4" />Refaire la zone</Button>
        </div>
        {mounted && (
          <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-muted" />}>
            <ZoneMap value={zone} center={here} handleRef={mapHandle} onChange={(v) => setS((o) => (o ? { ...o, zone_polygon: v } : o))} />
          </Suspense>
        )}
        {zone.length < 3 && <p className="text-sm text-muted-foreground">Aucune zone : appuyez sur « Ma position » ou « Refaire la zone ».</p>}
        {saveBtn("Enregistrer la zone", "Zone enregistrée", zone.length < 3)}
      </div>
    );
  }

  if (view === "code") {
    const h = new Date().getHours();
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <SubHeader title="Code du magasin" onBack={() => setView("main")} />
        <section className="space-y-3 rounded-xl border bg-background p-4">
          <p className="text-sm font-semibold">Formule du code</p>
          <div className="flex flex-col items-start gap-2">
            <span className="rounded-lg bg-muted px-4 py-2 text-sm font-semibold">Heure (ex. 13h05 → 13)</span>
            <span className="ps-4 text-muted-foreground">↓</span>
            <div className="flex items-center gap-2">
              <OpPicker value={s.code_op1} onChange={(o) => setS({ ...s, code_op1: o })} />
              <Input type="number" inputMode="numeric" min={0} max={9999} className="h-11 w-24 text-lg" value={s.code_n1}
                onChange={(e) => setS({ ...s, code_n1: Math.max(0, Math.min(9999, Number(e.target.value) || 0)) })} />
            </div>
            <span className="ps-4 text-muted-foreground">↓</span>
            {s.code_op2 ? (
              <div className="flex items-center gap-2">
                <OpPicker value={s.code_op2} onChange={(o) => setS({ ...s, code_op2: o })} />
                <Input type="number" inputMode="numeric" min={0} max={9999} className="h-11 w-24 text-lg" value={s.code_n2 ?? 0}
                  onChange={(e) => setS({ ...s, code_n2: Math.max(0, Math.min(9999, Number(e.target.value) || 0)) })} />
                <Button variant="ghost" size="sm" onClick={() => setS({ ...s, code_op2: null, code_n2: null })}>Retirer</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setS({ ...s, code_op2: "+", code_n2: 5 })}>+ Ajouter une 2ᵉ opération</Button>
            )}
          </div>
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p>Exemple à {h}h : <b>{formulaText(s, h)} = {applyFormula(h, s)}</b></p>
            <p className="text-xs text-muted-foreground">Calcul dans l'ordre affiché. Le code est automatiquement recalculé au changement d'heure.</p>
          </div>
        </section>
        <section className="space-y-3 rounded-xl border bg-background p-4">
          <p className="text-sm font-semibold">Durée de validité du code</p>
          <p className="text-xs text-muted-foreground">Après le changement d'heure, l'ancien code reste accepté pendant cette durée (pour ne pas bloquer un client servi juste avant).</p>
          <Chips value={s.code_period_minutes} onChange={(n) => setS({ ...s, code_period_minutes: n })} custom />
        </section>
        {saveBtn("Enregistrer le code", "Formule enregistrée")}
        <CurrentCode storeId={storeId} />
      </div>
    );
  }

  if (view === "sessions") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <SubHeader title="Sessions actives" onBack={() => setView("main")} />
        <ActiveSessions storeId={storeId} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">KawScan — Protection des prix</h2>
      </div>

      <section className="space-y-2 rounded-xl border bg-background p-4">
        <p className="text-sm font-semibold">Mode de protection</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODES.map((m) => (
            <label key={m.v} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${s.protection_mode === m.v ? "border-primary bg-primary/5" : ""}`}>
              <input type="radio" name="kawscan-mode" className="mt-1" checked={s.protection_mode === m.v}
                onChange={() => setS({ ...s, protection_mode: m.v })} />
              <span>
                <span className="block text-sm font-medium">{m.label}</span>
                <span className="block text-xs text-muted-foreground">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {needsGps && (
        <Row icon={<MapPin className="h-5 w-5" />} title="Zone de la boutique"
          sub={zone.length >= 3 ? "Zone définie — toucher pour modifier" : "À définir sur la carte"} onClick={() => setView("zone")} />
      )}
      {needsCode && (
        <Row icon={<KeyRound className="h-5 w-5" />} title="Code du magasin"
          sub={`${formulaText(s)} · validité ${s.code_period_minutes} min`} onClick={() => setView("code")} />
      )}

      {s.protection_mode !== "none" && (
        <section className="space-y-3 rounded-xl border bg-background p-4">
          <p className="text-sm font-semibold">Durée maximale d'une session</p>
          <Chips value={s.session_max_minutes} onChange={(n) => setS({ ...s, session_max_minutes: n })} />
        </section>
      )}

      {saveBtn("Enregistrer les paramètres")}

      {needsCode && q.data && q.data.protection_mode !== "none" && <CurrentCode storeId={storeId} />}

      {q.data && q.data.protection_mode !== "none" && (
        <Row icon={<Users className="h-5 w-5" />} title={`Sessions actives : ${sessionsCount}`}
          sub="Voir et fermer les sessions ouvertes" onClick={() => setView("sessions")} />
      )}
    </div>
  );
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
const mmss = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const minSec = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)} min ${String(t % 60).padStart(2, "0")} s`;
};

function CurrentCode({ storeId }: { storeId: string }) {
  const now = useNow();
  const q = useQuery({
    queryKey: ["kawscan-code", storeId],
    queryFn: async () => {
      const { data, error } = await rpc("kawscan_current_code", { _store_id: storeId });
      if (error) throw new Error(error.message);
      const d = data as { code: string; hour: number; server_now: string; next_change_at: string };
      // Décalage horloge serveur / téléphone : le compte à rebours suit l'heure du serveur.
      return { ...d, skew: new Date(d.server_now).getTime() - Date.now() };
    },
    refetchInterval: (query) => {
      const d = query.state.data;
      return d ? Math.max(1000, new Date(d.next_change_at).getTime() - (Date.now() + d.skew) + 1000) : 30000;
    },
  });
  if (!q.data) return null;
  return (
    <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-center">
      <p className="text-sm font-medium">Code actuel à donner aux clients</p>
      <p className="my-1 font-mono text-5xl font-bold tracking-widest">{q.data.code}</p>
      <p className="text-xs text-muted-foreground">
        Prochain changement dans {minSec(new Date(q.data.next_change_at).getTime() - (now + q.data.skew))}
      </p>
    </div>
  );
}

type SessionRow = { id: string; short_id: string; started_at: string; expires_at: string; scans: number; searches: number; out_of_zone_since: string | null };

function useSessions(storeId: string, enabled = true) {
  return useQuery({
    queryKey: ["kawscan-sessions", storeId],
    enabled,
    queryFn: async () => {
      const { data, error } = await db.from("kawscan_sessions")
        .select("id, short_id, started_at, expires_at, scans, searches, out_of_zone_since")
        .eq("store_id", storeId).gt("expires_at", new Date().toISOString()).order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
    refetchInterval: 10000,
  });
}

function ActiveSessions({ storeId }: { storeId: string }) {
  const now = useNow();
  const qc = useQueryClient();
  const [closing, setClosing] = useState<SessionRow | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const q = useSessions(storeId);
  const rows = (q.data ?? []).filter((r) => new Date(r.expires_at).getTime() > now);
  const d = rows.find((r) => r.id === detail) ?? null;

  async function close(id: string) {
    const { error } = await rpc("kawscan_close_session", { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Session fermée");
    setDetail(null);
    void qc.invalidateQueries({ queryKey: ["kawscan-sessions", storeId] });
  }

  const dialog = (
    <AlertDialog open={!!closing} onOpenChange={(o) => !o && setClosing(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Fermer la session #{closing?.short_id} ?</AlertDialogTitle>
          <AlertDialogDescription>Voulez-vous vraiment fermer cette session ? Le client devra en ouvrir une nouvelle pour voir les prix.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (closing) void close(closing.id); setClosing(null); }}>Fermer la session</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (d) {
    return (
      <section className="space-y-3 rounded-xl border bg-background p-4">
        <Button variant="ghost" className="h-10 gap-1 px-2" onClick={() => setDetail(null)}><ArrowLeft className="h-4 w-4" /> Toutes les sessions</Button>
        <p className="text-lg font-bold">Session #{d.short_id}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Durée</dt><dd className="tabular-nums">{mmss(now - new Date(d.started_at).getTime())}</dd>
          <dt className="text-muted-foreground">Temps restant</dt><dd className="tabular-nums">{mmss(new Date(d.expires_at).getTime() - now)}</dd>
          <dt className="text-muted-foreground">Scans</dt><dd>{d.scans}</dd>
          <dt className="text-muted-foreground">Recherches</dt><dd>{d.searches}</dd>
          <dt className="text-muted-foreground">État</dt><dd>{d.out_of_zone_since ? "🟠 Hors zone ?" : "🟢 Active"}</dd>
        </dl>
        <Button variant="destructive" className="h-11 w-full" onClick={() => setClosing(d)}>Fermer la session</Button>
        {dialog}
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border bg-background p-4">
      <p className="text-sm font-semibold">Sessions ouvertes : {rows.length}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune session ouverte en ce moment.</p>
      ) : (
        <div className="divide-y">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
              <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setDetail(r.id)}>Session #{r.short_id}</button>
              <span className="tabular-nums">{mmss(now - new Date(r.started_at).getTime())}</span>
              <span>{r.scans} scan{r.scans > 1 ? "s" : ""}</span>
              <span>{r.searches} recherche{r.searches > 1 ? "s" : ""}</span>
              <span>{r.out_of_zone_since ? "🟠 Hors zone ?" : "🟢 Active"}</span>
              <Button size="sm" variant="outline" className="ms-auto" onClick={() => setClosing(r)}>Fermer</Button>
            </div>
          ))}
        </div>
      )}
      {dialog}
    </section>
  );
}
