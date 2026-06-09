// @ts-nocheck
import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Zap, Search, X, AlertTriangle, DollarSign, Package,
  Truck, CheckCircle2, ChevronDown, Eye, EyeOff,
  TrendingUp, Users, Receipt, ShieldAlert,
  ClipboardCheck, Ship, Clock
} from "lucide-react";
import { useWorkflowOrders } from "@/hooks/use-workflow-orders";
import { useWorkflowFilters } from "@/hooks/use-workflow-filters";
import { WorkflowTable, WorkflowDrawer, WorkflowFilterPanel } from "@/components/workflow";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WorkflowRow } from "@/types/workflow";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/workflow-center")({
  component: WorkflowCenter,
});

/* ═══════════════════════════════════════════════════════════════
   WORKFLOW CENTER — CENTRE DE PILOTAGE KAWZONE
   Filtres combinatoires Excel + Cockpit opérationnel
   ═══════════════════════════════════════════════════════════════ */

function WorkflowCenter() {
  const { rows, isLoading, error } = useWorkflowOrders();

  /* ── Système de filtres combinatoires ── */
  const {
    filters,
    activeCount,
    filteredRows,
    options,
    updateFilter,
    resetFilters,
    toggleArrayValue,
  } = useWorkflowFilters(rows);

  const [selectedRow, setSelectedRow] = useState<WorkflowRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["urgent", "payment", "to_weigh", "to_confirm", "waiting_client", "ready_to_ship"])
  );

  /* ── Filtre : masquer terminées + recherche ── */
  const activeRows = useMemo(() => {
    let result = filteredRows;
    if (!showArchived) {
      result = result.filter(r =>
        r.logistics_status !== "delivered" && r.logistics_status !== "shipped"
      );
    }
    return result;
  }, [filteredRows, showArchived]);

  /* ── Groupes métier ── */
  const groups = useMemo(() => {
    const g: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; border: string; rows: WorkflowRow[] }> = {
      urgent:       { label: "🔴 Urgences", icon: <ShieldAlert className="h-4 w-4" />, color: "text-red-700", bg: "bg-red-50", border: "border-red-200", rows: [] },
      payment:      { label: "💰 Paiements manquants", icon: <Receipt className="h-4 w-4" />, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", rows: [] },
      to_weigh:     { label: "⚖️ À peser", icon: <Package className="h-4 w-4" />, color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", rows: [] },
      to_confirm:   { label: "✅ À confirmer", icon: <ClipboardCheck className="h-4 w-4" />, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", rows: [] },
      waiting_client: { label: "👤 Attente client", icon: <Clock className="h-4 w-4" />, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", rows: [] },
      ready_to_ship:{ label: "🚚 Prêtes à expédier", icon: <Ship className="h-4 w-4" />, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", rows: [] },
      in_progress:  { label: "⏳ En cours", icon: <TrendingUp className="h-4 w-4" />, color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200", rows: [] },
      shipped:      { label: "📦 Expédiées", icon: <Truck className="h-4 w-4" />, color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200", rows: [] },
      delivered:    { label: "🎉 Livrées", icon: <CheckCircle2 className="h-4 w-4" />, color: "text-green-600", bg: "bg-green-50", border: "border-green-200", rows: [] },
    };

    for (const row of activeRows) {
      const ls = row.logistics_status;
      const rem = row.amount_remaining ?? 0;

      if ((ls === "awaiting_weighing" && row.days_pending > 7) || ls === "rejected") {
        g.urgent.rows.push(row);
      } else if (rem > 0 && (!row.payment_status || row.payment_status === "pending" || row.payment_status === "partial")) {
        g.payment.rows.push(row);
      } else if (ls === "awaiting_weighing") {
        g.to_weigh.rows.push(row);
      } else if (row.order_type === "local" && (ls === "new" || ls === null)) {
        g.to_confirm.rows.push(row);
      } else if (ls === "awaiting_client_validation") {
        g.waiting_client.rows.push(row);
      } else if (ls === "validated" || ls === "ready_to_ship") {
        g.ready_to_ship.rows.push(row);
      } else if (ls === "shipped") {
        g.shipped.rows.push(row);
      } else if (ls === "delivered") {
        g.delivered.rows.push(row);
      } else {
        g.in_progress.rows.push(row);
      }
    }
    return Object.entries(g).filter(([, v]) => v.rows.length > 0);
  }, [activeRows]);

  /* ── KPI cockpit ── */
  const kpi = useMemo(() => {
    const urg = rows.filter(r => r.logistics_status === "awaiting_weighing" && r.days_pending > 7).length
      + rows.filter(r => r.logistics_status === "rejected").length;
    const pay = rows.filter(r => (r.amount_remaining ?? 0) > 0 && (!r.payment_status || r.payment_status === "pending" || r.payment_status === "partial")).length;
    const debt = rows.reduce((s, r) => s + (r.amount_remaining ?? 0), 0);
    const weigh = rows.filter(r => r.logistics_status === "awaiting_weighing").length;
    const confirm = rows.filter(r => r.order_type === "local" && (r.logistics_status === "new" || r.logistics_status === null)).length;
    const clients = new Set(rows.map(r => r.customer_phone).filter(Boolean)).size;
    return { urg, pay, debt, weigh, confirm, clients, total: rows.length };
  }, [rows]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(p => {
      const n = new Set(p);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  /* ── Chips de filtres actifs ── */
  const activeFilterChips = useMemo(() => {
    const chips: { label: string; onRemove: () => void }[] = [];
    if (filters.search) chips.push({ label: `Recherche: "${filters.search}"`, onRemove: () => updateFilter("search", "") });
    filters.countries.forEach(c => chips.push({ label: `Pays: ${c}`, onRemove: () => toggleArrayValue("countries", c) }));
    filters.orderTypes.forEach(t => chips.push({ label: `Type: ${t}`, onRemove: () => toggleArrayValue("orderTypes", t) }));
    filters.logisticsStatuses.forEach(s => chips.push({ label: `Statut: ${s}`, onRemove: () => toggleArrayValue("logisticsStatuses", s) }));
    filters.paymentStatuses.forEach(s => {
      const labels: Record<string, string> = { paid: "Payé", partial: "Partiel", pending: "Non payé", cod: "À réception" };
      chips.push({ label: `Paiement: ${labels[s] ?? s}`, onRemove: () => toggleArrayValue("paymentStatuses", s) });
    });
    if (filters.hasDebt !== null) chips.push({ label: filters.hasDebt ? "Avec dette" : "Soldé", onRemove: () => updateFilter("hasDebt", null) });
    return chips;
  }, [filters, updateFilter, toggleArrayValue]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" richColors />

      {/* ═══ EN-TÊTE ═══ */}
      <div className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 text-white p-1.5 rounded-lg">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Centre de pilotage</h1>
              <p className="text-[11px] text-muted-foreground">
                {kpi.total} commandes · {kpi.clients} clients · {fmtF(kpi.debt)} dette
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Bouton filtres */}
            <WorkflowFilterPanel
              filters={filters}
              activeCount={activeCount}
              options={options}
              filteredCount={filteredRows.length}
              totalCount={rows.length}
              onUpdate={updateFilter}
              onToggleArray={toggleArrayValue}
              onReset={resetFilters}
            />
            <Button variant="outline" size="sm" onClick={() => setShowArchived(!showArchived)} className="h-9 text-xs">
              {showArchived ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
              {showArchived ? "Masquer livrées" : "Voir livrées"}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 py-4 space-y-4">
        {/* ═══ KPI CARDS ═══ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard icon={<ShieldAlert className="h-5 w-5 text-red-500" />} label="Urgences" value={kpi.urg} sub="Action immédiate" color="border-red-200 bg-white" />
          <KpiCard icon={<Receipt className="h-5 w-5 text-amber-500" />} label="Paiements" value={kpi.pay} sub={fmtF(kpi.debt) + " dette"} color="border-amber-200 bg-white" />
          <KpiCard icon={<Package className="h-5 w-5 text-orange-500" />} label="À peser" value={kpi.weigh} sub="Colis en attente" color="border-orange-200 bg-white" />
          <KpiCard icon={<ClipboardCheck className="h-5 w-5 text-purple-500" />} label="À confirmer" value={kpi.confirm} sub="Commandes locales" color="border-purple-200 bg-white" />
          <KpiCard icon={<Users className="h-5 w-5 text-blue-500" />} label="Clients" value={kpi.clients} sub="Téléphones uniques" color="border-blue-200 bg-white" />
          <KpiCard icon={<DollarSign className="h-5 w-5 text-emerald-500" />} label="Dette" value={fmtF(kpi.debt)} sub="Montant total" color="border-emerald-200 bg-white" />
        </div>

        {/* ═══ CHIPS FILTRES ACTIFS ═══ */}
        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activeFilterChips.map((chip, i) => (
              <Badge key={i} variant="secondary" className="text-[11px] gap-1 pl-2 pr-1 py-0.5 cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors" onClick={chip.onRemove}>
                {chip.label}
                <X className="h-3 w-3" />
              </Badge>
            ))}
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={resetFilters}>
              Tout effacer
            </Button>
          </div>
        )}

        {/* ═══ RÉSULTAT ═══ */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {activeRows.length} commande{activeRows.length > 1 ? "s" : ""}
            {activeCount > 0 && ` (filtrées sur ${rows.length})`}
          </p>
        </div>

        {/* ═══ GROUPES ═══ */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Chargement des commandes…</div>
        ) : error ? (
          <div className="text-center py-12 text-red-600 text-sm">Erreur : {error instanceof Error ? error.message : "Inconnue"}</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-400 mb-3" />
            <p className="text-lg font-semibold text-emerald-700">Tout est à jour !</p>
            <p className="text-sm text-muted-foreground mt-1">Aucune action requise pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(([key, group]) => (
              <div key={key} className={cn("rounded-xl border overflow-hidden", group.border, group.bg)}>
                <button onClick={() => toggleGroup(key)} className={cn("w-full flex items-center justify-between px-4 py-3", group.bg)}>
                  <div className="flex items-center gap-2.5">
                    <span className={group.color}>{group.icon}</span>
                    <span className={cn("font-semibold text-sm", group.color)}>{group.label}</span>
                    <span className="text-xs font-bold bg-white/70 px-2 py-0.5 rounded-full">{group.rows.length}</span>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !expandedGroups.has(key) && "-rotate-90")} />
                </button>
                {expandedGroups.has(key) && (
                  <div className="bg-white">
                    <WorkflowTable rows={group.rows} onViewDetail={setSelectedRow} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <WorkflowDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
  );
}

/* ── KPI Card ── */
function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className={cn("rounded-xl border p-3", color)}>
      <div className="flex items-start justify-between">
        {icon}
        <div className="text-right">
          <div className="text-xl font-bold leading-tight">{value}</div>
          <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5">{sub}</div>
    </div>
  );
}

function fmtF(n: number): string {
  if (!n || n === 0) return "0 FCFA";
  return n.toLocaleString("fr-FR") + " FCFA";
}
