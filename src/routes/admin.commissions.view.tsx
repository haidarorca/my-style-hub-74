import * as React from "react";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, ChevronRight, Globe2, Search, Pencil, Store, Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCountries, useCountryLabel, type Country } from "@/hooks/use-countries";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { BackButton } from "@/components/layout/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/commissions/view")({
  component: () => <PermissionGate superOnly><CommissionsViewPage /></PermissionGate>,
});

const sb = supabase as any;
const ALL = "__ALL__";

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
}

function useRules() {
  return useQuery({
    queryKey: ["commission_rules"],
    queryFn: async () => {
      const { data, error } = await sb.from("commission_rules").select("*");
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });
}

function useVendorsBySource() {
  return useQuery({
    queryKey: ["vendors-by-source"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles")
        .select("user_id, profiles:profiles!inner(shop_name, full_name, email, source_country_id, vendor_mode)")
        .eq("role", "vendeur");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        user_id: string;
        profiles: { shop_name: string | null; full_name: string | null; email: string | null; source_country_id: string | null; vendor_mode: string } | null;
      }>;
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

function CommissionsViewPage() {
  const [source, setSource] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <BackButton fallbackTo="/admin" label="Retour" />
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Eye className="h-5 w-5" /> Vue d'ensemble des commissions
        </h1>
        <p className="text-xs text-muted-foreground">
          Lecture seule. Pour modifier, ouvrez une paire pays puis cliquez « Modifier cette paire ».
        </p>
      </div>

      {!source && <SourceList onPick={setSource} />}
      {source && !destination && (
        <DestinationList sourceId={source} onPick={setDestination} onBack={() => setSource(null)} />
      )}
      {source && destination && (
        <PairOverview
          sourceId={source}
          destinationId={destination}
          onBack={() => setDestination(null)}
        />
      )}
    </div>
  );
}

/* -------------------- LEVEL 1: source countries -------------------- */
function SourceList({ onPick }: { onPick: (id: string) => void }) {
  const { data: countries } = useCountries({ onlyEnabled: true });
  const { data: rules } = useRules();
  const { data: vendors } = useVendorsBySource();
  const labelOf = useCountryLabel();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (countries ?? []).filter((c) =>
      !s || c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s));
  }, [countries, q]);

  const stats = (srcId: string | null) => {
    const rulesCount = (rules ?? []).filter((r) =>
      (r.source_country_id ?? null) === srcId && r.scope !== "global").length;
    const vendorCount = (vendors ?? []).filter((v) =>
      (v.profiles?.source_country_id ?? null) === srcId).length;
    return { rulesCount, vendorCount };
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Rechercher un pays source…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-7" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SourceCard isAll stats={stats(null)} onClick={() => onPick(ALL)} />
        {filtered.map((c) => (
          <SourceCard key={c.id} country={c} stats={stats(c.id)} onClick={() => onPick(c.id)} label={labelOf(c)} />
        ))}
      </div>
    </div>
  );
}

function SourceCard({ country, isAll, label, stats, onClick }: {
  country?: Country; isAll?: boolean; label?: string;
  stats: { rulesCount: number; vendorCount: number };
  onClick: () => void;
}) {
  return (
    <button
      type="button" onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xl">
          {isAll ? <Globe2 className="h-4 w-4" /> : country?.flag_emoji ?? "🏳️"}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{isAll ? "Tous les pays" : label}</div>
          <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
              <Store className="mr-0.5 h-2.5 w-2.5" /> {stats.vendorCount} vendeurs
            </Badge>
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
              {stats.rulesCount} règles
            </Badge>
          </div>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

/* -------------------- LEVEL 2: destinations -------------------- */
function DestinationList({ sourceId, onPick, onBack }: {
  sourceId: string; onPick: (id: string) => void; onBack: () => void;
}) {
  const { data: countries } = useCountries({ onlyEnabled: true });
  const { data: rules } = useRules();
  const labelOf = useCountryLabel();
  const isSourceAll = sourceId === ALL;
  const srcDbId = isSourceAll ? null : sourceId;
  const source = countries?.find((c) => c.id === sourceId) ?? null;
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Only destinations that have at least one rule for this source
  const configuredDestIds = useMemo(() => {
    const set = new Set<string | null>();
    (rules ?? []).forEach((r) => {
      if (r.scope === "global" || r.scope === "vendor") return;
      if ((r.source_country_id ?? null) !== srcDbId) return;
      set.add(r.destination_country_id ?? null);
    });
    return set;
  }, [rules, srcDbId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (countries ?? []).filter((c) => {
      if (!showAll && !configuredDestIds.has(c.id)) return false;
      return !s || c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s);
    });
  }, [countries, q, showAll, configuredDestIds]);

  const pairRate = (destId: string | null) => {
    return (rules ?? []).find((x) =>
      x.scope === "country_pair" && x.is_enabled
      && (x.source_country_id ?? null) === srcDbId
      && (x.destination_country_id ?? null) === destId,
    );
  };

  const rulesCountFor = (destId: string | null) => (rules ?? []).filter((r) =>
    (r.source_country_id ?? null) === srcDbId
    && (r.destination_country_id ?? null) === destId
    && r.scope !== "global" && r.scope !== "vendor",
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack} className="-ml-2 h-8 px-2">
          <ArrowLeft className="mr-1 h-4 w-4" /> Sources
        </Button>
        <div className="flex items-center gap-2 text-sm font-medium">
          {isSourceAll ? <><Globe2 className="h-4 w-4" /> Tous</> : <>{source?.flag_emoji} {labelOf(source)}</>}
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">destinations</span>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Rechercher destination…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-7" />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {showAll
            ? "Tous les pays affichés"
            : `${configuredDestIds.size} destination(s) configurée(s)`}
        </span>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Voir uniquement configurées" : "Voir tous les pays"}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <DestCard isAll rule={pairRate(null)} rulesCount={rulesCountFor(null)} onClick={() => onPick(ALL)} />
        {filtered.map((c) => (
          <DestCard
            key={c.id} country={c} label={labelOf(c)}
            rule={pairRate(c.id)} rulesCount={rulesCountFor(c.id)}
            onClick={() => onPick(c.id)}
          />
        ))}
        {!showAll && filtered.length === 0 && (
          <p className="col-span-full rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            Aucune destination configurée pour ce pays source. Cliquez « Voir tous les pays » pour en ajouter.
          </p>
        )}
      </div>
    </div>
  );
}

function DestCard({ country, isAll, label, rule, rulesCount, onClick }: {
  country?: Country; isAll?: boolean; label?: string;
  rule?: Rule; rulesCount: number; onClick: () => void;
}) {
  return (
    <button
      type="button" onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xl">
          {isAll ? <Globe2 className="h-4 w-4" /> : country?.flag_emoji ?? "🏳️"}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{isAll ? "Toutes destinations" : label}</div>
          <div className="text-[10px] text-muted-foreground">{rulesCount} règles spécifiques</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {rule
          ? <Badge variant="secondary" className="font-bold">{rule.rate_percent}%</Badge>
          : <Badge variant="outline" className="text-muted-foreground">—</Badge>}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}

/* -------------------- LEVEL 3: pair overview -------------------- */
function PairOverview({ sourceId, destinationId, onBack }: {
  sourceId: string; destinationId: string; onBack: () => void;
}) {
  const { data: countries } = useCountries();
  const { data: rules } = useRules();
  const { data: vendors } = useVendorsBySource();
  const { data: cats } = useCategories();
  const labelOf = useCountryLabel();

  const srcDbId = sourceId === ALL ? null : sourceId;
  const dstDbId = destinationId === ALL ? null : destinationId;
  const src = srcDbId ? countries?.find((c) => c.id === srcDbId) ?? null : null;
  const dst = dstDbId ? countries?.find((c) => c.id === dstDbId) ?? null : null;

  const pairRule = (rules ?? []).find((r) =>
    r.scope === "country_pair"
    && (r.source_country_id ?? null) === srcDbId
    && (r.destination_country_id ?? null) === dstDbId,
  );
  const globalRule = (rules ?? []).find((r) => r.scope === "global" && r.is_enabled);

  const categoryRules = (rules ?? []).filter((r) =>
    r.scope === "category"
    && (r.source_country_id ?? null) === srcDbId
    && (r.destination_country_id ?? null) === dstDbId,
  );
  const productRules = (rules ?? []).filter((r) =>
    r.scope === "product"
    && (r.source_country_id ?? null) === srcDbId
    && (r.destination_country_id ?? null) === dstDbId,
  );

  const sourceVendors = (vendors ?? []).filter((v) =>
    (v.profiles?.source_country_id ?? null) === srcDbId);

  const productIds = productRules.map((r) => r.product_id).filter(Boolean) as string[];
  const { data: ruleProducts } = useQuery({
    queryKey: ["pair-product-names", productIds.sort().join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, code").in("id", productIds);
      return (data ?? []) as { id: string; name: string; code: string }[];
    },
  });

  const catName = (id: string) => cats?.find((c) => c.id === id)?.name ?? id;

  const effectiveRate = pairRule?.rate_percent ?? globalRule?.rate_percent ?? 0;
  const effectiveLabel = pairRule
    ? "Règle de la paire"
    : globalRule
      ? "Règle globale (dernier recours)"
      : "Aucune règle (0%)";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={onBack} className="-ml-2 h-8 px-2">
          <ArrowLeft className="mr-1 h-4 w-4" /> Destinations
        </Button>
        <Link
          to="/admin/commissions"
          search={{ source: sourceId, destination: destinationId }}
        >
          <Button size="sm"><Pencil className="mr-1 h-4 w-4" /> Modifier cette paire</Button>
        </Link>
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
          <div className="ml-auto flex items-center gap-2">
            <Badge className="text-base">{effectiveRate}%</Badge>
            <span className="text-[10px] text-muted-foreground">{effectiveLabel}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Règle de la paire (toutes catégories)</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {pairRule ? (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{pairRule.rate_percent}%</Badge>
              <span className="text-muted-foreground">{pairRule.is_enabled ? "Activée" : "Désactivée"}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Aucune règle de paire. Repli sur la règle globale ({globalRule?.rate_percent ?? 0}%).</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Règles par catégorie ({categoryRules.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {categoryRules.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune règle spécifique par catégorie.</p>
          ) : (
            <ul className="divide-y text-sm">
              {categoryRules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate">{catName(r.category_id!)}</span>
                  <Badge variant={r.is_enabled ? "secondary" : "outline"}>{r.rate_percent}%</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Règles par produit ({productRules.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {productRules.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune règle produit spécifique.</p>
          ) : (
            <ul className="divide-y text-sm">
              {productRules.map((r) => {
                const p = ruleProducts?.find((x) => x.id === r.product_id);
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate">{p ? `${p.name} (${p.code})` : r.product_id}</span>
                    <Badge variant={r.is_enabled ? "secondary" : "outline"}>{r.rate_percent}%</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Store className="h-4 w-4" /> Vendeurs de ce pays source ({sourceVendors.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {sourceVendors.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun vendeur enregistré pour ce pays source.</p>
          ) : (
            <ul className="divide-y text-sm">
              {sourceVendors.map((v) => {
                const p = v.profiles;
                return (
                  <li key={v.user_id} className="flex items-center justify-between gap-2 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p?.shop_name || p?.full_name || p?.email}</div>
                      <div className="truncate text-xs text-muted-foreground">{p?.email}</div>
                    </div>
                    <Badge variant={p?.vendor_mode === "commission" ? "secondary" : "outline"}>
                      {p?.vendor_mode === "commission" ? "Avec commission" : "Sans commission"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground">
        Priorité de résolution&nbsp;: produit spécifique → sous-catégorie → catégorie → règle de la paire → règle globale.
      </p>
    </div>
  );
}
