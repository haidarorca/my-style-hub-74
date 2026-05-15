import * as React from "react";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronRight, Search, Save, Trash2, Plus,
  History as HistoryIcon, ChevronDown, Globe2, ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCountries, useCountryLabel, type Country } from "@/hooks/use-countries";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
      <div>
        <h1 className="text-xl font-bold">Commissions</h1>
        <p className="text-xs text-muted-foreground">
          Matrice pays source → pays destination. Priorité&nbsp;: produit → sous-catégorie → catégorie → règle de la paire → règle globale.
        </p>
      </div>
      <Tabs defaultValue="matrix">
        <TabsList className="w-full">
          <TabsTrigger value="matrix" className="flex-1">Matrice pays</TabsTrigger>
          <TabsTrigger value="global" className="flex-1">Globale</TabsTrigger>
          <TabsTrigger value="vendors" className="flex-1">Vendeurs</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">Historique</TabsTrigger>
        </TabsList>
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
  const [source, setSource] = useState<string | null>(null); // country id or ALL or null (= picker)
  const [destination, setDestination] = useState<string | null>(null);

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
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (countries ?? []).filter((c) =>
      !s || c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s));
  }, [countries, q]);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">1. Pays source (vendeur)</h2>
        <p className="text-xs text-muted-foreground">Choisissez d'où viennent les produits.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-7" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CountryCard isAll onClick={() => onPick(ALL)} />
        {filtered.map((c) => (
          <CountryCard key={c.id} country={c} onClick={() => onPick(c.id)} />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-xs text-muted-foreground">Aucun pays.</p>
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

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (countries ?? []).filter((c) =>
      !s || c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s));
  }, [countries, q]);

  // Effective pair rate display
  const pairRate = (destId: string | null) => {
    const srcMatch = isSourceAll ? null : sourceId;
    const r = rules?.find((x) =>
      x.scope === "country_pair" && x.is_enabled
      && (x.source_country_id ?? null) === srcMatch
      && (x.destination_country_id ?? null) === destId,
    );
    return r ? <Badge variant="secondary">{r.rate_percent}%</Badge> : <Badge variant="outline" className="text-muted-foreground">—</Badge>;
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CountryCard isAll rateLabel={pairRate(null)} onClick={() => onPick(ALL)} />
        {filtered.map((c) => (
          <CountryCard key={c.id} country={c} rateLabel={pairRate(c.id)} onClick={() => onPick(c.id)} />
        ))}
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
    </div>
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
    const payload = {
      scope: "country_pair", source_country_id: srcId, destination_country_id: dstId,
      rate_percent: v, is_enabled: enabled,
    };
    const { error } = existing
      ? await sb.from("commission_rules").update({ rate_percent: v, is_enabled: enabled }).eq("id", existing.id)
      : await sb.from("commission_rules").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Commission de la paire enregistrée");
    qc.invalidateQueries({ queryKey: ["commission_rules"] });
  }
  async function remove() {
    if (!existing) return;
    if (!confirm("Supprimer la règle de cette paire ?")) return;
    const { error } = await sb.from("commission_rules").delete().eq("id", existing.id);
    if (error) return toast.error(error.message);
    toast.success("Supprimée");
    qc.invalidateQueries({ queryKey: ["commission_rules"] });
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
    const existing = ruleFor(categoryId);
    const { error } = existing
      ? await sb.from("commission_rules").update({ rate_percent: value, is_enabled: true }).eq("id", existing.id)
      : await sb.from("commission_rules").insert({
          scope: "category", category_id: categoryId,
          source_country_id: srcId, destination_country_id: dstId,
          rate_percent: value, is_enabled: true,
        });
    if (error) return toast.error(error.message);
    toast.success("Règle catégorie enregistrée");
    qc.invalidateQueries({ queryKey: ["commission_rules"] });
  }
  async function removeRule(categoryId: string) {
    const existing = ruleFor(categoryId);
    if (!existing) return;
    if (!confirm("Supprimer cette règle ?")) return;
    const { error } = await sb.from("commission_rules").delete().eq("id", existing.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["commission_rules"] });
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

/* ---------- Pair product rules ---------- */
function PairProductRules({ srcId, dstId }: { srcId: string | null; dstId: string | null }) {
  const qc = useQueryClient();
  const { data: rules } = useRules();
  const [q, setQ] = useState("");
  const [rate, setRate] = useState("");

  const productRulesForPair = useMemo(() => (rules ?? []).filter((r) =>
    r.scope === "product"
    && (r.source_country_id ?? null) === srcId
    && (r.destination_country_id ?? null) === dstId,
  ), [rules, srcId, dstId]);

  const productIds = productRulesForPair.map((r) => r.product_id).filter(Boolean) as string[];
  const { data: ruleProducts } = useQuery({
    queryKey: ["product-names", productIds.sort().join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, code").in("id", productIds);
      return (data ?? []) as { id: string; name: string; code: string }[];
    },
  });

  const { data: searchResults } = useQuery({
    queryKey: ["products-search", q],
    enabled: q.length >= 1,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, code")
        .or(`name.ilike.%${q}%,code.ilike.%${q}%`).limit(20);
      return (data ?? []) as { id: string; name: string; code: string }[];
    },
  });

  async function addRule(product_id: string) {
    const v = Number(rate);
    if (Number.isNaN(v) || v < 0 || v > 100) return toast.error("Taux invalide");
    const existing = (rules ?? []).find((r) =>
      r.scope === "product" && r.product_id === product_id
      && (r.source_country_id ?? null) === srcId
      && (r.destination_country_id ?? null) === dstId,
    );
    const { error } = existing
      ? await sb.from("commission_rules").update({ rate_percent: v, is_enabled: true }).eq("id", existing.id)
      : await sb.from("commission_rules").insert({
          scope: "product", product_id,
          source_country_id: srcId, destination_country_id: dstId,
          rate_percent: v, is_enabled: true,
        });
    if (error) return toast.error(error.message);
    toast.success("Règle produit enregistrée");
    qc.invalidateQueries({ queryKey: ["commission_rules"] });
  }
  async function updateRate(id: string, v: number) {
    const { error } = await sb.from("commission_rules").update({ rate_percent: v }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["commission_rules"] });
  }
  async function remove(id: string) {
    if (!confirm("Supprimer cette règle ?")) return;
    const { error } = await sb.from("commission_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["commission_rules"] });
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Règles par produit</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[120px] flex-1">
            <label className="text-xs">Rechercher un produit (nom ou code)</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-7" placeholder="Tapez…" />
            </div>
          </div>
          <div>
            <label className="text-xs">Taux (%)</label>
            <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="w-24" />
          </div>
        </div>
        {q.length >= 1 && (
          <ul className="max-h-48 overflow-auto rounded-md border bg-background">
            {(searchResults ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 border-b px-2 py-1.5 text-sm last:border-0">
                <span className="min-w-0 truncate">{p.name} <span className="text-xs text-muted-foreground">({p.code})</span></span>
                <Button size="sm" variant="outline" onClick={() => addRule(p.id)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter
                </Button>
              </li>
            ))}
            {(searchResults ?? []).length === 0 && (
              <li className="px-2 py-2 text-xs text-muted-foreground">Aucun produit.</li>
            )}
          </ul>
        )}
        <div className="border-t pt-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Règles produits pour cette paire ({productRulesForPair.length})
          </p>
          {productRulesForPair.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune règle produit spécifique.</p>
          ) : (
            <ul className="divide-y">
              {productRulesForPair.map((r) => {
                const p = ruleProducts?.find((x) => x.id === r.product_id);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                    <div className="min-w-0 flex-1 truncate text-sm">
                      {p ? `${p.name} (${p.code})` : r.product_id}
                    </div>
                    <Input
                      type="number" step="0.01" defaultValue={r.rate_percent} className="h-7 w-20 text-xs"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v) && v !== Number(r.rate_percent)) updateRate(r.id, v);
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
          )}
        </div>
      </CardContent>
    </Card>
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
    const { error } = existing
      ? await sb.from("commission_rules").update({ rate_percent: v, is_enabled: enabled }).eq("id", existing.id)
      : await sb.from("commission_rules").insert({ scope: "global", rate_percent: v, is_enabled: enabled });
    if (error) return toast.error(error.message);
    toast.success("Commission globale enregistrée");
    qc.invalidateQueries({ queryKey: ["commission_rules"] });
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
