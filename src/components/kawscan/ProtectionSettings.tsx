import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, Loader2, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ProtectionMode } from "@/lib/kawscan/session";
import type { LatLng } from "./ZoneMap";
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
  { v: "none", label: "Aucune", hint: "Tout le monde peut voir les prix en scannant le QR." },
  { v: "gps", label: "Zone GPS", hint: "Le client doit se trouver dans la boutique." },
  { v: "code", label: "Code", hint: "Le client entre un code donné par votre personnel." },
  { v: "gps_code", label: "Zone GPS + Code", hint: "Les deux à la fois." },
];

type Settings = { protection_mode: ProtectionMode; zone_polygon: LatLng[] | null; code_period_minutes: number; session_max_minutes: number };

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

export function ProtectionSettings({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [here, setHere] = useState<LatLng | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const q = useQuery({
    queryKey: ["kawscan-protection", storeId],
    queryFn: async () => {
      const { data, error } = await db.from("kawscan_stores")
        .select("protection_mode, zone_polygon, code_period_minutes, session_max_minutes").eq("id", storeId).single();
      if (error) throw error;
      return data as Settings;
    },
  });
  useEffect(() => { if (q.data && !s) setS(q.data); }, [q.data, s]);

  if (!s) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  const needsGps = s.protection_mode === "gps" || s.protection_mode === "gps_code";
  const needsCode = s.protection_mode === "code" || s.protection_mode === "gps_code";
  const zone = s.zone_polygon ?? [];

  function locateMe() {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const c: LatLng = [p.coords.latitude, p.coords.longitude];
        setHere(c);
        if (zone.length < 3) setS((o) => (o ? { ...o, zone_polygon: rectAround(c) } : o));
      },
      () => toast.error("Autorisez la localisation pour placer votre boutique."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function save() {
    if (!s) return;
    if (needsGps && zone.length < 3) return toast.error("Définissez d'abord la zone de votre boutique sur la carte.");
    setSaving(true);
    const { error } = await db.from("kawscan_stores").update({
      protection_mode: s.protection_mode,
      zone_polygon: s.zone_polygon,
      code_period_minutes: s.code_period_minutes,
      session_max_minutes: s.session_max_minutes,
    }).eq("id", storeId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Paramètres enregistrés");
    void qc.invalidateQueries({ queryKey: ["kawscan-protection", storeId] });
    void qc.invalidateQueries({ queryKey: ["kawscan-code", storeId] });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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
        <section className="space-y-3 rounded-xl border bg-background p-4">
          <p className="text-sm font-semibold">Zone de la boutique</p>
          <p className="text-xs text-muted-foreground">Placez-vous dans la boutique, appuyez sur « Ma position », puis déplacez les 4 points pour couvrir votre magasin.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={locateMe}><Crosshair className="mr-2 h-4 w-4" />Ma position</Button>
            {(here || zone.length) ? (
              <Button type="button" variant="outline" onClick={() => {
                const c = here ?? zone[0]!;
                setS({ ...s, zone_polygon: rectAround(c) });
              }}><RotateCcw className="mr-2 h-4 w-4" />Refaire la zone</Button>
            ) : null}
          </div>
          {mounted && (
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-muted" />}>
              <ZoneMap value={zone} center={here} onChange={(v) => setS({ ...s, zone_polygon: v })} />
            </Suspense>
          )}
          <Button type="button" onClick={() => void save()} disabled={saving || zone.length < 3}>
            <Save className="mr-2 h-4 w-4" /> Enregistrer la zone
          </Button>
        </section>
      )}

      {needsCode && (
        <section className="space-y-3 rounded-xl border bg-background p-4">
          <p className="text-sm font-semibold">Durée du code</p>
          <Chips value={s.code_period_minutes} onChange={(n) => setS({ ...s, code_period_minutes: n })} custom />
          <CurrentCode storeId={storeId} />
        </section>
      )}

      {s.protection_mode !== "none" && (
        <section className="space-y-3 rounded-xl border bg-background p-4">
          <p className="text-sm font-semibold">Durée maximale d'une session</p>
          <Chips value={s.session_max_minutes} onChange={(n) => setS({ ...s, session_max_minutes: n })} />
        </section>
      )}

      <Button className="h-12 w-full" onClick={() => void save()} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Enregistrer les paramètres
      </Button>

      {q.data && q.data.protection_mode !== "none" && <ActiveSessions storeId={storeId} />}
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

function CurrentCode({ storeId }: { storeId: string }) {
  const now = useNow();
  const q = useQuery({
    queryKey: ["kawscan-code", storeId],
    queryFn: async () => {
      const { data, error } = await rpc("kawscan_current_code", { _store_id: storeId });
      if (error) throw new Error(error.message);
      return data as { code: string; expires_at: string; period_minutes: number };
    },
    refetchInterval: (query) => {
      const d = query.state.data;
      return d ? Math.max(1000, new Date(d.expires_at).getTime() - Date.now() + 500) : 30000;
    },
  });
  if (!q.data) return null;
  return (
    <div className="rounded-xl bg-muted p-4 text-center">
      <p className="text-xs text-muted-foreground">Code actuel à donner aux clients (enregistrez d'abord pour appliquer une nouvelle durée)</p>
      <p className="my-1 font-mono text-4xl font-bold tracking-[0.3em]">{q.data.code}</p>
      <p className="text-xs text-muted-foreground">Change automatiquement dans {mmss(new Date(q.data.expires_at).getTime() - now)}</p>
    </div>
  );
}

type SessionRow = { id: string; short_id: string; started_at: string; expires_at: string; scans: number; searches: number; out_of_zone_since: string | null };

function ActiveSessions({ storeId }: { storeId: string }) {
  const now = useNow();
  const qc = useQueryClient();
  const [closing, setClosing] = useState<SessionRow | null>(null);
  const q = useQuery({
    queryKey: ["kawscan-sessions", storeId],
    queryFn: async () => {
      const { data, error } = await db.from("kawscan_sessions")
        .select("id, short_id, started_at, expires_at, scans, searches, out_of_zone_since")
        .eq("store_id", storeId).gt("expires_at", new Date().toISOString()).order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
    refetchInterval: 10000,
  });
  const rows = (q.data ?? []).filter((r) => new Date(r.expires_at).getTime() > now);

  async function close(id: string) {
    const { error } = await rpc("kawscan_close_session", { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Session fermée");
    void qc.invalidateQueries({ queryKey: ["kawscan-sessions", storeId] });
  }

  return (
    <section className="space-y-3 rounded-xl border bg-background p-4">
      <p className="text-sm font-semibold">KawScan — Sessions actives : {rows.length}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune session ouverte en ce moment.</p>
      ) : (
        <div className="divide-y">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
              <span className="font-medium">Session #{r.short_id}</span>
              <span className="tabular-nums">{mmss(now - new Date(r.started_at).getTime())}</span>
              <span>{r.scans} scan{r.scans > 1 ? "s" : ""}</span>
              <span>{r.searches} recherche{r.searches > 1 ? "s" : ""}</span>
              <span className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${r.out_of_zone_since ? "bg-amber-500" : "bg-green-500"}`} />
                {r.out_of_zone_since ? "Hors zone ?" : "Active"}
              </span>
              <Button size="sm" variant="outline" className="ms-auto" onClick={() => setClosing(r)}>Fermer</Button>
            </div>
          ))}
        </div>
      )}
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
    </section>
  );
}
