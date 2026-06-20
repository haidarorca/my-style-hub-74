// ═══════════════════════════════════════════════════════════════
// /admin/commandes — Vue globale "commande client" (mère).
//
// Page TOTALEMENT INDÉPENDANTE du Cockpit :
//   - n'écrit rien,
//   - ne touche ni au workflow, ni aux drawers, ni à la pesée,
//   - réutilise UNIQUEMENT les hooks/lib existants :
//       useRealOrders, useSubOrderRows, getOrderFinancials,
//       getOrderNumber, deriveManagedSubOrders (via useSubOrderRows).
//
// Une ligne = UNE commande mère (≠ Cockpit qui éclate par sous-commande).
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Search, Filter, Phone, MapPin, Calendar, Package,
  CheckCircle2, Clock, AlertCircle, XCircle, Circle, ChevronRight,
} from "lucide-react";
import { useRealOrders } from "@/cockpit/hooks/useRealOrders";
import { useSubOrderRows, type SubOrderRow } from "@/cockpit/hooks/useSubOrderRows";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

export const Route = createFileRoute("/admin/commandes")({
  component: CommandesPage,
});

/* ────────────────────────────────────────────────────────────── */
/* Helpers                                                        */
/* ────────────────────────────────────────────────────────────── */

const fmtF = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};
const fmtDateShort = (iso?: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR");
};

type GlobalStatus =
  | "cancelled" | "delivered" | "awaiting_payment"
  | "ready_delivery" | "to_weigh" | "to_process" | "in_progress";

const STATUS_BADGE: Record<GlobalStatus, { label: string; cls: string; tab: string }> = {
  cancelled:        { label: "Annulée",            cls: "bg-red-100 text-red-700 border-red-200",          tab: "cancelled" },
  delivered:        { label: "Terminée",           cls: "bg-emerald-100 text-emerald-700 border-emerald-200", tab: "delivered" },
  awaiting_payment: { label: "En attente paiement", cls: "bg-orange-100 text-orange-700 border-orange-200",  tab: "awaiting_payment" },
  ready_delivery:   { label: "Prête livraison",    cls: "bg-sky-100 text-sky-700 border-sky-200",            tab: "ready_delivery" },
  to_weigh:         { label: "À peser",            cls: "bg-amber-100 text-amber-700 border-amber-200",     tab: "to_weigh" },
  to_process:       { label: "À traiter",          cls: "bg-purple-100 text-purple-700 border-purple-200",  tab: "to_process" },
  in_progress:      { label: "En cours",           cls: "bg-blue-100 text-blue-700 border-blue-200",        tab: "in_progress" },
};

const LINE_KIND_LABEL: Record<string, string> = {
  LOCAL: "Local",
  IMPORT_KNOWN_WEIGHT: "Import (Poids déclaré)",
  IMPORT_UNKNOWN_WEIGHT: "Import (Poids inconnu)",
};

function subDotColor(status: string): string {
  if (status === "delivered") return "bg-emerald-500";
  if (status === "cancelled") return "bg-red-500";
  if (status === "new" || status === "" || !status) return "bg-gray-300";
  return "bg-orange-400";
}

/* ─── Workflows par circuit (alignés sur src/cockpit/lib/workflow.ts) ─── */
const FLOW_STEPS: Record<string, string[]> = {
  LOCAL: ["new", "confirmed", "preparing", "ready", "shipped", "delivered"],
  IMPORT_KNOWN_WEIGHT: ["new", "confirmed", "ordered_supplier", "received_warehouse", "ready_delivery", "shipped", "delivered"],
  IMPORT_UNKNOWN_WEIGHT: ["new", "confirmed", "ordered_supplier", "received_warehouse", "awaiting_weighing", "fees_calculated", "payment_fees", "ready_delivery", "shipped", "delivered"],
};

/** Progression d'UNE sous-commande dans son propre circuit.
 *  Retourne { step, total } — step = 1-indexed (statut atteint).
 *  `cancelled` → step = total. Statut inconnu → step = 1. */
function subProgress(lineKind: string, status: string): { step: number; total: number } {
  const steps = FLOW_STEPS[lineKind] ?? FLOW_STEPS.LOCAL;
  const total = steps.length;
  const s = (status || "new").trim();
  if (s === "cancelled") return { step: total, total };
  const idx = steps.indexOf(s);
  if (idx < 0) return { step: 1, total };
  return { step: idx + 1, total };
}

/** Dérive le statut global d'une commande mère à partir de ses sous-commandes
 *  visibles (managed). Aucune nouvelle règle métier : on mappe uniquement les
 *  statuts existants des sous-commandes + le `remaining` financier existant. */
function deriveGlobalStatus(
  order: LogisticsOrderRow,
  subs: SubOrderRow[],
  remaining: number,
): GlobalStatus {
  if (order.logistics_status === "cancelled") return "cancelled";
  if (subs.length === 0) {
    if (order.logistics_status === "delivered") return "delivered";
    return "to_process";
  }
  const statuses = subs.map(s => s.effective_status || "new");
  if (statuses.every(s => s === "cancelled")) return "cancelled";
  const live = statuses.filter(s => s !== "cancelled");
  if (live.length === 0) return "cancelled";
  if (live.every(s => s === "delivered")) return "delivered";
  if (remaining > 0 && live.some(s => s === "ready_delivery" || s === "awaiting_weighing" || s === "fees_calculated" || s === "payment_fees")) {
    return "awaiting_payment";
  }
  if (live.some(s => s === "ready_delivery")) return "ready_delivery";
  if (live.some(s => s === "awaiting_weighing")) return "to_weigh";
  if (live.every(s => s === "new" || s === "")) return "to_process";
  return "in_progress";
}

interface MotherView {
  order: LogisticsOrderRow;
  kz: string;
  subs: SubOrderRow[];
  fin: { productTotal: number; freight: number; grandTotal: number; paid: number; remaining: number };
  total: number;
  done: number;
  globalStatus: GlobalStatus;
  lastActivity: string | null;
}

/* ────────────────────────────────────────────────────────────── */
/* Page                                                           */
/* ────────────────────────────────────────────────────────────── */

const TABS: { key: "all" | GlobalStatus | "in_progress" | "to_process"; label: string }[] = [
  { key: "all",              label: "Toutes" },
  { key: "in_progress",      label: "En cours" },
  { key: "to_process",       label: "À traiter" },
  { key: "awaiting_payment", label: "En attente paiement" },
  { key: "to_weigh",         label: "À peser" },
  { key: "ready_delivery",   label: "Prête livraison" },
  { key: "delivered",        label: "Terminées" },
  { key: "cancelled",        label: "Annulées" },
];

function CommandesPage() {
  const { orders, getOrderFinancials, getSubOrderStatus, orderTypeMap, isLoading } = useRealOrders();
  const { rows: subRows } = useSubOrderRows(orders, getSubOrderStatus);

  // ── État filtres ──
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<string>("all");
  const [type, setType] = useState<string>("all");      // order_type : local / import / mixed
  const [circuit, setCircuit] = useState<string>("all");// line_kind présent dans une sous-commande
  const [tab, setTab] = useState<string>("all");

  // ── Construction des "commandes mères" ──
  const mothers = useMemo<MotherView[]>(() => {
    const subsByOrder = new Map<string, SubOrderRow[]>();
    for (const r of subRows) {
      const arr = subsByOrder.get(r.mother_order_id) ?? [];
      arr.push(r);
      subsByOrder.set(r.mother_order_id, arr);
    }
    return orders
      .filter(o => !!o.order_id)
      .map(o => {
        const oid = o.order_id!;
        const subs = (subsByOrder.get(oid) ?? []).slice().sort((a, b) => a.index - b.index);
        const fin = getOrderFinancials(o);
        const done = subs.filter(s => s.effective_status === "delivered").length;
        const globalStatus = deriveGlobalStatus(o, subs, fin.remaining);
        const lastActivity =
          o.updated_at ?? o.shipped_at ?? o.weighed_at ?? o.warehouse_received_at ?? o.order_created_at ?? null;
        return {
          order: o,
          kz: getOrderNumber(oid),
          subs,
          fin,
          total: subs.length,
          done,
          globalStatus,
          lastActivity,
        };
      })
      .sort((a, b) => {
        const ta = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        const tb = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
        return tb - ta;
      });
  }, [orders, subRows, getOrderFinancials]);

  // ── Filtrage ──
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return mothers.filter(m => {
      if (tab !== "all" && m.globalStatus !== tab) return false;
      if (country !== "all" && (m.order.destination_country_name ?? "") !== country) return false;
      if (type !== "all") {
        const t = orderTypeMap[m.order.order_id!] ?? m.order.order_type;
        if (t !== type) return false;
      }
      if (circuit !== "all" && !m.subs.some(sub => sub.line_kind === circuit)) return false;
      if (s) {
        const hay = [
          m.kz, m.order.order_id, m.order.customer_name, m.order.customer_phone,
          m.order.destination_country_name, m.order.customer_city,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [mothers, tab, country, type, circuit, search, orderTypeMap]);

  // ── Compteurs onglets ──
  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { all: mothers.length };
    for (const m of mothers) c[m.globalStatus] = (c[m.globalStatus] ?? 0) + 1;
    return c;
  }, [mothers]);

  // ── Listes filtres ──
  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const m of mothers) if (m.order.destination_country_name) set.add(m.order.destination_country_name);
    return Array.from(set).sort();
  }, [mothers]);

  const reset = () => { setSearch(""); setCountry("all"); setType("all"); setCircuit("all"); setTab("all"); };

  /* ─── RENDER ─── */
  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Commandes</h1>
          <p className="text-xs text-muted-foreground">
            Vue globale de toutes les commandes (regroupement de toutes les sous-commandes)
          </p>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Filter className="h-3.5 w-3.5" /> {filtered.length} / {mothers.length} commandes
        </div>
      </div>

      {/* Onglets rapides */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(t => {
          const count = tabCounts[t.key] ?? 0;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-foreground border-border hover:bg-accent",
              )}
            >
              {t.label}
              <span className={cn(
                "rounded-full px-1.5 py-0 text-[10px] font-bold",
                active ? "bg-primary-foreground/20" : "bg-muted",
              )}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filtres */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <div className="col-span-2 lg:col-span-2 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une commande, un client…"
            className="pl-8 h-9"
          />
        </div>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Pays" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Pays : Tous</SelectItem>
            {countries.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Type : Tous</SelectItem>
            <SelectItem value="local">Local</SelectItem>
            <SelectItem value="import">Import</SelectItem>
            <SelectItem value="mixte">Mixte</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Select value={circuit} onValueChange={setCircuit}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Circuit" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Circuit : Tous</SelectItem>
              <SelectItem value="LOCAL">Local</SelectItem>
              <SelectItem value="IMPORT_KNOWN_WEIGHT">Import (Poids déclaré)</SelectItem>
              <SelectItem value="IMPORT_UNKNOWN_WEIGHT">Import (Poids inconnu)</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={reset}>Réinit.</Button>
        </div>
      </div>

      {/* Loading / Empty */}
      {isLoading && mothers.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-12">Chargement des commandes…</div>
      )}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-12 border rounded-lg bg-muted/20">
          Aucune commande ne correspond aux filtres.
        </div>
      )}

      {/* DESKTOP : tableau */}
      <div className="hidden lg:block">
        {filtered.length > 0 && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="grid grid-cols-[1.4fr_1.6fr_1fr_2fr_1.6fr_1.4fr_1fr_1.4fr] gap-3 px-4 py-2.5 border-b bg-muted/40 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              <div>Commande</div>
              <div>Client</div>
              <div>Pays</div>
              <div>Sous-commandes</div>
              <div>Paiement</div>
              <div>Statut global</div>
              <div>Progression</div>
              <div>Dernière activité</div>
            </div>
            {filtered.map(m => <DesktopRow key={m.order.order_id} m={m} />)}
          </div>
        )}
      </div>

      {/* MOBILE : cartes */}
      <div className="lg:hidden space-y-2">
        {filtered.map(m => <MobileCard key={m.order.order_id} m={m} />)}
      </div>

      {/* Légende */}
      {filtered.length > 0 && (
        <div className="mt-4 rounded-lg border bg-muted/20 p-3 text-[11px] text-muted-foreground hidden lg:grid grid-cols-2 gap-3">
          <div>
            <div className="font-semibold text-foreground mb-1.5">Légende des statuts</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Legend dot="bg-emerald-500" label="Terminé" />
              <Legend dot="bg-orange-400" label="En cours / À traiter" />
              <Legend dot="bg-amber-400" label="En attente paiement" />
              <Legend dot="bg-sky-400" label="Prête livraison" />
              <Legend dot="bg-gray-300" label="Non démarrée" />
              <Legend dot="bg-red-500" label="Annulée" />
            </div>
          </div>
          <div>
            <div className="font-semibold text-foreground mb-1.5">Informations affichées</div>
            <ul className="space-y-0.5 list-disc pl-4">
              <li>Toutes les commandes dans une seule vue.</li>
              <li>Regroupement automatique des sous-commandes.</li>
              <li>Progression basée sur les sous-commandes terminées.</li>
              <li>Filtrage par pays, type et circuit.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Sous-composants                                                */
/* ────────────────────────────────────────────────────────────── */

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      {label}
    </span>
  );
}

function StatusBadge({ s }: { s: GlobalStatus }) {
  const b = STATUS_BADGE[s];
  const Icon = s === "delivered" ? CheckCircle2
    : s === "cancelled" ? XCircle
    : s === "awaiting_payment" ? AlertCircle
    : s === "ready_delivery" ? Package
    : s === "to_weigh" ? Clock
    : Circle;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
      b.cls,
    )}>
      <Icon className="h-3 w-3" /> {b.label}
    </span>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-mono font-bold text-foreground">{done}/{total || 1}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full transition-all",
            pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : "bg-orange-400",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SubLine({ s }: { s: SubOrderRow }) {
  const label = LINE_KIND_LABEL[s.line_kind] ?? s.line_kind;
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className={cn("h-2 w-2 rounded-full shrink-0", subDotColor(s.effective_status))} />
      <span className="font-mono text-muted-foreground">{s.index}/{s.total}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}

function DesktopRow({ m }: { m: MotherView }) {
  const o = m.order;
  const flag = o.destination_country_id ? "🏳️" : "";
  return (
    <div className="grid grid-cols-[1.4fr_1.6fr_1fr_2fr_1.6fr_1.4fr_1fr_1.4fr] gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-muted/30 transition-colors text-xs">
      {/* Commande */}
      <div>
        <div className="font-bold text-sm">{m.kz}</div>
        <div className="text-[11px] text-muted-foreground">{fmtDate(o.order_created_at)}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {m.total} sous-commande{m.total > 1 ? "s" : ""}
        </div>
      </div>
      {/* Client */}
      <div>
        <div className="font-medium">{o.customer_name ?? "—"}</div>
        {o.customer_phone && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Phone className="h-3 w-3" /> {o.customer_phone}
          </div>
        )}
      </div>
      {/* Pays */}
      <div>
        <div className="font-medium">{flag} {o.destination_country_name ?? "—"}</div>
        {o.customer_city && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3" /> ({o.customer_city})
          </div>
        )}
      </div>
      {/* Sous-commandes */}
      <div className="space-y-0.5 min-w-0">
        {m.subs.length === 0
          ? <div className="text-[11px] text-muted-foreground italic">Aucune</div>
          : m.subs.map(s => <SubLine key={s.sub_order_key} s={s} />)}
      </div>
      {/* Paiement */}
      <div>
        <div className="font-bold">{fmtF(m.fin.grandTotal)}</div>
        <div className="text-[11px] text-emerald-700">Payé : {fmtF(m.fin.paid)}</div>
        <div className={cn("text-[11px] font-medium", m.fin.remaining > 0 ? "text-red-600" : "text-emerald-700")}>
          Reste : {fmtF(m.fin.remaining)}
        </div>
      </div>
      {/* Statut */}
      <div className="flex items-start"><StatusBadge s={m.globalStatus} /></div>
      {/* Progression */}
      <div className="self-center"><ProgressBar done={m.done} total={m.total} /></div>
      {/* Dernière activité */}
      <div className="flex items-center justify-between gap-1">
        <div className="text-[11px] text-muted-foreground">{fmtDate(m.lastActivity)}</div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </div>
  );
}

function MobileCard({ m }: { m: MotherView }) {
  const o = m.order;
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-bold text-sm">{m.kz}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {fmtDateShort(o.order_created_at)}
          </div>
        </div>
        <StatusBadge s={m.globalStatus} />
      </div>

      {/* Client + Pays + Montants */}
      <div className="grid grid-cols-[1fr_auto] gap-3 mb-2">
        <div className="min-w-0 space-y-0.5">
          <div className="text-sm font-medium truncate">{o.customer_name ?? "—"}</div>
          {o.customer_phone && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
              <Phone className="h-3 w-3 shrink-0" /> {o.customer_phone}
            </div>
          )}
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
            <MapPin className="h-3 w-3 shrink-0" /> {o.destination_country_name ?? "—"}{o.customer_city ? ` (${o.customer_city})` : ""}
          </div>
        </div>
        <div className="text-right text-[11px] shrink-0">
          <div>Payé : <span className="font-semibold text-emerald-700">{fmtF(m.fin.paid)}</span></div>
          <div>Reste : <span className={cn("font-semibold", m.fin.remaining > 0 ? "text-red-600" : "text-emerald-700")}>{fmtF(m.fin.remaining)}</span></div>
          <div className="font-bold mt-0.5">Total : {fmtF(m.fin.grandTotal)}</div>
        </div>
      </div>

      {/* Sous-commandes inline */}
      {m.subs.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-2 mb-2 space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {m.total} sous-commande{m.total > 1 ? "s" : ""}
          </div>
          {m.subs.map(s => <SubLine key={s.sub_order_key} s={s} />)}
        </div>
      )}

      {/* Progression */}
      <ProgressBar done={m.done} total={m.total} />

      {/* Dernière activité */}
      <div className="mt-2 pt-2 border-t flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Dernière activité : {fmtDateShort(m.lastActivity)}</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </div>
  );
}
