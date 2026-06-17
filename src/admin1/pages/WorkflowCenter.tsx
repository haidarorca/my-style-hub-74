// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   WORKFLOW CENTER BETA v5 — Mobile-first, LOCAL/IMPORT separes
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Search, Home, Package, Truck, Clipboard, Archive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAdmin1Orders } from "@/admin1/hooks/useAdmin1Orders";
import { OrderDrawer } from "@/admin1/components/OrderDrawer";

export default function Admin1WorkflowCenter() {
  const { orders, isLoading } = useAdmin1Orders();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activeTab, setActiveTab] = useState("actions");
  const [searchTerm, setSearchTerm] = useState("");

  // LOCAL vs IMPORT
  const localOrders = useMemo(() => orders.filter(o => o.order_type === "local"), [orders]);
  const importOrders = useMemo(() => orders.filter(o => o.order_type === "import"), [orders]);

  // Groupes ACTIONS
  const actionGroups = useMemo(() => {
    const all = searchTerm
      ? orders.filter(o =>
          (o.customer_name ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (o.order_number ?? "").toLowerCase().includes(searchTerm.toLowerCase())
        )
      : orders;
    return {
      to_confirm: all.filter(o => o.status === "new"),
      payment_pending: all.filter(o => o.balance > 0 && o.status !== "delivered" && o.status !== "cancelled"),
      to_weigh: all.filter(o => o.status === "warehouse_arrived"),
      to_ship: all.filter(o => o.status === "ready_to_ship"),
      in_delivery: all.filter(o => o.status === "shipped"),
    };
  }, [orders, searchTerm]);

  // Contenu selon l'onglet
  const displayOrders = useMemo(() => {
    switch (activeTab) {
      case "local": return localOrders;
      case "import": return importOrders;
      case "archive": return orders.filter(o => o.status === "delivered" || o.status === "cancelled");
      case "actions":
      default:
        return orders.filter(o =>
          o.status === "new" ||
          (o.balance > 0 && o.status !== "delivered" && o.status !== "cancelled") ||
          o.status === "warehouse_arrived" ||
          o.status === "ready_to_ship" ||
          o.status === "shipped"
        );
    }
  }, [activeTab, orders, localOrders, importOrders]);

  const tabs = [
    { key: "actions", label: "Actions", icon: Clipboard, count: actionGroups.to_confirm.length + actionGroups.payment_pending.length + actionGroups.to_weigh.length },
    { key: "local", label: "Local", icon: Home, count: localOrders.length },
    { key: "import", label: "Import", icon: Package, count: importOrders.length },
    { key: "archive", label: "Archive", icon: Archive, count: orders.filter(o => o.status === "delivered" || o.status === "cancelled").length },
  ];

  if (isLoading) return <div className="flex items-center justify-center h-screen text-gray-500">Chargement...</div>;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header simple */}
      <div className="bg-white border-b px-4 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
          <Input placeholder="Rechercher..." className="pl-8 h-9 text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto pb-20">
        {activeTab === "actions" ? (
          <div className="p-3 space-y-3">
            {actionGroups.to_confirm.length > 0 && <GroupCard title="A confirmer" count={actionGroups.to_confirm.length} color="bg-purple-50 border-purple-200" orders={actionGroups.to_confirm} onSelect={setSelectedOrder} />}
            {actionGroups.payment_pending.length > 0 && <GroupCard title="Paiement en attente" count={actionGroups.payment_pending.length} color="bg-amber-50 border-amber-200" orders={actionGroups.payment_pending} onSelect={setSelectedOrder} />}
            {actionGroups.to_weigh.length > 0 && <GroupCard title="A peser" count={actionGroups.to_weigh.length} color="bg-orange-50 border-orange-200" orders={actionGroups.to_weigh} onSelect={setSelectedOrder} />}
            {actionGroups.to_ship.length > 0 && <GroupCard title="A expedier" count={actionGroups.to_ship.length} color="bg-emerald-50 border-emerald-200" orders={actionGroups.to_ship} onSelect={setSelectedOrder} />}
            {actionGroups.in_delivery.length > 0 && <GroupCard title="En livraison" count={actionGroups.in_delivery.length} color="bg-blue-50 border-blue-200" orders={actionGroups.in_delivery} onSelect={setSelectedOrder} />}
            {Object.values(actionGroups).every(g => g.length === 0) && (
              <div className="text-center py-12 text-gray-500"><Clipboard className="h-12 w-12 mx-auto mb-3 text-gray-300" /><p className="font-medium">Tout est a jour !</p></div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {displayOrders.length === 0 ? <div className="text-center py-12 text-gray-500">Aucune commande</div> : displayOrders.map((order, i) => (
              <button key={order.id} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left" onClick={() => setSelectedOrder(order)}>
                <div className="shrink-0"><div className="font-mono text-sm font-bold">{order.order_number}</div></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{order.customer_name ?? "—"}</div>
                  <div className="text-xs text-gray-500">{order.balance > 0 ? `${order.balance.toLocaleString()} F reste` : "Paye"}</div>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">{order.order_type === "local" ? "LOCAL" : "IMPORT"}</Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation en bas */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-50">
        <div className="flex justify-around items-center h-14">
          {tabs.map(tab => (
            <button key={tab.key} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${activeTab === tab.key ? "text-orange-600" : "text-gray-500"}`} onClick={() => setActiveTab(tab.key)}>
              <tab.icon className="h-5 w-5" /><span className="text-[10px] font-medium">{tab.label}</span>
              {tab.count > 0 && <span className="absolute -top-0.5 text-[9px] font-bold px-1 rounded-full bg-orange-500 text-white">{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <OrderDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}

function GroupCard({ title, count, color, orders, onSelect }) {
  return (
    <div className={`rounded-xl border ${color} overflow-hidden`}>
      <div className={`px-4 py-2.5 flex items-center justify-between ${color}`}>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{title}</span>
          <Badge variant="outline" className="text-[10px] h-5">{count}</Badge>
        </div>
      </div>
      <div className="bg-white divide-y divide-gray-100">
        {orders.slice(0, 5).map((order, i) => (
          <button key={order.id} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left" onClick={() => onSelect(order)}>
            <div className="font-mono text-xs font-bold text-gray-600">#{i + 1}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{order.customer_name ?? "—"}</div>
              <div className="text-xs text-gray-500">{order.customer_phone ?? "—"}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold">{order.total_due?.toLocaleString()} F</div>
              {order.balance > 0 && <div className="text-xs text-red-500">Reste: {order.balance?.toLocaleString()} F</div>}
            </div>
          </button>
        ))}
        {orders.length > 5 && <div className="px-4 py-2 text-center text-xs text-gray-400">+ {orders.length - 5} commandes</div>}
      </div>
    </div>
  );
}
