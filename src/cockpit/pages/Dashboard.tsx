// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   DASHBOARD — Centre de pilotage Kawzone
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Search, ClipboardList, Home, Package, Archive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRealOrders } from "@/cockpit/hooks/useRealOrders";
import { KpiCards } from "@/cockpit/components/KpiCards";
import { OrderCard } from "@/cockpit/components/OrderCard";
import { OrderDrawer } from "@/cockpit/components/OrderDrawer";
import { mapStatus, groupByAction, calculateKpi, fmtF } from "@/cockpit/lib/workflow";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

export default function CockpitDashboard() {
  const {
    orders, localOrders, importOrders, searchTerm, setSearchTerm, isLoading,
    addPayment, updateStatus, getPayments, getAudit,
  } = useRealOrders();
  const [selectedOrder, setSelectedOrder] = useState<LogisticsOrderRow | null>(null);
  const [activeTab, setActiveTab] = useState("actions");

  // KPI
  const kpi = useMemo(() => calculateKpi(orders), [orders]);

  // Groupes d'actions
  const actionGroups = useMemo(() => groupByAction(orders), [orders]);

  // Index de la commande selectionnee
  const selectedIndex = useMemo(() => {
    if (!selectedOrder) return 0;
    return orders.findIndex(o => o.order_id === selectedOrder.order_id);
  }, [selectedOrder, orders]);

  // Commandes a afficher
  const displayOrders = useMemo(() => {
    let filtered = orders;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      filtered = orders.filter(o =>
        (o.order_id ?? "").toLowerCase().includes(q) ||
        (o.customer_name ?? "").toLowerCase().includes(q) ||
        (o.customer_phone ?? "").toLowerCase().includes(q)
      );
    }

    switch (activeTab) {
      case "local": return filtered.filter(o => !o.shipping_service_id && o.order_type !== "import");
      case "import": return filtered.filter(o => o.shipping_service_id || o.order_type === "import");
      case "archive": return filtered.filter(o => o.logistics_status === "delivered" || o.logistics_status === "cancelled");
      case "actions":
      default:
        return filtered.filter(o => {
          const s = mapStatus(o);
          return s !== "delivered" && s !== "cancelled";
        });
    }
  }, [orders, searchTerm, activeTab]);

  // Handlers
  const handlePayment = (orderId: string, amount: number, method: string, reference?: string) => {
    addPayment(orderId, amount, method, reference || "", "Admin");
    alert(`Paiement de ${fmtF(amount)} enregistre (${method})`);
  };

  const handleWeight = (orderId: string, freight: number) => {
    console.log("Weight:", { orderId, freight });
    alert(`Fret de ${fmtF(freight)} enregistre`);
  };

  const handleStatus = (orderId: string, status: string) => {
    updateStatus(orderId, status, "Admin");
    alert(`Statut change en: ${status}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Chargement des commandes...
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header compact */}
      <div className="bg-white border-b px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-sm font-bold">Kawzone Cockpit</h1>
          <span className="text-[10px] text-gray-500">{orders.length} commandes</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher..."
            className="pl-8 h-9 text-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* KPI — seulement sur l'onglet Actions */}
      {activeTab === "actions" && (
        <div className="px-4 pt-2 pb-1">
          <KpiCards
            newCount={kpi.newCount}
            pendingPayment={kpi.pendingPayment}
            toWeigh={kpi.toWeigh}
            ready={kpi.ready}
            totalDebt={kpi.totalDebt}
          />
        </div>
      )}

      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto pb-16">
        {activeTab === "actions" ? (
          /* Vue Actions avec groupes */
          <div className="p-3 space-y-3">
            {actionGroups.new.length > 0 && (
              <ActionGroup title="A confirmer" count={actionGroups.new.length} color="border-l-purple-500 bg-purple-50" orders={actionGroups.new} onSelect={setSelectedOrder} />
            )}
            {actionGroups.payment_pending.length > 0 && (
              <ActionGroup title="Paiement en attente" count={actionGroups.payment_pending.length} color="border-l-amber-500 bg-amber-50" orders={actionGroups.payment_pending} onSelect={setSelectedOrder} />
            )}
            {actionGroups.to_weigh.length > 0 && (
              <ActionGroup title="A peser" count={actionGroups.to_weigh.length} color="border-l-orange-500 bg-orange-50" orders={actionGroups.to_weigh} onSelect={setSelectedOrder} />
            )}
            {actionGroups.ready.length > 0 && (
              <ActionGroup title="Pret a expedier" count={actionGroups.ready.length} color="border-l-emerald-500 bg-emerald-50" orders={actionGroups.ready} onSelect={setSelectedOrder} />
            )}
            {actionGroups.shipped.length > 0 && (
              <ActionGroup title="En livraison" count={actionGroups.shipped.length} color="border-l-indigo-500 bg-indigo-50" orders={actionGroups.shipped} onSelect={setSelectedOrder} />
            )}
            {Object.values(actionGroups).every(g => g.length === 0) && (
              <div className="text-center py-12 text-gray-500">
                <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">Tout est a jour !</p>
                <p className="text-sm">Aucune action requise.</p>
              </div>
            )}
          </div>
        ) : (
          /* Liste simple pour les autres onglets */
          <div className="divide-y divide-gray-100">
            {displayOrders.length === 0 ? (
              <div className="text-center py-12 text-gray-500">Aucune commande</div>
            ) : (
              displayOrders.map((order, i) => (
                <OrderCard key={order.order_id} order={order} index={i} onClick={() => setSelectedOrder(order)} />
              ))
            )}
          </div>
        )}
      </div>

      {/* Navigation en bas */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-50">
        <div className="flex justify-around items-center h-14">
          {[
            { key: "actions", label: "Actions", icon: ClipboardList },
            { key: "local", label: "Local", icon: Home },
            { key: "import", label: "Import", icon: Package },
            { key: "archive", label: "Archive", icon: Archive },
          ].map(tab => (
            <button
              key={tab.key}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${activeTab === tab.key ? "text-orange-600" : "text-gray-500"}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Drawer */}
      {selectedOrder && (
        <OrderDrawer
          order={selectedOrder}
          orderIndex={selectedIndex}
          payments={getPayments(selectedOrder.order_id ?? "")}
          audit={getAudit(selectedOrder.order_id ?? "")}
          onClose={() => setSelectedOrder(null)}
          onPayment={handlePayment}
          onWeightRecorded={handleWeight}
          onStatusChange={handleStatus}
        />
      )}
    </div>
  );
}

/* ═══ Groupe d'actions ═══ */
function ActionGroup({ title, count, color, orders, onSelect }: {
  title: string; count: number; color: string;
  orders: LogisticsOrderRow[]; onSelect: (o: LogisticsOrderRow) => void;
}) {
  return (
    <div className={`rounded-lg border border-l-4 ${color} overflow-hidden`}>
      <div className={`px-3 py-2 flex items-center justify-between ${color}`}>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{title}</span>
          <span className="text-xs bg-white rounded-full px-2 py-0.5 font-bold">{count}</span>
        </div>
      </div>
      <div className="bg-white divide-y divide-gray-100">
        {orders.slice(0, 5).map((order, i) => (
          <OrderCard key={order.order_id} order={order} index={i} onClick={() => onSelect(order)} />
        ))}
        {orders.length > 5 && (
          <div className="px-4 py-2 text-center text-xs text-gray-400">+ {orders.length - 5} commandes</div>
        )}
      </div>
    </div>
  );
}
