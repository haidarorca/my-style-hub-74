import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Zap, Search, X, AlertTriangle, DollarSign, Package,
  Truck, CheckCircle2, ChevronDown, Eye, EyeOff, Phone,
  TrendingUp, Users, Receipt, CreditCard, ShieldAlert,
  ClipboardCheck, Ship, Ban, Clock
} from "lucide-react";
import { useWorkflowOrders } from "@/hooks/use-workflow-orders";
import { WorkflowTable, WorkflowDrawer } from "@/components/workflow";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { WorkflowRow } from "@/types/workflow";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/workflow-center")({
  component: WorkflowCenter,
});

/* ═══════════════════════════════════════════════════════════════
   WORKFLOW CENTER — CENTRE DE PILOTAGE KAWZONE
   Logistique + Paiements + Dettes + Validations Client
   ═══════════════════════════════════════════════════════════════ */

function WorkflowCenter() {
  const { rows, isLoading, error, applySearch } = useWorkflowOrders();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRow, setSelectedRow] = useState<WorkflowRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["urgent", "payment", "to_weigh", "to_confirm", "waiting_client", "ready_to_ship"])
  );

  /* ── Filtre principal : par défaut tout sauf terminées ── */
  const activeRows = useMemo(() => {
    let result = rows;
    if (!showArchived) {
      result = result.filter(r =>
        r.logistics_status !== "delivered" && r.logistics_status !== "shipped"
      );
    }
    if (searchTerm.trim()) {
      result = applySearch(result, searchTerm);
    }
    return result;
  }, [rows, showArchived, searchTerm, applySearch]);

  /* ── Groupes métier (calculés sur les données réelles) ── */
  const groups = useMemo(() => {
    const g: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; border: string; rows: WorkflowRow[] }> = {
      urgent:       { label: "Urgences", icon: <ShieldAlert className="h-4 w-4" />, color: "text-red-700", bg: "bg-red-50", border: "border-red-200", rows: [] },
      payment:      { label: "Paiements manquants", icon: <Receipt className="h-4 w-4" />, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", rows: [] },
      to_weigh:     { label: "À peser", icon: <Package className="h-4 w-4" />, color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", rows: [] },
      to_confirm:   { label: "À confirmer", icon: <ClipboardCheck className="h-4 w-4" />, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", rows: [] },
      waiting_client: { label: "Attente validation client", icon: <Clock className="h-4 w-4" />, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", rows: [] },
      ready_to_ship:{ label: "Prêtes à expédier", icon: <Ship className="h-4 w-4" />, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", rows: [] },
      in_progress:  { label: "En cours", icon: <TrendingUp className="h-4 w-4" />, color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200", rows: [] },
      shipped:      { label: "Expédiées", icon: <Truck className="h-4 w-4" />, color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200", rows: [] },
      delivered:    { label: "Livrées", icon: <CheckCircle2 className="h-4 w-4" />, color: "text-green-600", bg: "bg-green-50", border: "border-green-200", rows: [] },
    };

    for (const row of activeRows) {
      const ls = row.logistics_status;
      const rem = row.amount_remaining ?? 0;
      const paid = row.amount_paid ?? 0;
      const total = row.order_total ?? 0;

      // 1. URGENCES : awaiting_weighing > 7j OU rejected
      if ((ls === "awaiting_weighing" && row.days_pending > 7) || ls === "rejected") {
        g.urgent.rows.push(row);
      }
      // 2. PAIEMENTS MANQUANTS : reste > 0 ET (pending/partial/null)
      else if (rem > 0 && (!row.payment_status || row.payment_status === "pending" || row.payment_status === "partial")) {
        g.payment.rows.push(row);
      }
      // 3. À PESER : awaiting_weighing ≤ 7j
      else if (ls === "awaiting_weighing") {
        g.to_weigh.rows.push(row);
      }
      // 4. À CONFIRMER : local new/null
      else if (row.order_type === "local" && (ls === "new" || ls === null)) {
        g.to_confirm.rows.push(row);
      }
      // 5. ATTENTE CLIENT : awaiting_client_validation
      else if (ls === "awaiting_client_validation") {
        g.waiting_client.rows.push(row);
      }
      // 6. PRÊTES : validated (avec ou sans reste) OU ready_to_ship
      else if (ls === "validated" || ls === "ready_to_ship") {
        g.ready_to_ship.rows.push(row);
      }
      // 7. EXPÉDIÉES
      else if (ls === "shipped") {
        g.shipped.rows.push(row);
      }
      // 8. LIVRÉES
      else if (ls === "delivered") {
        g.delivered.rows.push(row);
      }
      // 9. EN COURS : fees_calculated, confirmed local, etc.
      else {
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
                {kpi.total} commandes · {kpi.clients} clients · {fmtF(kpi.debt)} dette totale
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowArchived(!showArchived)} className="h-8 text-xs">
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

        {/* ═══ RECHERCHE ═══ */}
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Rechercher : nom, téléphone, ID commande, tracking, montant..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 pr-9 h-10"
          />
          {searchTerm && (
            <Button variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0" onClick={() => setSearchTerm("")}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {searchTerm && (
          <p className="text-xs text-muted-foreground">
            {activeRows.length} résultat{activeRows.length > 1 ? "s" : ""} pour « {searchTerm} »
          </p>
        )}

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
