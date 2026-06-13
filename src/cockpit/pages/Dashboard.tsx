// ═══════════════════════════════════════════════════════════════
// DASHBOARD — Centre de pilotage complet Kawzone
// KPI cliquables + Archive pro + Filtres + Dialogs externes
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from "react";
import { Search, ClipboardList, Home, Package, Archive, ChevronRight, Eye, X, RotateCcw, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRealOrders } from "@/cockpit/hooks/useRealOrders";
import { useAuth } from "@/hooks/use-auth";
import { KpiCards } from "@/cockpit/components/KpiCards";
import { OrderCard } from "@/cockpit/components/OrderCard";
import { OrderDrawer } from "@/cockpit/components/OrderDrawer";
import { CancelDialog } from "@/cockpit/components/CancelDialog";
import { CloseConfirmDialog } from "@/cockpit/components/CloseConfirmDialog";
import { fmtF, isImport, statusToKpiFilter } from "@/cockpit/lib/workflow";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { KpiFilter, ArchiveFilter } from "@/cockpit/types";

export default function CockpitDashboard() {
  const { profile } = useAuth();
  const adminName = profile?.full_name ?? profile?.email ?? "Admin";
  const { orders, isLoading, searchTerm, setSearchTerm, getPayments, getTotalPaid, getAudit, addPayment, editPayment, deletePayment, getWeighings, addWeighing, updateStatus, cancelOrder, getCancellation, cancellations } = useRealOrders();

  const [selectedOrder, setSelectedOrder] = useState<LogisticsOrderRow | null>(null);
  const [activeTab, setActiveTab] = useState<"actions" | "local" | "import" | "archive">("actions");
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("all");

  // Dialogs
  const [showCancel, setShowCancel] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const selectedIndex = useMemo(() => selectedOrder ? orders.findIndex(o => o.order_id === selectedOrder.order_id) : 0, [selectedOrder, orders]);
  const selPayments = selectedOrder ? getPayments(selectedOrder.order_id ?? "") : [];
  const selAudit = selectedOrder ? getAudit(selectedOrder.order_id ?? "") : [];
  const selWeighings = selectedOrder ? getWeighings(selectedOrder.order_id ?? "") : [];
  const selTotalPaid = selectedOrder ? getTotalPaid(selectedOrder.order_id ?? "") : 0;

  // KPI data
  const totalPaidMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) m[o.order_id ?? ""] = getTotalPaid(o.order_id ?? "");
    return m;
  }, [orders, getTotalPaid]);

  const kpi = useMemo(() => {
    const s = { new: 0, payment_pending: 0, to_weigh: 0, ready: 0, shipped: 0 };
    let debt = 0;
    for (const o of orders) {
      const st = o.logistics_status ?? "new";
      if (st === "delivered" || st === "cancelled") continue;
      const f = statusToKpiFilter(st);
      if (f && f !== "debt") s[f as keyof typeof s] = (s[f as keyof typeof s] ?? 0) + 1;
      const gt = (o.order_total ?? 0) + (o.total_shipping_fees ?? 0);
      const paid = totalPaidMap[o.order_id ?? ""] ?? 0;
      if (gt - paid > 0) debt += gt - paid;
    }
    return { ...s, debt };
  }, [orders, totalPaidMap]);

  // Filtered orders
  const displayOrders = useMemo(() => {
    let list = orders;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = orders.filter(o => (o.order_id ?? "").toLowerCase().includes(q) || (o.customer_name ?? "").toLowerCase().includes(q) || (o.customer_phone ?? "").toLowerCase().includes(q) || getOrderNumber(o.order_id ?? "").toLowerCase().includes(q));
    }
    switch (activeTab) {
      case "local": return list.filter(o => !isImport(o));
      case "import": return list.filter(o => isImport(o));
      case "archive": return list.filter(o => o.logistics_status === "delivered" || o.logistics_status === "cancelled");
      default: {
        // Actions tab with KPI filter
        let filtered = list.filter(o => o.logistics_status !== "delivered" && o.logistics_status !== "cancelled");
        if (kpiFilter) {
          if (kpiFilter === "debt") {
            filtered = filtered.filter(o => {
              const gt = (o.order_total ?? 0) + (o.total_shipping_fees ?? 0);
              return gt - (totalPaidMap[o.order_id ?? ""] ?? 0) > 0;
            });
          } else {
            filtered = filtered.filter(o => statusToKpiFilter(o.logistics_status ?? "") === kpiFilter);
          }
        }
        return filtered;
      }
    }
  }, [orders, searchTerm, activeTab, kpiFilter, totalPaidMap]);

  // Groups for Actions tab
  const groups = useMemo(() => {
    if (activeTab !== "actions" || kpiFilter) return null;
    const g: Record<string, LogisticsOrderRow[]> = { new: [], payment_pending: [], to_weigh: [], ready: [], shipped: [] };
    for (const o of displayOrders) {
      const f = statusToKpiFilter(o.logistics_status ?? "new");
      if (f && f !== "debt") (g[f] ?? g.ready).push(o);
    }
    return g;
  }, [displayOrders, activeTab, kpiFilter]);

  // Handlers
  const handlePayment = (orderId: string, amount: number, method: string, reference: string, _admin: string) => { addPayment(orderId, amount, method, reference, _admin || adminName); };
  const handleStatus = (orderId: string, status: string, _admin: string) => { updateStatus(orderId, status, _admin || adminName); };
  const handleWeigh = (record: Parameters<typeof addWeighing>[0]) => { addWeighing(record); setHasChanges(false); };

  const openCancel = useCallback(() => { setHasChanges(false); setShowCancel(true); }, []);
  const doCancel = useCallback((reason: string, refundType: string) => {
    if (!selectedOrder) return;
    cancelOrder(selectedOrder.order_id ?? "", reason, refundType as any, adminName);
    setShowCancel(false);
    setSelectedOrder(null);
  }, [selectedOrder, cancelOrder, adminName]);

  const handleCloseDrawer = useCallback(() => {
    if (hasChanges) { setShowCloseConfirm(true); } else { setSelectedOrder(null); }
  }, [hasChanges]);
  const confirmClose = useCallback(() => { setShowCloseConfirm(false); setHasChanges(false); setSelectedOrder(null); }, []);

  if (isLoading) return <div className="flex items-center justify-center h-screen text-gray-500">Chargement des commandes...</div>;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-sm font-bold">Kawzone Cockpit</h1>
          <span className="text-[10px] text-gray-500">{orders.length} commandes</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
          <Input placeholder="Rechercher (nom, téléphone, KZ-xxx)..." className="pl-8 h-9 text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {/* KPI (Actions tab only) */}
      {activeTab === "actions" && (
        <div className="px-4 pt-2 pb-1">
          <KpiCards {...kpi} activeFilter={kpiFilter} onFilter={setKpiFilter} />
          {kpiFilter && (
            <button onClick={() => setKpiFilter(null)} className="mt-1 text-[10px] text-orange-600 flex items-center gap-1">
              <X className="h-3 w-3" />Effacer le filtre
            </button>
          )}
        </div>
      )}

      {/* Archive filters */}
      {activeTab === "archive" && (
        <div className="px-4 pt-2 pb-1 flex gap-2 flex-wrap">
          {(["all", "delivered", "cancelled"] as ArchiveFilter[]).map(f => (
            <button key={f} onClick={() => setArchiveFilter(f)} className={`text-[10px] px-3 py-1.5 rounded-full border transition-colors ${archiveFilter === f ? "bg-orange-100 border-orange-300 text-orange-800 font-semibold" : "bg-white border-gray-200 text-gray-600"}`}>
              {f === "all" ? "Toutes" : f === "delivered" ? "Livrées" : "Annulées"}
            </button>
          ))}
        </div>
      )}

      {/* Counter */}
      <div className="px-4 py-1 text-[10px] text-gray-400">
        <span>{displayOrders.length} commande{displayOrders.length > 1 ? "s" : ""}{kpiFilter ? " (filtré)" : activeTab === "actions" ? " nécessitent une action" : ""}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-16">
        {activeTab === "actions" ? (
          // Actions tab — groupes ou filtre KPI
          kpiFilter ? (
            // Mode filtre KPI actif : afficher UN SEUL groupe avec les commandes filtrées
            <div className="p-3">
              {displayOrders.length > 0 ? (
                <ActionGroup
                  title={KPI_FILTER_TITLES[kpiFilter] ?? kpiFilter}
                  count={displayOrders.length}
                  color={KPI_FILTER_COLORS[kpiFilter] ?? "border-l-gray-500 bg-gray-50"}
                  orders={displayOrders}
                  onSelect={setSelectedOrder}
                  totalPaidMap={totalPaidMap}
                  expanded={true}
                  onToggle={() => {}}
                />
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">Aucune commande dans {KPI_FILTER_TITLES[kpiFilter] ?? kpiFilter}</p>
                  <button onClick={() => setKpiFilter(null)} className="mt-2 text-xs text-orange-600">Effacer le filtre</button>
                </div>
              )}
            </div>
          ) : groups ? (
            // Mode sans filtre : tous les groupes
            <div className="p-3 space-y-3">
              {Object.entries(groups).map(([key, grp]) => grp.length > 0 ? (
                <ActionGroup key={key} title={GROUP_TITLES[key]} count={grp.length} color={GROUP_COLORS[key]} orders={grp} onSelect={setSelectedOrder} totalPaidMap={totalPaidMap} expanded={expandedGroup === key} onToggle={() => setExpandedGroup(expandedGroup === key ? null : key)} />
              ) : null)}
              {Object.values(groups).every(g => g.length === 0) && <div className="text-center py-12 text-gray-500"><ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-300" /><p className="font-medium">Tout est à jour !</p></div>}
            </div>
          ) : null
        ) : activeTab === "archive" ? (
          <ArchiveList orders={displayOrders} archiveFilter={archiveFilter} totalPaidMap={totalPaidMap} onSelect={setSelectedOrder} cancellations={cancellations} />
        ) : (
          <div className="divide-y divide-gray-100">
            {displayOrders.length === 0 ? <div className="text-center py-12 text-gray-500">Aucune commande</div> : displayOrders.map((o, i) => <OrderCard key={o.order_id} order={o} index={i} onClick={() => setSelectedOrder(o)} totalPaid={totalPaidMap[o.order_id ?? ""]} />)}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-50">
        <div className="flex justify-around items-center h-14">
          {[{ k: "actions" as const, l: "Actions", i: ClipboardList }, { k: "local" as const, l: "Local", i: Home }, { k: "import" as const, l: "Import", i: Package }, { k: "archive" as const, l: "Archive", i: Archive }].map(t => (
            <button key={t.k} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${activeTab === t.k ? "text-orange-600" : "text-gray-500"}`} onClick={() => { setActiveTab(t.k); setKpiFilter(null); setExpandedGroup(null); }}>
              <t.i className="h-5 w-5" /><span className="text-[10px] font-medium">{t.l}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Drawer */}
      {selectedOrder && (
        <OrderDrawer order={selectedOrder} orderIndex={selectedIndex} payments={selPayments} audit={selAudit} weighings={selWeighings}
          onClose={handleCloseDrawer} onPayment={handlePayment} onEditPayment={editPayment} onDeletePayment={deletePayment}
          onWeigh={handleWeigh} onStatusChange={handleStatus} onRequestCancel={openCancel} onFormInteraction={() => setHasChanges(true)} />
      )}

      {/* Cancel Dialog */}
      {selectedOrder && <CancelDialog open={showCancel} onClose={() => setShowCancel(false)} onConfirm={doCancel} paidAmount={selTotalPaid} status={selectedOrder.logistics_status ?? "new"} kzNumber={getOrderNumber(selectedOrder.order_id ?? "")} />}

      {/* Close Confirm Dialog */}
      <CloseConfirmDialog open={showCloseConfirm} onStay={() => setShowCloseConfirm(false)} onLeave={confirmClose} />
    </div>
  );
}

// ════════════════════════════════════════════
// Action Group
// ════════════════════════════════════════════

const PAGE_SIZE = 10;
const GROUP_TITLES: Record<string, string> = { new: "À confirmer", payment_pending: "Paiement en attente", to_weigh: "À peser", ready: "Prêt à expédier", shipped: "En livraison" };
const GROUP_COLORS: Record<string, string> = { new: "border-l-purple-500 bg-purple-50", payment_pending: "border-l-amber-500 bg-amber-50", to_weigh: "border-l-orange-500 bg-orange-50", ready: "border-l-emerald-500 bg-emerald-50", shipped: "border-l-indigo-500 bg-indigo-50" };
const KPI_FILTER_TITLES: Record<string, string> = { new: "À confirmer", payment_pending: "Paiements en attente", to_weigh: "À peser", ready: "Prêt à expédier", shipped: "Expédiées", debt: "Dettes clients" };
const KPI_FILTER_COLORS: Record<string, string> = { new: "border-l-purple-500 bg-purple-50", payment_pending: "border-l-amber-500 bg-amber-50", to_weigh: "border-l-orange-500 bg-orange-50", ready: "border-l-emerald-500 bg-emerald-50", shipped: "border-l-indigo-500 bg-indigo-50", debt: "border-l-red-500 bg-red-50" };

function ActionGroup({ title, count, color, orders, onSelect, totalPaidMap, expanded, onToggle }: {
  title: string; count: number; color: string; orders: LogisticsOrderRow[]; onSelect: (o: LogisticsOrderRow) => void;
  totalPaidMap: Record<string, number>; expanded: boolean; onToggle: () => void;
}) {
  const shown = expanded ? orders.length : Math.min(PAGE_SIZE, orders.length);
  const more = orders.length > PAGE_SIZE;
  return (
    <div className={`rounded-lg border border-l-4 ${color} overflow-hidden`}>
      <div className={`px-3 py-2 flex items-center justify-between ${color}`}>
        <div className="flex items-center gap-2"><span className="font-semibold text-sm">{title}</span><span className="text-xs bg-white rounded-full px-2 py-0.5 font-bold">{count}</span></div>
        {more && <button onClick={onToggle} className="text-xs flex items-center gap-1 text-gray-600 hover:text-gray-900 bg-white/60 px-2 py-1 rounded-full">{expanded ? <>Moins</> : <><Eye className="h-3 w-3" />Voir tout</>}</button>}
      </div>
      <div className="bg-white divide-y divide-gray-100">
        {orders.slice(0, shown).map((o, i) => <OrderCard key={o.order_id} order={o} index={i} onClick={() => onSelect(o)} totalPaid={totalPaidMap[o.order_id ?? ""]} />)}
      </div>
      {more && !expanded && <div className="px-4 py-2 text-center bg-gray-50 border-t text-xs text-gray-500">Affichage : {shown} / {orders.length}</div>}
    </div>
  );
}

// ════════════════════════════════════════════
// Archive List
// ════════════════════════════════════════════

function ArchiveList({ orders, archiveFilter, totalPaidMap, onSelect, cancellations }: {
  orders: LogisticsOrderRow[]; archiveFilter: ArchiveFilter; totalPaidMap: Record<string, number>;
  onSelect: (o: LogisticsOrderRow) => void; cancellations: any[];
}) {
  const filtered = orders.filter(o => archiveFilter === "all" || o.logistics_status === archiveFilter);
  return (
    <div className="divide-y divide-gray-100">
      {filtered.length === 0 ? <div className="text-center py-12 text-gray-500">Archive vide</div> : filtered.map(o => {
        const cancel = cancellations.find((c: any) => c.orderId === o.order_id);
        return (
          <button key={o.order_id} onClick={() => onSelect(o)} className="w-full flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 text-left">
            <div className="shrink-0 w-16">
              <div className="font-mono text-[11px] font-bold text-gray-800">{getOrderNumber(o.order_id ?? "")}</div>
              <div className="text-[9px] text-gray-400">{o.order_id?.slice(-4)}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{o.customer_name ?? "—"}</div>
              {cancel && <div className="text-[10px] text-red-500 mt-0.5">Annulée: {cancel.reason}</div>}
              {cancel && <div className="text-[10px] text-gray-400">Remb: {cancel.refundType} — {new Date(cancel.cancelledAt).toLocaleDateString("fr-FR")}</div>}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold">{fmtF(o.order_total ?? 0)}</div>
              <div className={`text-[10px] ${o.logistics_status === "delivered" ? "text-emerald-500" : "text-red-500"}`}>{o.logistics_status === "delivered" ? "Livrée" : "Annulée"}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
