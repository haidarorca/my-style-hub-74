// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   DASHBOARD — Centre de pilotage Kawzone
   
   Les dialogs (annulation, fermeture securisee) sont rendus
   en DEHORS du Sheet pour eviter les conflits de z-index.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo, useCallback } from "react";
import { Search, ClipboardList, Home, Package, Archive, ChevronRight, Eye, AlertTriangle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRealOrders } from "@/cockpit/hooks/useRealOrders";
import { useAuth } from "@/hooks/use-auth";
import { KpiCards } from "@/cockpit/components/KpiCards";
import { OrderCard } from "@/cockpit/components/OrderCard";
import { OrderDrawer } from "@/cockpit/components/OrderDrawer";
import { mapStatus, groupByAction, calculateKpi, fmtF, checkCanCancel, REFUND_LABELS } from "@/cockpit/lib/workflow";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

export default function CockpitDashboard() {
  const { profile } = useAuth();
  const adminName = profile?.full_name ?? profile?.email ?? "Admin";

  const {
    orders, searchTerm, setSearchTerm, isLoading,
    addPayment, editPayment, deletePayment, updateStatus, getPayments, getAudit, getTotalPaid,
  } = useRealOrders();

  const [selectedOrder, setSelectedOrder] = useState<LogisticsOrderRow | null>(null);
  const [activeTab, setActiveTab] = useState("actions");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Dialogs
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  // Annulation
  const [cancelReason, setCancelReason] = useState("");
  const [cancelRefundType, setCancelRefundType] = useState("no_refund");

  // KPI
  const totalPaidByOrder = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders) { map[o.order_id ?? ""] = getTotalPaid(o.order_id ?? ""); }
    return map;
  }, [orders, getTotalPaid]);

  const kpi = useMemo(() => calculateKpi({ orders, totalPaidByOrder }), [orders, totalPaidByOrder]);
  const actionGroups = useMemo(() => groupByAction(orders), [orders]);

  const selectedIndex = useMemo(() => {
    if (!selectedOrder) return 0;
    return orders.findIndex(o => o.order_id === selectedOrder.order_id);
  }, [selectedOrder, orders]);

  const selectedPayments = selectedOrder ? getPayments(selectedOrder.order_id ?? "") : [];
  const selectedAudit = selectedOrder ? getAudit(selectedOrder.order_id ?? "") : [];
  const selectedTotalPaid = selectedOrder ? (totalPaidByOrder[selectedOrder.order_id ?? ""] ?? 0) : 0;
  const cancelCheck = selectedOrder ? checkCanCancel(selectedOrder, selectedTotalPaid) : null;

  const displayOrders = useMemo(() => {
    let filtered = orders;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      filtered = orders.filter(o => (o.order_id ?? "").toLowerCase().includes(q) || (o.customer_name ?? "").toLowerCase().includes(q) || (o.customer_phone ?? "").toLowerCase().includes(q));
    }
    switch (activeTab) {
      case "local": return filtered.filter(o => !o.shipping_service_id && o.order_type !== "import");
      case "import": return filtered.filter(o => o.shipping_service_id || o.order_type === "import");
      case "archive": return filtered.filter(o => o.logistics_status === "delivered" || o.logistics_status === "cancelled");
      default: return filtered.filter(o => { const s = mapStatus(o); return s !== "delivered" && s !== "cancelled"; });
    }
  }, [orders, searchTerm, activeTab]);

  const handlePayment = (orderId: string, amount: number, method: string, reference: string, _adminName: string) => {
    addPayment(orderId, amount, method, reference, _adminName || adminName);
  };

  const handleWeight = (orderId: string, freight: number) => {
    console.log("Weight:", { orderId, freight });
  };

  const handleStatus = (orderId: string, status: string, _adminName: string) => {
    updateStatus(orderId, status, _adminName || adminName);
  };

  // Annulation
  const openCancelDialog = useCallback(() => setShowCancelDialog(true), []);

  const doCancel = useCallback(() => {
    if (!selectedOrder || !cancelReason.trim()) return;
    updateStatus(selectedOrder.order_id ?? "", "cancelled", adminName);
    setShowCancelDialog(false);
    setCancelReason("");
    setCancelRefundType("no_refund");
  }, [selectedOrder, cancelReason, adminName, updateStatus]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen text-gray-500">Chargement des commandes...</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-sm font-bold">Kawzone Cockpit</h1>
          <span className="text-[10px] text-gray-500">{orders.length} commandes chargees</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
          <Input placeholder="Rechercher (nom, telephone, ID)..." className="pl-8 h-9 text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {/* KPI */}
      {activeTab === "actions" && (
        <div className="px-4 pt-2 pb-1">
          <KpiCards newCount={kpi.newCount} pendingPayment={kpi.pendingPayment} toWeigh={kpi.toWeigh} ready={kpi.ready} shipped={kpi.shipped} totalDebt={kpi.totalDebt} />
        </div>
      )}

      {/* Compteur */}
      <div className="px-4 py-1 text-[10px] text-gray-400">
        <span>{displayOrders.length} commandes{displayOrders.length === 1 ? "" : "s"}{activeTab === "actions" ? " necessitent une action" : ""}</span>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto pb-16">
        {activeTab === "actions" ? (
          <div className="p-3 space-y-3">
            {actionGroups.new.length > 0 && <ActionGroup title="A confirmer" count={actionGroups.new.length} color="border-l-purple-500 bg-purple-50" orders={actionGroups.new} onSelect={setSelectedOrder} expanded={expandedGroup === "new"} onToggle={() => setExpandedGroup(expandedGroup === "new" ? null : "new")} totalPaidByOrder={totalPaidByOrder} />}
            {actionGroups.payment_pending.length > 0 && <ActionGroup title="Paiement en attente" count={actionGroups.payment_pending.length} color="border-l-amber-500 bg-amber-50" orders={actionGroups.payment_pending} onSelect={setSelectedOrder} expanded={expandedGroup === "payment_pending"} onToggle={() => setExpandedGroup(expandedGroup === "payment_pending" ? null : "payment_pending")} totalPaidByOrder={totalPaidByOrder} />}
            {actionGroups.to_weigh.length > 0 && <ActionGroup title="A peser" count={actionGroups.to_weigh.length} color="border-l-orange-500 bg-orange-50" orders={actionGroups.to_weigh} onSelect={setSelectedOrder} expanded={expandedGroup === "to_weigh"} onToggle={() => setExpandedGroup(expandedGroup === "to_weigh" ? null : "to_weigh")} totalPaidByOrder={totalPaidByOrder} />}
            {actionGroups.ready.length > 0 && <ActionGroup title="Pret a expedier" count={actionGroups.ready.length} color="border-l-emerald-500 bg-emerald-50" orders={actionGroups.ready} onSelect={setSelectedOrder} expanded={expandedGroup === "ready"} onToggle={() => setExpandedGroup(expandedGroup === "ready" ? null : "ready")} totalPaidByOrder={totalPaidByOrder} />}
            {actionGroups.shipped.length > 0 && <ActionGroup title="En livraison" count={actionGroups.shipped.length} color="border-l-indigo-500 bg-indigo-50" orders={actionGroups.shipped} onSelect={setSelectedOrder} expanded={expandedGroup === "shipped"} onToggle={() => setExpandedGroup(expandedGroup === "shipped" ? null : "shipped")} totalPaidByOrder={totalPaidByOrder} />}
            {Object.values(actionGroups).every(g => g.length === 0) && (
              <div className="text-center py-12 text-gray-500"><ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-300" /><p className="font-medium">Tout est a jour !</p><p className="text-sm">Aucune action requise.</p></div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {displayOrders.length === 0 ? <div className="text-center py-12 text-gray-500">Aucune commande</div> : displayOrders.map((order, i) => <OrderCard key={order.order_id} order={order} index={i} onClick={() => setSelectedOrder(order)} totalPaid={totalPaidByOrder[order.order_id ?? ""]} />)}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-50">
        <div className="flex justify-around items-center h-14">
          {[{ key: "actions", label: "Actions", icon: ClipboardList }, { key: "local", label: "Local", icon: Home }, { key: "import", label: "Import", icon: Package }, { key: "archive", label: "Archive", icon: Archive }].map(tab => (
            <button key={tab.key} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${activeTab === tab.key ? "text-orange-600" : "text-gray-500"}`} onClick={() => { setActiveTab(tab.key); setExpandedGroup(null); }}>
              <tab.icon className="h-5 w-5" /><span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Drawer */}
      {selectedOrder && (
        <OrderDrawer
          order={selectedOrder}
          orderIndex={selectedIndex}
          payments={selectedPayments}
          audit={selectedAudit}
          onClose={() => setSelectedOrder(null)}
          onPayment={handlePayment}
          onEditPayment={editPayment}
          onDeletePayment={deletePayment}
          onWeightRecorded={handleWeight}
          onStatusChange={handleStatus}
          onRequestCancel={openCancelDialog}
        />
      )}

      {/* ════════════════════════════════════════════
          DIALOG ANNULATION — EN DEHORS du Sheet
          ════════════════════════════════════════════ */}
      {showCancelDialog && selectedOrder && cancelCheck && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ isolation: "isolate" }}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCancelDialog(false)} />
          {/* Content */}
          <div className="relative bg-white rounded-xl shadow-2xl mx-4 w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
              <h3 className="text-lg font-bold">Annuler {getOrderNumber(selectedOrder.order_id ?? "")}</h3>
              <button onClick={() => setShowCancelDialog(false)} className="ml-auto p-1 rounded-full hover:bg-gray-100">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 pb-5 space-y-3">
              {!cancelCheck.canCancel ? (
                <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700">{cancelCheck.reason}</div>
              ) : (
                <>
                  {cancelCheck.warnings.length > 0 && cancelCheck.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded p-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{w}
                    </div>
                  ))}

                  {cancelCheck.paidAmount > 0 && (
                    <div className="text-sm"><span className="text-gray-500">Montant paye : </span><span className="font-bold">{fmtF(cancelCheck.paidAmount)}</span></div>
                  )}

                  {/* Raison */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Raison de l annulation *</label>
                    <Input
                      placeholder="Ex: Client a annule, produit indisponible..."
                      value={cancelReason}
                      onChange={e => setCancelReason(e.target.value)}
                      className="h-10 text-sm"
                      autoFocus
                    />
                  </div>

                  {/* Type de remboursement */}
                  {cancelCheck.refundOptions.length > 0 && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Type de remboursement</label>
                      <div className="grid grid-cols-2 gap-2">
                        {cancelCheck.refundOptions.map(opt => (
                          <button
                            key={opt}
                            onClick={() => setCancelRefundType(opt)}
                            className={`text-xs py-2 px-2 rounded-lg border text-center transition-colors ${cancelRefundType === opt ? "bg-orange-100 border-orange-300 text-orange-800 font-semibold" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"}`}
                          >
                            {REFUND_LABELS[opt]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 bg-gray-50 border-t flex gap-3">
              <Button variant="outline" className="flex-1 h-11 text-sm" onClick={() => setShowCancelDialog(false)}>Retour</Button>
              {cancelCheck.canCancel && (
                <Button variant="destructive" className="flex-1 h-11 text-sm" disabled={!cancelReason.trim()} onClick={doCancel}>
                  Confirmer l annulation
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   ActionGroup
   ════════════════════════════════════════════ */

const PAGE_SIZE = 10;

function ActionGroup({ title, count, color, orders, onSelect, expanded, onToggle, totalPaidByOrder }: {
  title: string; count: number; color: string;
  orders: LogisticsOrderRow[]; onSelect: (o: LogisticsOrderRow) => void;
  expanded: boolean; onToggle: () => void;
  totalPaidByOrder: Record<string, number>;
}) {
  const displayedCount = expanded ? orders.length : Math.min(PAGE_SIZE, orders.length);
  const hasMore = orders.length > PAGE_SIZE;

  return (
    <div className={`rounded-lg border border-l-4 ${color} overflow-hidden`}>
      <div className={`px-3 py-2 flex items-center justify-between ${color}`}>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{title}</span>
          <span className="text-xs bg-white rounded-full px-2 py-0.5 font-bold">{count}</span>
        </div>
        {hasMore && (
          <button onClick={onToggle} className="text-xs flex items-center gap-1 text-gray-600 hover:text-gray-900 bg-white/60 px-2 py-1 rounded-full transition-colors">
            {expanded ? <>Moins <ChevronRight className="h-3 w-3 rotate-90" /></> : <><Eye className="h-3 w-3" /> Voir tout</>}
          </button>
        )}
      </div>
      <div className="bg-white divide-y divide-gray-100">
        {orders.slice(0, displayedCount).map((order, i) => (
          <OrderCard key={order.order_id} order={order} index={i} onClick={() => onSelect(order)} totalPaid={totalPaidByOrder[order.order_id ?? ""]} />
        ))}
      </div>
      {hasMore && !expanded && <div className="px-4 py-2 text-center bg-gray-50 border-t text-xs text-gray-500">Affichage : {displayedCount} / {orders.length} commandes</div>}
      {expanded && hasMore && <div className="px-4 py-2 text-center bg-gray-50 border-t"><Button variant="ghost" size="sm" className="text-xs h-7" onClick={onToggle}>Afficher moins</Button></div>}
    </div>
  );
}
