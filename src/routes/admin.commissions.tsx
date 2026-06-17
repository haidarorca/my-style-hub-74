import * as React from "react";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronRight, Search, Save, Trash2, Plus,
  History as HistoryIcon, ChevronDown, Globe2, ArrowRight,
  Percent, Banknote, Calculator, Store, Package, Check, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCountries, useCountryLabel, type Country } from "@/hooks/use-countries";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { BackButton } from "@/components/layout/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminTabs, AdminTabList, AdminTabTrigger } from "@/components/admin/AdminTabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/commissions")({
  validateSearch: (s: Record<string, unknown>) => ({
    source: typeof s.source === "string" ? s.source : undefined,
    destination: typeof s.destination === "string" ? s.destination : undefined,
  }),
  component: () => <PermissionGate superOnly><CommissionsPage /></PermissionGate>,
});

type Scope = "global" | "vendor" | "category" | "product" | "country_pair";
interface Rule {
  id: string;
  scope: Scope;
  vendor_id: string | null;
  category_id: string | null;
  product_id: string | null;
  source_country_id: string | null;
  destination_country_id: string | null;
  rate_percent: number;
  is_enabled: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const sb = supabase as any;
const ALL = "__ALL__"; // sentinel for "all countries" (NULL)

function CommissionsPage() {
  const { isSuperAdmin } = useAuth();
  if (!isSuperAdmin) return null;
  return (
    <div className="space-y-4">
      <BackButton fallbackTo="/admin" label="Retour admin" className="border bg-background shadow-sm" />
      <div>
        <h1 className="text-xl font-bold">Commissions</h1>
        <p className="text-xs text-muted-foreground">
          Matrice pays source → pays destination. Priorité&nbsp;: produit → sous-catégorie → catégorie → règle de la paire → règle globale.
        </p>
      </div>
      <Tabs defaultValue="matrix">
        <AdminTabList className="w-full">
          <AdminTabTrigger value="matrix" className="flex-1">Matrice pays</AdminTabTrigger>
          <AdminTabTrigger value="global" className="flex-1">Globale</AdminTabTrigger>
          <AdminTabTrigger value="vendors" className="flex-1">Vendeurs</AdminTabTrigger>
          <AdminTabTrigger value="history" className="flex-1">Historique</AdminTabTrigger>
        </AdminTabList>
        <TabsContent value="matrix" className="pt-3"><MatrixTab /></TabsContent>
        <TabsContent value="global" className="pt-3"><GlobalTab /></TabsContent>
        <TabsContent value="vendors" className="pt-3"><VendorsTab /></TabsContent>
        <TabsContent value="history" className="pt-3"><HistoryTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================
   RULES + HELPERS
============================================================ */
function useRules() {
  return useQuery({
    queryKey: ["commission_rules"],
    queryFn: async () => {
      const { data, error } = await sb.from("commission_rules").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });
}

type SaveCommissionRuleInput = {
  scope: Scope;
  rate_percent: number;
  is_enabled?: boolean;
  vendor_id?: string | null;
  category_id?: string | null;
  product_id?: string | null;
  source_country_id?: string | null;
  destination_country_id?: string | null;
  note?: string | null;
};

async function saveCommissionRule(input: SaveCommissionRuleInput) {
  const { data, error } = await sb.rpc("upsert_commission_rule", {
    _scope: input.scope,
    _rate_percent: input.rate_percent,
    _is_enabled: input.is_enabled ?? true,
    _vendor_id: input.vendor_id ?? null,
    _category_id: input.category_id ?? null,
    _product_id: input.product_id ?? null,
    _source_country_id: input.source_country_id ?? null,
    _destination_country_id: input.destination_country_id ?? null,
    _note: input.note ?? null,
  });
  if (error) throw error;
  return data as Rule;
}

function useCategories() {
  return useQuery({
    queryKey: ["categories-flat"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories")
        .select("id, name, parent_id, level").order("level").order("position").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; parent_id: string | null; level: number }[];
    },
  });
}

/** Count products affected by a category subtree */
function useProductCounts() {
  return useQuery({
    queryKey: ["products-by-category-count"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("category_id");
      const m = new Map<string, number>();
      (data ?? []).forEach((p: any) => {
        if (!p.category_id) return;
        m.set(p.category_id, (m.get(p.category_id) ?? 0) + 1);
      });
      return m;
    },
  });
}

/* ============================================================
   MATRIX TAB — 3-level navigation (source → dest → pair detail)
============================================================ */
function MatrixTab() {
  const search = Route.useSearch();
  const [source, setSource] = useState<string | null>(search.source ?? null);
  const [destination, setDestination] = useState<string | null>(search.destination ?? null);

  React.useEffect(() => {
    if (search.source) setSource(search.source);
    if (search.destination) setDestination(search.destination);
  }, [search.source, search.destination]);

  if (!source) return <SourcePicker onPick={setSource} />;
  if (!destination) {
    return <DestinationPicker sourceId={source} onPick={setDestination} onBack={() => setSource(null)} />;
  }
  return (
    <PairEditor
      sourceId={source}
      destinationId={destination}
      onBack={() => setDestination(null)}
      onChangeSource={() => { setSource(null); setDestination(null); }}
    />
  );
}

/* ---------- Country pickers ---------- */
function CountryCard({ country, isAll, rateLabel, onClick }: {
  country?: Country; isAll?: boolean; rateLabel?: React.ReactNode; onClick: () => void;
}) {
  const labelOf = useCountryLabel();
  return (
    <button
      type="button" onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
          {isAll ? <Globe2 className="h-4 w-4" /> : country?.flag_emoji ?? "🏳️"}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {isAll ? "Tous les pays" : labelOf(country)}
          </div>
          {!isAll && country && (
            <div className="text-[10px] uppercase text-muted-foreground">{country.code}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {rateLabel}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}

function SourcePicker({ onPick }: { onPick: (id: string) => void }) {
  const { data: countries } = useCountries({ onlyEnabled: true });
  const { data: rules } = useRules();
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);

  const configuredSourceIds = useMemo(() => {
    const set = new Set<string | null>();
    (rules ?? []).forEach((r) => {
      if (!r.is_enabled) return;
      if (r.scope === "global") return;
      if (r.source_country_id == null && r.destination_country_id == null) return;
      if (r.rate_percent == null || Number(r.rate_percent) <= 0) return;
      set.add(r.source_country_id ?? null);
    });
    return set;
  }, [rules]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (countries ?? []).filter((c) => {
      if (!showAll && !configuredSourceIds.has(c.id)) return false;
      return !s || c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s);
    });
  }, [countries, q, showAll, configuredSourceIds]);

  const configuredCount = (countries ?? []).filter((c) => configuredSourceIds.has(c.id)).length;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">1. Pays source (vendeur)</h2>
        <p className="text-xs text-muted-foreground">Seuls les pays avec des règles existantes sont listés. Cliquez « Voir tous les pays » pour en ajouter un nouveau.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-7" />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{showAll ? "Tous les pays affichés" : `${configuredCount} pays source configuré(s)`}</span>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Voir uniquement configurés" : "Voir tous les pays"}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(showAll || configuredSourceIds.has(null)) && (
          <CountryCard isAll onClick={() => onPick(ALL)} />
        )}
        {filtered.map((c) => (
          <CountryCard key={c.id} country={c} onClick={() => onPick(c.id)} />
        ))}
        {!showAll && filtered.length === 0 && !configuredSourceIds.has(null) && (
          <p className="col-span-full rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            Aucun pays source configuré. Cliquez « Voir tous les pays » pour en ajouter un.
          </p>
        )}
      </div>
    </div>
  );
}

function DestinationPicker({ sourceId, onPick, onBack }: {
  sourceId: string; onPick: (id: string) => void; onBack: () => void;
}) {
  const { data: countries } = useCountries({ onlyEnabled: true });
  const { data: rules } = useRules();
  const labelOf = useCountryLabel();
  const source = countries?.find((c) => c.id === sourceId) ?? null;
  const isSourceAll = sourceId === ALL;
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);

  const srcMatch = isSourceAll ? null : sourceId;
  const configuredDestIds = useMemo(() => {
    const set = new Set<string | null>();
    (rules ?? []).forEach((r) => {
      if (!r.is_enabled) return;
      if (r.scope === "global") return;
      if ((r.source_country_id ?? null) !== srcMatch) return;
      if (r.rate_percent == null || Number(r.rate_percent) <= 0) return;
      set.add(r.destination_country_id ?? null);
    });
    return set;
  }, [rules, srcMatch]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (countries ?? []).filter((c) => {
      if (!showAll && !configuredDestIds.has(c.id)) return false;
      return !s || c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s);
    });
  }, [countries, q, showAll, configuredDestIds]);

  // Effective pair rate display
  const pairRate = (destId: string | null) => {
    const r = rules?.find((x) =>
      x.scope === "country_pair" && x.is_enabled
      && (x.source_country_id ?? null) === srcMatch
      && (x.destination_country_id ?? null) === destId,
    );
    return r && Number(r.rate_percent) > 0 ? <Badge variant="secondary">{r.rate_percent}%</Badge> : <Badge variant="outline" className="text-muted-foreground">—</Badge>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack} className="-ml-2 h-8 px-2">
          <ArrowLeft className="mr-1 h-4 w-4" /> Source
        </Button>
        <div className="flex items-center gap-2 text-sm font-medium">
          {isSourceAll ? <><Globe2 className="h-4 w-4" /> Toutes sources</> : <>{source?.flag_emoji} {labelOf(source)}</>}
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">choisir destination</span>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Rechercher une destination…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-7" />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{showAll ? "Tous les pays affichés" : `${configuredDestIds.size} destination(s) configurée(s)`}</span>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Voir uniquement configurées" : "Voir tous les pays"}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(showAll || configuredDestIds.has(null)) && (
          <CountryCard isAll rateLabel={pairRate(null)} onClick={() => onPick(ALL)} />
        )}
        {filtered.map((c) => (
          <CountryCard key={c.id} country={c} rateLabel={pairRate(c.id)} onClick={() => onPick(c.id)} />
        ))}
        {!showAll && filtered.length === 0 && !configuredDestIds.has(null) && (
          <p className="col-span-full rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            Aucune destination configurée pour ce pays. Cliquez « Voir tous les pays » pour en ajouter une.
          </p>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   PAIR EDITOR — Pair rate + Category tree + Products
============================================================ */
function PairEditor({ sourceId, destinationId, onBack, onChangeSource }: {
  sourceId: string; destinationId: string; onBack: () => void; onChangeSource: () => void;
}) {
  const { data: countries } = useCountries();
  const labelOf = useCountryLabel();
  const src = sourceId === ALL ? null : countries?.find((c) => c.id === sourceId) ?? null;
  const dst = destinationId === ALL ? null : countries?.find((c) => c.id === destinationId) ?? null;
  const srcDbId = sourceId === ALL ? null : sourceId;
  const dstDbId = destinationId === ALL ? null : destinationId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack} className="-ml-2 h-8 px-2">
          <ArrowLeft className="mr-1 h-4 w-4" /> Destinations
        </Button>
        <Button size="sm" variant="ghost" onClick={onChangeSource} className="h-8 px-2 text-xs text-muted-foreground">
          Changer source
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xl">
            {sourceId === ALL ? <Globe2 className="h-4 w-4" /> : src?.flag_emoji ?? "🏳️"}
          </span>
          <div className="text-sm font-semibold">{sourceId === ALL ? "Toutes sources" : labelOf(src)}</div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xl">
            {destinationId === ALL ? <Globe2 className="h-4 w-4" /> : dst?.flag_emoji ?? "🏳️"}
          </span>
          <div className="text-sm font-semibold">{destinationId === ALL ? "Toutes destinations" : labelOf(dst)}</div>
        </CardContent>
      </Card>

      <PairGeneralRule srcId={srcDbId} dstId={dstDbId} />
      <PairCategoryTree srcId={srcDbId} dstId={dstDbId} />
      <PairProductRules srcId={srcDbId} dstId={dstDbId} />

      <PairDeleteAllButton srcId={srcDbId} dstId={dstDbId} onDeleted={onBack} />
    </div>
  );
}

/* ---------- Delete all rules for a pair (password protected) ---------- */
function PairDeleteAllButton({ srcId, dstId, onDeleted }: {
  srcId: string | null; dstId: string | null; onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: rules } = useRules();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const pairRules = useMemo(() => (rules ?? []).filter((r) =>
    (r.source_country_id ?? null) === srcId
    && (r.destination_country_id ?? null) === dstId
    && r.scope !== "global",
  ), [rules, srcId, dstId]);

  const count = pairRules.length;

  async function confirmDelete() {
    if (!user?.email) return toast.error("Session invalide");
    if (!password) return toast.error("Mot de passe requis");
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (authError) {
        toast.error("Mot de passe incorrect");
        return;
      }
      const ids = pairRules.map((r) => r.id);
      if (ids.length > 0) {
        const { error } = await sb.from("commission_rules").delete().in("id", ids);
        if (error) {
          toast.error(error.message);
          return;
        }
      }
      toast.success(`${ids.length} règle(s) supprimée(s)`);
      qc.invalidateQueries({ queryKey: ["commission_rules"] }); qc.invalidateQueries({ queryKey: ["display-prices"] }); qc.invalidateQueries({ queryKey: ["display-price-lines"] });
      setOpen(false);
      setPassword("");
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="border-destructive/40">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="text-xs text-muted-foreground">
            Supprimer toutes les règles (paire, catégories, produits) de cette combinaison source → destination.
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={count === 0}
            onClick={() => setOpen(true)}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Tout supprimer ({count})
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPassword(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Vous allez supprimer <strong>{count}</strong> règle(s) de commission pour cette paire. Cette action est irréversible.
              Saisissez votre mot de passe admin pour confirmer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs">Mot de passe admin</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") void confirmDelete(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Annuler</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy || !password}>
              {busy ? "Suppression…" : "Supprimer définitivement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------- Pair general rule (all categories) ---------- */
function PairGeneralRule({ srcId, dstId }: { srcId: string | null; dstId: string | null }) {
  const qc = useQueryClient();
  const { data: rules } = useRules();
  const existing = useMemo(() => rules?.find((r) =>
    r.scope === "country_pair"
    && (r.source_country_id ?? null) === srcId
    && (r.destination_country_id ?? null) === dstId,
  ), [rules, srcId, dstId]);

  const [rate, setRate] = useState<string>("");
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  React.useEffect(() => {
    setRate(existing ? String(existing.rate_percent) : "");
    setEnabled(existing?.is_enabled ?? true);
    setLoaded(true);
  }, [existing?.id]);

  async function save() {
    const v = Number(rate);
    if (Number.isNaN(v) || v < 0 || v > 100) return toast.error("Taux invalide (0-100)");
    try {
      await saveCommissionRule({
        scope: "country_pair", source_country_id: srcId, destination_country_id: dstId,
        rate_percent: v, is_enabled: enabled,
      });
    } catch (error: any) {
      return toast.error(error.message);
    }
    toast.success("Commission de la paire enregistrée");
    qc.invalidateQueries({ queryKey: ["commission_rules"] }); qc.invalidateQueries({ queryKey: ["display-prices"] }); qc.invalidateQueries({ queryKey: ["display-price-lines"] });
  }
  async function remove() {
    if (!existing) return;
    if (!confirm("Supprimer la règle de cette paire ?")) return;
    const { error } = await sb.from("commission_rules").delete().eq("id", existing.id);
    if (error) return toast.error(error.message);
    toast.success("Supprimée");
    qc.invalidateQueries({ queryKey: ["commission_rules"] }); qc.invalidateQueries({ queryKey: ["display-prices"] }); qc.invalidateQueries({ queryKey: ["display-price-lines"] });
  }

  if (!loaded) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Commission de la paire (toutes catégories)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs">Taux (%)</label>
            <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="w-28" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="text-sm">Activée</span>
          </div>
          <Button onClick={save} size="sm"><Save className="mr-1 h-4 w-4" /> Enregistrer</Button>
          {existing && (
            <Button onClick={remove} size="sm" variant="ghost" className="text-destructive">
              <Trash2 className="mr-1 h-4 w-4" /> Supprimer
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Préréglages :</span>
          {[0, 1, 5, 10, 15, 20, 30, 50].map((p) => (
            <Button key={p} size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setRate(String(p))}>
              {p}%
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Appliquée à tous les produits de cette paire, sauf si une règle catégorie / sous-catégorie / produit plus précise existe.
        </p>
      </CardContent>
    </Card>
  );
}

/* ---------- Pair category tree ---------- */
function PairCategoryTree({ srcId, dstId }: { srcId: string | null; dstId: string | null }) {
  const qc = useQueryClient();
  const { data: cats } = useCategories();
  const { data: rules } = useRules();
  const { data: productCounts } = useProductCounts();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, typeof cats>();
    (cats ?? []).forEach((c) => {
      const arr = m.get(c.parent_id) ?? [];
      arr.push(c);
      m.set(c.parent_id, arr);
    });
    return m;
  }, [cats]);

  const ruleFor = (categoryId: string) => rules?.find((r) =>
    r.scope === "category" && r.category_id === categoryId
    && (r.source_country_id ?? null) === srcId
    && (r.destination_country_id ?? null) === dstId
    && (r.vendor_id ?? null) === null,
  );

  // Recursive product count (subtree)
  const subtreeCount = useMemo(() => {
    const m = new Map<string, number>();
    function walk(id: string): number {
      if (m.has(id)) return m.get(id)!;
      let n = productCounts?.get(id) ?? 0;
      (childrenOf.get(id) ?? []).forEach((c) => { n += walk(c.id); });
      m.set(id, n);
      return n;
    }
    (cats ?? []).forEach((c) => walk(c.id));
    return m;
  }, [cats, childrenOf, productCounts]);

  function toggle(id: string) {
    setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function saveRate(categoryId: string, value: number) {
    if (Number.isNaN(value) || value < 0 || value > 100) return toast.error("Taux invalide");
    try {
      await saveCommissionRule({
        scope: "category", category_id: categoryId,
        source_country_id: srcId, destination_country_id: dstId,
        rate_percent: value, is_enabled: true,
      });
    } catch (error: any) {
      return toast.error(error.message);
    }
    toast.success("Règle catégorie enregistrée");
    qc.invalidateQueries({ queryKey: ["commission_rules"] }); qc.invalidateQueries({ queryKey: ["display-prices"] }); qc.invalidateQueries({ queryKey: ["display-price-lines"] });
  }
  async function removeRule(categoryId: string) {
    const existing = ruleFor(categoryId);
    if (!existing) return;
    if (!confirm("Supprimer cette règle ?")) return;
    const { error } = await sb.from("commission_rules").delete().eq("id", existing.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["commission_rules"] }); qc.invalidateQueries({ queryKey: ["display-prices"] }); qc.invalidateQueries({ queryKey: ["display-price-lines"] });
  }

  // Build filtered visible set (expand path of matches)
  const matchedIds = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    const matched = new Set<string>();
    (cats ?? []).forEach((c) => {
      if (c.name.toLowerCase().includes(s)) {
        matched.add(c.id);
        let p = c.parent_id;
        while (p) { matched.add(p); const par = cats?.find((x) => x.id === p); p = par?.parent_id ?? null; }
      }
    });
    return matched;
  }, [cats, q]);

  function renderNode(catId: string, depth: number): React.ReactNode {
    const cat = cats?.find((c) => c.id === catId);
    if (!cat) return null;
    if (matchedIds && !matchedIds.has(catId)) return null;
    const kids = childrenOf.get(catId) ?? [];
    const isOpen = expanded.has(catId) || !!matchedIds;
    const rule = ruleFor(catId);
    const count = subtreeCount.get(catId) ?? 0;
    return (
      <li key={catId}>
        <div
          className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent"
          style={{ paddingInlineStart: depth * 14 + 4 }}
        >
          <button
            type="button"
            onClick={() => kids.length > 0 && toggle(catId)}
            className={cn("flex h-5 w-5 items-center justify-center rounded text-muted-foreground", kids.length === 0 && "opacity-0")}
            aria-label="Étendre"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <span className="min-w-0 flex-1 truncate text-sm">{cat.name}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">{count} prod.</Badge>
          <RateInline
            defaultValue={rule?.rate_percent}
            placeholder="—"
            onSave={(v) => saveRate(catId, v)}
          />
          {rule && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRule(catId)} title="Supprimer">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
        {isOpen && kids.length > 0 && (
          <ul>{kids.map((k) => renderNode(k.id, depth + 1))}</ul>
        )}
      </li>
    );
  }

  const roots = childrenOf.get(null) ?? [];

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Règles par catégorie / sous-catégorie</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Rechercher une catégorie" value={q} onChange={(e) => setQ(e.target.value)} className="pl-7" />
        </div>
        {!cats ? (
          <p className="text-xs text-muted-foreground">Chargement…</p>
        ) : roots.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucune catégorie.</p>
        ) : (
          <ul className="rounded-md border bg-background">
            {roots.map((c) => renderNode(c.id, 0))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Saisissez un taux puis appuyez sur Entrée ou cliquez ailleurs. Vide = pas de règle (la commission de la paire s'applique).
        </p>
      </CardContent>
    </Card>
  );
}

function RateInline({ defaultValue, placeholder, onSave }: {
  defaultValue?: number; placeholder?: string; onSave: (v: number) => void;
}) {
  const [val, setVal] = useState<string>(defaultValue != null ? String(defaultValue) : "");
  const [dirty, setDirty] = useState(false);
  React.useEffect(() => { setVal(defaultValue != null ? String(defaultValue) : ""); setDirty(false); }, [defaultValue]);

  function commit() {
    if (!dirty) return;
    if (val.trim() === "") return;
    const v = Number(val);
    if (Number.isNaN(v)) return toast.error("Taux invalide");
    onSave(v);
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number" step="0.01" inputMode="decimal"
        placeholder={placeholder} value={val}
        onChange={(e) => { setVal(e.target.value); setDirty(true); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className={cn("h-7 w-16 text-xs", defaultValue != null && "font-semibold")}
      />
      <span className="text-[10px] text-muted-foreground">%</span>
    </div>
  );
}

/* ---------- Pair product rules (V2 - enriched) ---------- */
function PairProductRules({ srcId, dstId }: { srcId: string | null; dstId: string | null }) {
  const qc = useQueryClient();
  const { data: rules } = useRules();
  const { data: countries } = useCountries({ onlyEnabled: true });
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [showProducts, setShowProducts] = useState(false);
  const [productQ, setProductQ] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [commissionMode, setCommissionMode] = useState<"percent" | "final_price">("percent");
  const [commissionValue, setCommissionValue] = useState("");

  /* ——— Vendor detail with count ——— */
  const { data: vendorDetail } = useQuery({
    queryKey: ["vendor-detail", selectedVendorId],
    enabled: !!selectedVendorId,
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, shop_name, full_name, shop_logo_url, source_country_id, phone")
        .eq("id", selectedVendorId!)
        .maybeSingle();
      const { count } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", selectedVendorId!);
      return {
        id: profile?.id ?? selectedVendorId!,
        name: profile?.shop_name || profile?.full_name || "Sans nom",
        logo: profile?.shop_logo_url ?? null,
        countryId: profile?.source_country_id ?? null,
        productCount: count ?? 0,
      };
    },
  });

  const vendorCountry = countries?.find((c) => c.id === vendorDetail?.countryId);

  /* ——— Vendor products with images ——— */
  const { data: vendorProducts, isLoading: productsLoading } = useQuery({
    queryKey: ["vendor-products-full", selectedVendorId],
    enabled: !!selectedVendorId && showProducts,
    queryFn: async () => {
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, code, price, vendor_id")
        .eq("vendor_id", selectedVendorId!)
        .order("name");
      if (!prods || prods.length === 0) return [];

      // Get first image for each product
      const productIds = prods.map((p) => p.id);
      const { data: images } = await supabase
        .from("product_images")
        .select("product_id, url")
        .in("product_id", productIds)
        .order("position", { ascending: true });

      const imageMap = new Map<string, string>();
      (images ?? []).forEach((img) => {
        if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.url);
      });

      return prods.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        price: p.price,
        supplierPrice: Math.round(p.price * 0.6), // estimated
        image: imageMap.get(p.id) ?? null,
      }));
    },
  });

  /* ——— Existing product rules for this pair ——— */
  const productRulesForPair = useMemo(() => (rules ?? []).filter((r) =>
    r.scope === "product"
    && (r.source_country_id ?? null) === srcId
    && (r.destination_country_id ?? null) === dstId,
  ), [rules, srcId, dstId]);

  const ruleForProduct = (productId: string) => {
    return productRulesForPair.find((r) => r.product_id === productId);
  };

  /* ——— Filtered products (search) ——— */
  const filteredProducts = useMemo(() => {
    const s = productQ.trim().toLowerCase();
    if (!s) return vendorProducts ?? [];
    return (vendorProducts ?? []).filter((p) =>
      p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s)
    );
  }, [vendorProducts, productQ]);

  /* ——— Commission calculation ——— */
  const calcCommission = (supplierPrice: number, mode: "percent" | "final_price", value: number) => {
    if (mode === "percent") {
      const commissionAmount = Math.round((supplierPrice * value) / 100);
      return {
        salePrice: supplierPrice + commissionAmount,
        commissionAmount,
        ratePercent: value,
      };
    }
    // final_price mode: value is the desired final price
    const commissionAmount = Math.max(0, value - supplierPrice);
    const ratePercent = supplierPrice > 0 ? (commissionAmount / supplierPrice) * 100 : 0;
    return { salePrice: value, commissionAmount, ratePercent };
  };

  /* ——— Actions ——— */
  async function addRule(product_id: string, ratePercent: number) {
    try {
      await saveCommissionRule({
        scope: "product", product_id,
        source_country_id: srcId, destination_country_id: dstId,
        rate_percent: ratePercent, is_enabled: true,
      });
    } catch (error: any) {
      return toast.error(error.message);
    }
    toast.success("Règle produit enregistrée");
    qc.invalidateQueries({ queryKey: ["commission_rules"] });
    qc.invalidateQueries({ queryKey: ["display-prices"] });
    qc.invalidateQueries({ queryKey: ["display-price-lines"] });
  }

  async function removeRule(ruleId: string) {
    if (!confirm("Supprimer cette règle ?")) return;
    const { error } = await sb.from("commission_rules").delete().eq("id", ruleId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["commission_rules"] });
    qc.invalidateQueries({ queryKey: ["display-prices"] });
    qc.invalidateQueries({ queryKey: ["display-price-lines"] });
  }

  async function applyToSelected() {
    const ids = Array.from(selectedProducts);
    if (ids.length === 0) return toast.error("Aucun produit sélectionné");
    const val = Number(commissionValue);
    if (isNaN(val) || val <= 0) return toast.error("Valeur invalide");

    let applied = 0;
    for (const pid of ids) {
      const prod = vendorProducts?.find((p) => p.id === pid);
      if (!prod) continue;
      const result = calcCommission(prod.supplierPrice, commissionMode, val);
      if (result.ratePercent >= 0 && result.ratePercent <= 100) {
        await addRule(pid, Math.round(result.ratePercent * 100) / 100);
        applied++;
      }
    }
    toast.success(`${applied} règle(s) appliquée(s)`);
    setSelectedProducts(new Set());
  }

  const toggleProduct = (id: string) => {
    const next = new Set(selectedProducts);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedProducts(next);
  };

  const selectAllFiltered = () => {
    const ids = filteredProducts.map((p) => p.id);
    const all = ids.every((id) => selectedProducts.has(id));
    const next = new Set(selectedProducts);
    all ? ids.forEach((id) => next.delete(id)) : ids.forEach((id) => next.add(id));
    setSelectedProducts(next);
  };

  /* ——— Vendors list for select ——— */
  const { data: vendors } = useVendors();
  const vendorList = useMemo(() => {
    return (vendors ?? []).map((v: any) => ({
      id: v.user_id,
      shop_name: v.profiles?.shop_name ?? v.profiles?.full_name ?? "Sans nom",
    }));
  }, [vendors]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4 text-violet-600" />
          Règles par produit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ===== STEP 1: Vendor Selection ===== */}
        <div>
          <label className="text-xs font-medium text-slate-700 mb-1.5 block flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5" />
            Sélectionner une boutique
          </label>
          <Select
            value={selectedVendorId ?? "__all__"}
            onValueChange={(v) => {
              const vid = v === "__all__" ? null : v;
              setSelectedVendorId(vid);
              setShowProducts(false);
              setProductQ("");
              setSelectedProducts(new Set());
              setCommissionValue("");
            }}
          >
            <SelectTrigger className="text-sm h-9">
              <SelectValue placeholder="Choisir une boutique..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Choisir une boutique...</SelectItem>
              {vendorList.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.shop_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ===== STEP 2: Vendor Card ===== */}
        {selectedVendorId && vendorDetail && (
          <div className="rounded-lg border bg-gradient-to-br from-violet-50 to-white p-4 space-y-3">
            <div className="flex items-center gap-3">
              {/* Logo */}
              <div className="h-14 w-14 rounded-lg bg-white border shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                {vendorDetail.logo ? (
                  <img src={vendorDetail.logo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Store className="h-6 w-6 text-slate-400" />
                )}
              </div>
              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{vendorDetail.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {vendorCountry && (
                    <span className="flex items-center gap-1">
                      <span>{vendorCountry.flag_emoji}</span>
                      <span>{vendorCountry.name}</span>
                    </span>
                  )}
                  <span>·</span>
                  <span>{vendorDetail.productCount} produit{vendorDetail.productCount > 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full bg-violet-600 hover:bg-violet-700"
              onClick={() => setShowProducts(true)}
            >
              <Package className="h-4 w-4 mr-2" />
              Voir les produits de cette boutique
            </Button>
          </div>
        )}

        {/* ===== STEP 3: Products Table ===== */}
        {showProducts && selectedVendorId && (
          <div className="space-y-3 border rounded-lg p-3 bg-slate-50/50">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={productQ}
                  onChange={(e) => setProductQ(e.target.value)}
                  placeholder="Rechercher un produit (nom ou code)..."
                  className="pl-7 text-sm"
                />
              </div>
              <Button size="sm" variant="outline" onClick={selectAllFiltered}>
                <Check className="h-3.5 w-3.5 mr-1" />
                Tout sélectionner
              </Button>
            </div>

            {/* Selection count + Commission controls */}
            {selectedProducts.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 p-2 bg-violet-50 rounded-lg border border-violet-200">
                <Badge className="bg-violet-100 text-violet-800">
                  {selectedProducts.size} sélectionné{selectedProducts.size > 1 ? "s" : ""}
                </Badge>
                {/* Mode toggle */}
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={commissionMode === "percent" ? "default" : "outline"}
                    className={`text-xs h-7 ${commissionMode === "percent" ? "bg-violet-600" : ""}`}
                    onClick={() => setCommissionMode("percent")}
                  >
                    <Percent className="h-3 w-3 mr-1" /> %
                  </Button>
                  <Button
                    size="sm"
                    variant={commissionMode === "final_price" ? "default" : "outline"}
                    className={`text-xs h-7 ${commissionMode === "final_price" ? "bg-violet-600" : ""}`}
                    onClick={() => setCommissionMode("final_price")}
                  >
                    <Banknote className="h-3 w-3 mr-1" /> Prix final
                  </Button>
                </div>
                <div className="relative w-32">
                  <Input
                    type="number"
                    value={commissionValue}
                    onChange={(e) => setCommissionValue(e.target.value)}
                    placeholder={commissionMode === "percent" ? "15" : "6500"}
                    className="text-xs h-7 pr-10"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                    {commissionMode === "percent" ? "%" : "FCFA"}
                  </span>
                </div>
                <Button size="sm" className="h-7 bg-violet-600 hover:bg-violet-700 text-xs" onClick={applyToSelected}>
                  <Check className="h-3 w-3 mr-1" /> Appliquer
                </Button>
              </div>
            )}

            {/* Products Table */}
            {productsLoading ? (
              <p className="text-xs text-muted-foreground text-center py-4">Chargement des produits…</p>
            ) : (
              <div className="rounded-md border bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-8 p-2">
                          <Checkbox
                            checked={filteredProducts.length > 0 && filteredProducts.every((p) => selectedProducts.has(p.id))}
                            onCheckedChange={selectAllFiltered}
                          />
                        </TableHead>
                        <TableHead className="text-[10px] p-2 w-12">Image</TableHead>
                        <TableHead className="text-[10px] p-2">Produit</TableHead>
                        <TableHead className="text-[10px] p-2 text-right">Prix frns.</TableHead>
                        <TableHead className="text-[10px] p-2 text-right">Prix vente</TableHead>
                        <TableHead className="text-[10px] p-2 text-right">Commission</TableHead>
                        <TableHead className="text-[10px] p-2 text-right">%</TableHead>
                        <TableHead className="text-[10px] p-2 text-center w-20">Règle</TableHead>
                        <TableHead className="text-[10px] p-2 text-center w-16">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.map((p) => {
                        const rule = ruleForProduct(p.id);
                        const hasRule = !!rule;
                        const commissionAmount = hasRule
                          ? Math.round((p.supplierPrice * rule.rate_percent) / 100)
                          : 0;
                        return (
                          <TableRow key={p.id} className="hover:bg-slate-50">
                            <TableCell className="p-2">
                              <Checkbox
                                checked={selectedProducts.has(p.id)}
                                onCheckedChange={() => toggleProduct(p.id)}
                              />
                            </TableCell>
                            <TableCell className="p-2">
                              <div className="h-10 w-10 rounded border bg-slate-100 flex items-center justify-center overflow-hidden">
                                {p.image ? (
                                  <img src={p.image} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <Package className="h-4 w-4 text-slate-300" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="p-2">
                              <p className="text-sm font-medium truncate max-w-[150px]">{p.name}</p>
                              <p className="text-[10px] text-muted-foreground">{p.code}</p>
                            </TableCell>
                            <TableCell className="p-2 text-right text-xs font-medium">
                              {p.supplierPrice.toLocaleString("fr-FR")}
                            </TableCell>
                            <TableCell className="p-2 text-right text-xs">
                              {p.price.toLocaleString("fr-FR")}
                            </TableCell>
                            <TableCell className="p-2 text-right text-xs text-violet-700 font-medium">
                              {hasRule ? `${commissionAmount.toLocaleString("fr-FR")} FCFA` : "—"}
                            </TableCell>
                            <TableCell className="p-2 text-right">
                              {hasRule ? (
                                <Badge variant="secondary" className="text-[10px]">{rule.rate_percent}%</Badge>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="p-2 text-center">
                              {hasRule ? (
                                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                  Aucune
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="p-2 text-center">
                              {hasRule ? (
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRule(rule.id)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              ) : (
                                <ProductQuickApply
                                  product={p}
                                  onApply={(mode, value) => {
                                    const result = calcCommission(p.supplierPrice, mode, value);
                                    addRule(p.id, Math.round(result.ratePercent * 100) / 100);
                                  }}
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredProducts.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-6">
                            {productQ ? "Aucun produit trouvé pour cette recherche." : "Aucun produit dans cette boutique."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== EXISTING RULES SUMMARY ===== */}
        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Règles produits existantes pour cette paire ({productRulesForPair.length})
          </p>
          {productRulesForPair.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune règle produit spécifique.</p>
          ) : (
            <ExistingRulesList rules={productRulesForPair} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ——— Quick apply popover for single product ——— */
function ProductQuickApply({ product, onApply }: {
  product: { id: string; name: string; supplierPrice: number; price: number };
  onApply: (mode: "percent" | "final_price", value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"percent" | "final_price">("percent");
  const [value, setValue] = useState("");

  const result = useMemo(() => {
    const val = Number(value);
    if (isNaN(val) || val <= 0) return null;
    if (mode === "percent") {
      const commissionAmount = Math.round((product.supplierPrice * val) / 100);
      return { salePrice: product.supplierPrice + commissionAmount, commissionAmount, ratePercent: val };
    }
    const commissionAmount = Math.max(0, val - product.supplierPrice);
    const ratePercent = product.supplierPrice > 0 ? (commissionAmount / product.supplierPrice) * 100 : 0;
    return { salePrice: val, commissionAmount, ratePercent };
  }, [mode, value, product.supplierPrice]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3 mr-0.5" /> Règle
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">{product.name}</DialogTitle>
          <DialogDescription className="text-xs">
            Prix fournisseur: <strong>{product.supplierPrice.toLocaleString("fr-FR")} FCFA</strong>
            {" · "}Prix vente: <strong>{product.price.toLocaleString("fr-FR")} FCFA</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {/* Mode */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={mode === "percent" ? "default" : "outline"}
              className={`text-xs flex-1 h-8 ${mode === "percent" ? "bg-violet-600" : ""}`}
              onClick={() => setMode("percent")}
            >
              <Percent className="h-3 w-3 mr-1" /> Commission %
            </Button>
            <Button
              size="sm"
              variant={mode === "final_price" ? "default" : "outline"}
              className={`text-xs flex-1 h-8 ${mode === "final_price" ? "bg-violet-600" : ""}`}
              onClick={() => setMode("final_price")}
            >
              <Banknote className="h-3 w-3 mr-1" /> Prix final
            </Button>
          </div>
          {/* Input */}
          <div>
            <label className="text-xs font-medium text-slate-700">
              {mode === "percent" ? "Commission (%)" : "Prix final souhaité (FCFA)"}
            </label>
            <div className="relative">
              <Input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="text-sm pr-12"
                placeholder={mode === "percent" ? "ex: 15" : "ex: 6500"}
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                {mode === "percent" ? "%" : "FCFA"}
              </span>
            </div>
          </div>
          {/* Preview */}
          {result && (
            <div className="bg-slate-50 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-slate-600">Aperçu</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-slate-500">Prix fournisseur</p>
                  <p className="text-sm font-bold">{product.supplierPrice.toLocaleString("fr-FR")}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Commission</p>
                  <p className="text-sm font-bold text-violet-700">{result.commissionAmount.toLocaleString("fr-FR")}</p>
                  <p className="text-[10px] text-violet-500">({result.ratePercent.toFixed(1)}%)</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Prix final</p>
                  <p className="text-sm font-bold text-emerald-700">{result.salePrice.toLocaleString("fr-FR")}</p>
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Annuler</Button>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700"
            disabled={!result}
            onClick={() => {
              const val = Number(value);
              if (!isNaN(val) && val > 0) {
                onApply(mode, val);
                setOpen(false);
                setValue("");
              }
            }}
          >
            <Check className="h-3.5 w-3.5 mr-1" /> Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ——— Existing rules list (compact) ——— */
function ExistingRulesList({ rules }: { rules: Rule[] }) {
  const qc = useQueryClient();
  const productIds = rules.map((r) => r.product_id).filter(Boolean) as string[];
  const { data: ruleProducts } = useQuery({
    queryKey: ["product-names-existing", productIds.sort().join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, code, price").in("id", productIds);
      return (data ?? []) as { id: string; name: string; code: string; price: number }[];
    },
  });

  async function updateRate(id: string, v: number) {
    const { error } = await sb.from("commission_rules").update({ rate_percent: v }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["commission_rules"] });
    qc.invalidateQueries({ queryKey: ["display-prices"] });
    qc.invalidateQueries({ queryKey: ["display-price-lines"] });
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette règle ?")) return;
    const { error } = await sb.from("commission_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["commission_rules"] });
    qc.invalidateQueries({ queryKey: ["display-prices"] });
    qc.invalidateQueries({ queryKey: ["display-price-lines"] });
  }

  return (
    <ul className="divide-y max-h-60 overflow-y-auto rounded-md border bg-white">
      {rules.map((r) => {
        const p = ruleProducts?.find((x) => x.id === r.product_id);
        const supplierPrice = p ? Math.round(p.price * 0.6) : 0;
        const commissionAmount = Math.round((supplierPrice * r.rate_percent) / 100);
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 px-2 hover:bg-slate-50">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{p ? `${p.name} (${p.code})` : r.product_id}</div>
              <div className="text-[10px] text-muted-foreground">
                Frns: {supplierPrice.toLocaleString("fr-FR")} FCFA
                {" · "}Com: {commissionAmount.toLocaleString("fr-FR")} FCFA ({r.rate_percent}%)
              </div>
            </div>
            <Input
              type="number" step="0.01"
              defaultValue={r.rate_percent}
              className="h-7 w-20 text-xs"
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (!isNaN(v) && v !== r.rate_percent) updateRate(r.id, v);
              }}
            />
            <span className="text-[10px] text-muted-foreground">%</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(r.id)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}


/* ============================================================
   GLOBAL TAB — base global rule (last fallback)
============================================================ */
function GlobalTab() {
  const qc = useQueryClient();
  const { data: rules } = useRules();
  const existing = rules?.find((r) => r.scope === "global");
  const [rate, setRate] = useState(existing ? String(existing.rate_percent) : "0");
  const [enabled, setEnabled] = useState(existing?.is_enabled ?? true);

  React.useEffect(() => {
    setRate(existing ? String(existing.rate_percent) : "0");
    setEnabled(existing?.is_enabled ?? true);
  }, [existing?.id]);

  async function save() {
    const v = Number(rate);
    if (Number.isNaN(v) || v < 0 || v > 100) return toast.error("Taux invalide");
    try {
      await saveCommissionRule({ scope: "global", rate_percent: v, is_enabled: enabled });
    } catch (error: any) {
      return toast.error(error.message);
    }
    toast.success("Commission globale enregistrée");
    qc.invalidateQueries({ queryKey: ["commission_rules"] }); qc.invalidateQueries({ queryKey: ["display-prices"] }); qc.invalidateQueries({ queryKey: ["display-price-lines"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Commission globale (dernier recours)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Appliquée uniquement si aucune règle plus précise (produit / catégorie / paire de pays) ne correspond.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs">Taux (%)</label>
            <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="w-28" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="text-sm">Activée</span>
          </div>
          <Button onClick={save} size="sm"><Save className="mr-1 h-4 w-4" /> Enregistrer</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================================================
   VENDORS TAB
============================================================ */
function useVendors() {
  return useQuery({
    queryKey: ["vendors-with-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles")
        .select("user_id, profiles:profiles!inner(shop_name, full_name, email, vendor_mode, hide_contact_publicly)")
        .eq("role", "vendeur");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        user_id: string;
        profiles: { shop_name: string | null; full_name: string | null; email: string | null; vendor_mode: string; hide_contact_publicly: boolean } | null;
      }>;
    },
  });
}

function VendorsTab() {
  const { data: vendors, refetch } = useVendors();
  async function setMode(userId: string, mode: string) {
    const { error } = await supabase.from("profiles").update({ vendor_mode: mode } as any).eq("id", userId);
    if (error) return toast.error(error.message);
    toast.success("Mode mis à jour"); refetch();
  }
  async function setHide(userId: string, hide: boolean) {
    const { error } = await supabase.from("profiles").update({ hide_contact_publicly: hide } as any).eq("id", userId);
    if (error) return toast.error(error.message);
    refetch();
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Mode vendeur</CardTitle></CardHeader>
      <CardContent>
        {!vendors ? <p className="text-sm text-muted-foreground">Chargement…</p> : (
          <ul className="divide-y">
            {vendors.map((v) => {
              const p = v.profiles;
              const mode = p?.vendor_mode ?? "no_commission";
              return (
                <li key={v.user_id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p?.shop_name || p?.full_name || p?.email}</div>
                    <div className="truncate text-xs text-muted-foreground">{p?.email}</div>
                  </div>
                  <Select value={mode} onValueChange={(val) => setMode(v.user_id, val)}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no_commission">Sans commission</SelectItem>
                      <SelectItem value="commission">Avec commission</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p?.hide_contact_publicly ?? false}
                      disabled={mode === "commission"}
                      onCheckedChange={(c) => setHide(v.user_id, c)}
                    />
                    <span className="text-xs">Masquer contact</span>
                  </div>
                  {mode === "commission" && <Badge variant="secondary">Plateforme</Badge>}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
   HISTORY
============================================================ */
function HistoryTab() {
  const { data } = useQuery({
    queryKey: ["commission_history"],
    queryFn: async () => {
      const { data, error } = await sb.from("commission_rule_history")
        .select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as Array<{
        id: string; rule_id: string; action: string;
        old_value: any; new_value: any;
        actor_email: string | null; created_at: string;
      }>;
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><HistoryIcon className="h-4 w-4" /> Historique</CardTitle>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune action enregistrée.</p>
        ) : (
          <ul className="divide-y text-xs">
            {data.map((h) => {
              const oldRate = h.old_value?.rate_percent;
              const newRate = h.new_value?.rate_percent;
              const scope = h.new_value?.scope ?? h.old_value?.scope;
              return (
                <li key={h.id} className="py-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{h.action}</Badge>
                    <span className="font-medium">{scope}</span>
                    <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString("fr-FR")}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {oldRate !== undefined && newRate !== undefined ? `${oldRate}% → ${newRate}%` : newRate !== undefined ? `${newRate}%` : oldRate !== undefined ? `(supprimée à ${oldRate}%)` : null}
                    {h.actor_email && <> · par {h.actor_email}</>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
