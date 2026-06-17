// @ts-nocheck
import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Zap, Search, X, AlertTriangle, DollarSign, Package,
  Truck, CheckCircle2, ChevronDown, Eye, EyeOff,
  TrendingUp, Users, Receipt, ShieldAlert,
  ClipboardCheck, Ship, Clock, Phone, CreditCard,
  Scale, BarChart3, ArrowRight
} from "lucide-react";
import { useWorkflowOrders } from "@/hooks/use-workflow-orders";
import { useWorkflowFilters } from "@/hooks/use-workflow-filters";
import { WorkflowTable, WorkflowDrawer, WorkflowFilterPanel } from "@/components/workflow";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorkflowRow } from "@/types/workflow";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/workflow-center")({
  component: WorkflowCenter,
});

/* ═══════════════════════════════════════════════════════════════
   WORKFLOW CENTER BETA — CENTRE DE PILOTAGE KAWZONE
   
   3 vues :
   1. ACTIONS — Ce qui necessite une action AUJOURD'HUI (defaut)
   2. TOUTES — Toutes les commandes avec recherche/filtres
   3. CLIENTS — Compte client global avec dettes
   ═══════════════════════════════════════════════════════════════ */

function WorkflowCenter() {
  const { rows, isLoading, error } = useWorkflowOrders();
  const [activeView, setActiveView] = useState<"actions" | "all" | "clients">("actions");
  const [selectedRow, setSelectedRow] = useState<WorkflowRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["urgent", "payment", "to_weigh", "to_confirm", "waiting_client", "ready_to_ship"])
  );
  const [searchTerm, setSearchTerm] = useState("");

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

  /* ── Numérotation globale ── */
  const rowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r, i) => map.set(r.order_id, i + 1));
    return map;
  }, [rows]);

  /* ── KPI cockpit : des ACTIONS, pas juste des chiffres ── */
  const kpi = useMemo(() => {
    const urgents = rows.filter(r =>
      (r.logistics_status === "awaiting_weighing" && r.days_pending > 7) ||
      r.logistics_status === "rejected"
    );
    const unpaid = rows.filter(r =>
      (r.amount_remaining ?? 0) > 0 &&
      r.logistics_status !== "delivered" &&
      r.logistics_status !== "cancelled"
    );
    const toWeigh = rows.filter(r => r.logistics_status === "awaiting_weighing");
    const toConfirm = rows.filter(r =>
      r.order_type === "local" && (r.logistics_status === "new" || r.logistics_status === null)
    );
    const waitingClient = rows.filter(r => r.logistics_status === "awaiting_client_validation");
    const readyToShip = rows.filter(r =>
      r.logistics_status === "validated" || r.logistics_status === "ready_to_ship"
    );
    const totalDebt = rows.reduce((s, r) => s + (r.amount_remaining ?? 0), 0);
    const debtors = new Set(rows.filter(r => (r.amount_remaining ?? 0) > 0).map(r => r.customer_phone)).size;

    return {
      urgentCount: urgents.length,
      unpaidCount: unpaid.length,
      toWeighCount: toWeigh.length,
      toConfirmCount: toConfirm.length,
      waitingClientCount: waitingClient.length,
      readyToShipCount: readyToShip.length,
      totalDebt,
      debtors,
      totalOrders: rows.length,
    };
  }, [rows]);

  /* ── Vue ACTIONS : commandes necessitant une action ── */
  const actionGroups = useMemo(() => {
    const groups: Record<string, { label: string; sublabel: string; icon: React.ReactNode; color: string; bg: string; border: string; rows: WorkflowRow[]; actionLabel: string }> = {
      urgent:       { label: "🔴 Urgences", sublabel: "Bloquees depuis +7 jours ou retournees", icon: <ShieldAlert className="h-5 w-5" />, color: "text-red-700", bg: "bg-red-50", border: "border-red-300", rows: [], actionLabel: "Traiter" },
      payment:      { label: "💰 Paiements manquants", sublabel: "Commandes avec dette non soldee", icon: <Receipt className="h-5 w-5" />, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-300", rows: [], actionLabel: "Relancer" },
      to_weigh:     { label: "⚖️ A peser", sublabel: "Colis recus, en attente de pesee", icon: <Scale className="h-5 w-5" />, color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-300", rows: [], actionLabel: "Peser" },
      to_confirm:   { label: "✅ A confirmer", sublabel: "Commandes locales nouvelles", icon: <ClipboardCheck className="h-5 w-5" />, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-300", rows: [], actionLabel: "Confirmer" },
      waiting_client: { label: "👤 Attente client", sublabel: "Frais envoyes, en attente de validation", icon: <Clock className="h-5 w-5" />, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-300", rows: [], actionLabel: "Relancer" },
      ready_to_ship:{ label: "🚚 Pretes a expedier", sublabel: "Validees, pretes pour expedition", icon: <Ship className="h-5 w-5" />, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-300", rows: [], actionLabel: "Expedier" },
    };

    for (const row of rows) {
      const ls = row.logistics_status;
      const rem = row.amount_remaining ?? 0;

      if ((ls === "awaiting_weighing" && row.days_pending > 7) || ls === "rejected") {
        groups.urgent.rows.push(row);
      } else if (rem > 0 && ls !== "delivered" && ls !== "cancelled") {
        groups.payment.rows.push(row);
      } else if (ls === "awaiting_weighing") {
        groups.to_weigh.rows.push(row);
      } else if (row.order_type === "local" && (ls === "new" || ls === null)) {
        groups.to_confirm.rows.push(row);
      } else if (ls === "awaiting_client_validation") {
        groups.waiting_client.rows.push(row);
      } else if (ls === "validated" || ls === "ready_to_ship") {
        groups.ready_to_ship.rows.push(row);
      }
    }

    return Object.entries(groups).filter(([, v]) => v.rows.length > 0);
  }, [rows]);

  /* ── Vue TOUTES : recherche + filtres ── */
  const activeRows = useMemo(() => {
    let result = filteredRows;
    if (!showArchived) {
      result = result.filter(r =>
        r.logistics_status !== "delivered" && r.logistics_status !== "shipped"
      );
    }
    return result;
  }, [filteredRows, showArchived]);

  const searchedRows = useMemo(() => {
    if (!searchTerm.trim()) return activeRows;
    const q = searchTerm.toLowerCase().trim();
    return activeRows.filter(r =>
      (r.order_id ?? "").toLowerCase().includes(q) ||
      (r.customer_name ?? "").toLowerCase().includes(q) ||
      (r.customer_phone ?? "").toLowerCase().includes(q) ||
      (r.tracking_number ?? "").toLowerCase().includes(q)
    );
  }, [activeRows, searchTerm]);

  /* ── Vue CLIENTS : aggregation par client ── */
  const clientGroups = useMemo(() => {
    const map = new Map<string, {
      phone: string;
      name: string;
      orders: WorkflowRow[];
      totalBought: number;
      totalPaid: number;
      totalDebt: number;
      lastOrder: Date | null;
    }>();

    for (const row of rows) {
      const phone = row.customer_phone ?? "—";
      const existing = map.get(phone) ?? {
        phone, name: row.customer_name ?? "—",
        orders: [], totalBought: 0, totalPaid: 0, totalDebt: 0, lastOrder: null,
      };
      existing.orders.push(row);
      existing.totalBought += row.order_total ?? 0;
      existing.totalPaid += row.amount_paid ?? 0;
      existing.totalDebt += row.amount_remaining ?? 0;
      const rowDate = row.created_at ? new Date(row.created_at) : null;
      if (rowDate && (!existing.lastOrder || rowDate > existing.lastOrder)) {
        existing.lastOrder = rowDate;
      }
      map.set(phone, existing);
    }

    return Array.from(map.values())
      .filter(c => c.orders.length > 0)
      .sort((a, b) => b.totalDebt - a.totalDebt);
  }, [rows]);

  /* ── Chips filtres actifs ── */
  const activeFilterChips = useMemo(() => {
    const chips: { label: string; onRemove: () => void }[] = [];
    if (filters.search) chips.push({ label: `Recherche: "${filters.search}"`, onRemove: () => updateFilter("search", "") });
    filters.countries.forEach(c => chips.push({ label: `Pays: ${c}`, onRemove: () => toggleArrayValue("countries", c) }));
    filters.orderTypes.forEach(t => chips.push({ label: `Type: ${t}`, onRemove: () => toggleArrayValue("orderTypes", t) }));
    filters.logisticsStatuses.forEach(s => chips.push({ label: `Statut: ${s}`, onRemove: () => toggleArrayValue("logisticsStatuses", s) }));
    filters.paymentStatuses.forEach(s => {
      const labels: Record<string, string> = { paid: "Paye", partial: "Partiel", pending: "Non paye", cod: "A reception" };
      chips.push({ label: `Paiement: ${labels[s] ?? s}`, onRemove: () => toggleArrayValue("paymentStatuses", s) });
    });
    if (filters.hasDebt !== null) chips.push({ label: filters.hasDebt ? "Avec dette" : "Solde OK", onRemove: () => updateFilter("hasDebt", null) });
    return chips;
  }, [filters, updateFilter, toggleArrayValue]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const totalActionItems = actionGroups.reduce((s, [, g]) => s + g.rows.length, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" richColors />

      {/* ═══ EN-TETE COCKPIT ═══ */}
      <div className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-4 py-3">
          {/* Ligne 1 : Titre + filtres */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="bg-orange-500 text-white p-1.5 rounded-lg">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight">Centre de pilotage</h1>
                <p className="text-[11px] text-muted-foreground">
                  {kpi.totalOrders} commandes · {rows.filter(r => (r.amount_remaining ?? 0) > 0).length} avec dette · {fmtF(kpi.totalDebt)} total
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <WorkflowFilterPanel
                filters={filters} activeCount={activeCount} options={options}
                filteredCount={filteredRows.length} totalCount={rows.length}
                onUpdate={updateFilter} onToggleArray={toggleArrayValue} onReset={resetFilters}
              />
              <Button variant="outline" size="sm" onClick={() => setShowArchived(!showArchived)} className="h-9 text-xs">
                {showArchived ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                {showArchived ? "Masquer livrees" : "Voir livrees"}
              </Button>
            </div>
          </div>

          {/* Ligne 2 : KPI action-oriented */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
            <KpiActionCard icon={<ShieldAlert className="h-4 w-4" />} value={kpi.urgentCount} label="Urgences" color="text-red-600" bg="bg-red-50" ring="ring-red-200" onClick={() => setActiveView("actions")} />
            <KpiActionCard icon={<Receipt className="h-4 w-4" />} value={kpi.unpaidCount} label="Impayes" color="text-amber-600" bg="bg-amber-50" ring="ring-amber-200" onClick={() => setActiveView("actions")} />
            <KpiActionCard icon={<Scale className="h-4 w-4" />} value={kpi.toWeighCount} label="A peser" color="text-orange-600" bg="bg-orange-50" ring="ring-orange-200" onClick={() => setActiveView("actions")} />
            <KpiActionCard icon={<ClipboardCheck className="h-4 w-4" />} value={kpi.toConfirmCount} label="A confirmer" color="text-purple-600" bg="bg-purple-50" ring="ring-purple-200" onClick={() => setActiveView("actions")} />
            <KpiActionCard icon={<Clock className="h-4 w-4" />} value={kpi.waitingClientCount} label="Attente client" color="text-blue-600" bg="bg-blue-50" ring="ring-blue-200" onClick={() => setActiveView("actions")} />
            <KpiActionCard icon={<Ship className="h-4 w-4" />} value={kpi.readyToShipCount} label="Pretes" color="text-emerald-600" bg="bg-emerald-50" ring="ring-emerald-200" onClick={() => setActiveView("actions")} />
          </div>

          {/* Ligne 3 : Onglets */}
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as typeof activeView)}>
            <TabsList className="h-9 text-xs">
              <TabsTrigger value="actions" className="text-xs gap-1.5 px-3">
                <Zap className="h-3.5 w-3.5" />
                Actions
                {totalActionItems > 0 && (
                  <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[9px] ml-0.5">{totalActionItems}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs gap-1.5 px-3">
                <Package className="h-3.5 w-3.5" />
                Toutes les commandes
              </TabsTrigger>
              <TabsTrigger value="clients" className="text-xs gap-1.5 px-3">
                <Users className="h-3.5 w-3.5" />
                Clients
                {kpi.debtors > 0 && (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px] ml-0.5">{kpi.debtors}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 py-4">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Chargement des commandes...</div>
        ) : error ? (
          <div className="text-center py-12 text-red-600 text-sm">Erreur : {error instanceof Error ? error.message : "Inconnue"}</div>
        ) : (
          <>
            {/* ═══════════════════════════════════════════
                VUE 1 : ACTIONS (defaut)
                Ce qui necessite une action AUJOURD'HUI
                ═══════════════════════════════════════════ */}
            {activeView === "actions" && (
              <div className="space-y-3">
                {actionGroups.length === 0 ? (
                  <div className="text-center py-16">
                    <CheckCircle2 className="h-16 w-16 mx-auto text-emerald-400 mb-4" />
                    <p className="text-xl font-semibold text-emerald-700">Tout est a jour !</p>
                    <p className="text-sm text-muted-foreground mt-2">Aucune action requise pour le moment.</p>
                    <p className="text-xs text-muted-foreground mt-1">Profitez-en pour relancer les clients avec dette.</p>
                  </div>
                ) : (
                  actionGroups.map(([key, group]) => (
                    <div key={key} className={cn("rounded-xl border-2 overflow-hidden", group.border, group.bg)}>
                      <div className={cn("px-4 py-3 flex items-center justify-between", group.bg)}>
                        <div className="flex items-center gap-2.5">
                          <span className={group.color}>{group.icon}</span>
                          <div>
                            <span className={cn("font-bold text-sm", group.color)}>{group.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">{group.sublabel}</span>
                          </div>
                          <Badge variant="outline" className={cn("text-xs font-bold", group.bg, group.color, group.border)}>
                            {group.rows.length}
                          </Badge>
                        </div>
                        <span className={cn("text-xs font-semibold px-2 py-1 rounded-full", group.bg, group.color)}>
                          {group.actionLabel}
                        </span>
                      </div>
                      <div className="bg-white">
                        <WorkflowTable rows={group.rows} onViewDetail={setSelectedRow} rowIndexMap={rowIndexMap} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════
                VUE 2 : TOUTES LES COMMANDES
                Liste complete avec recherche + filtres
                ═══════════════════════════════════════════ */}
            {activeView === "all" && (
              <div className="space-y-3">
                {/* Barre de recherche */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher reference, client, telephone, tracking..."
                      className="pl-9 h-9 text-sm"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {/* Chips filtres actifs */}
                {activeFilterChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {activeFilterChips.map((chip, i) => (
                      <Badge key={i} variant="secondary" className="text-[11px] gap-1 pl-2 pr-1 py-0.5 cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors" onClick={chip.onRemove}>
                        {chip.label} <X className="h-3 w-3" />
                      </Badge>
                    ))}
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={resetFilters}>
                      Tout effacer
                    </Button>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  {searchedRows.length} commande{searchedRows.length > 1 ? "s" : ""}
                  {activeCount > 0 && ` (filtrees sur ${rows.length})`}
                </p>

                <div className="rounded-xl border bg-white overflow-hidden">
                  <WorkflowTable rows={searchedRows} onViewDetail={setSelectedRow} rowIndexMap={rowIndexMap} />
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════
                VUE 3 : CLIENTS
                Compte client global avec dettes
                ═══════════════════════════════════════════ */}
            {activeView === "clients" && (
              <div className="space-y-3">
                {clientGroups.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Aucun client</div>
                ) : (
                  clientGroups.map((client) => (
                    <div
                      key={client.phone}
                      className={cn(
                        "rounded-xl border bg-white p-4 hover:shadow-md transition-shadow",
                        client.totalDebt > 0 ? "border-l-4 border-l-red-400" : "border-l-4 border-l-emerald-400"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">{client.name}</span>
                          </div>
                          {client.phone !== "—" && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {client.phone}
                            </div>
                          )}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{client.orders.length} commande{client.orders.length > 1 ? "s" : ""}</span>
                            {client.lastOrder && (
                              <span>Derniere: {client.lastOrder.toLocaleDateString("fr-FR")}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <div className="text-lg font-bold">{fmtF(client.totalBought)}</div>
                          <div className="text-xs text-emerald-600">Paye: {fmtF(client.totalPaid)}</div>
                          {client.totalDebt > 0 ? (
                            <div className="text-sm font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                              Dette: {fmtF(client.totalDebt)}
                            </div>
                          ) : (
                            <div className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded inline-block">
                              Solde OK
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Liste des commandes du client */}
                      <div className="mt-3 pt-3 border-t space-y-1.5">
                        {client.orders
                          .sort((a, b) => {
                            const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
                            const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
                            return bDate - aDate;
                          })
                          .map((order) => (
                            <button
                              key={order.order_id}
                              className="w-full flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 text-left transition-colors"
                              onClick={() => setSelectedRow(order)}
                            >
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-mono text-muted-foreground">
                                  #{String(rowIndexMap.get(order.order_id) ?? 0).padStart(3, "0")}
                                </span>
                                <Badge variant="outline" className="text-[9px] h-4 px-1">
                                  {order.order_type === "local" ? "LOCAL" : "IMPORT"}
                                </Badge>
                                <span>{fmtF(order.order_total ?? 0)}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                {(order.amount_remaining ?? 0) > 0 ? (
                                  <span className="text-red-600 font-medium">
                                    Reste: {fmtF(order.amount_remaining ?? 0)}
                                  </span>
                                ) : (
                                  <span className="text-emerald-600">Paye</span>
                                )}
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      <WorkflowDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
  );
}

/* ── KPI Action Card : cliquable ── */
function KpiActionCard({ icon, value, label, color, bg, ring, onClick }: {
  icon: React.ReactNode; value: number; label: string; color: string; bg: string; ring: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg border p-2 text-left transition-all hover:shadow-sm",
        bg, value > 0 && `ring-1 ${ring}`, value === 0 && "opacity-60"
      )}
    >
      <span className={color}>{icon}</span>
      <div>
        <div className={cn("text-lg font-bold leading-tight", color)}>{value}</div>
        <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
      </div>
    </button>
  );
}

function fmtF(n: number): string {
  if (!n || n === 0) return "0 FCFA";
  return n.toLocaleString("fr-FR") + " FCFA";
}
