// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   WORKFLOW CENTER BETA v5 — Reconstruction complete
   Mobile-first. LOCAL et IMPORT separes. Onglets en bas.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Search, Filter, Home, Package, Truck, ClipboardList, UserCheck, Archive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdmin1Orders } from "@/admin1/hooks/useAdmin1Orders";
import { OrderDrawer } from "@/components/workflow/WorkflowDrawer";
import { WorkflowFilterPanel } from "@/components/workflow/WorkflowFilterPanel";
import { useWorkflowFilters } from "@/hooks/use-workflow-filters";
import type { WorkflowRow } from "@/types/workflow";

export default function Admin1WorkflowCenter() {
  const { orders, isLoading } = useAdmin1Orders();
  const [selectedOrder, setSelectedOrder] = useState<WorkflowRow | null>(null);
  const [activeTab, setActiveTab] = useState("actions");
  const [searchTerm, setSearchTerm] = useState("");

  // Filtres
  const {
    filters,
    activeCount,
    filteredRows,
    options,
    updateFilter,
    resetFilters,
    toggleArrayValue,
  } = useWorkflowFilters(orders);

  // LOCAL vs IMPORT
  const localOrders = useMemo(() => filteredRows.filter(o => o.order_type === "local"), [filteredRows]);
  const importOrders = useMemo(() => filteredRows.filter(o => o.order_type === "import"), [filteredRows]);

  // Groupes ACTIONS (ce qui necessite une action)
  const actionGroups = useMemo(() => {
    const all = searchTerm
      ? filteredRows.filter(o =>
          (o.customer_name ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (o.order_id ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (o.customer_phone ?? "").toLowerCase().includes(searchTerm.toLowerCase())
        )
      : filteredRows;

    return {
      to_confirm: all.filter(o => !o.logistics_status || o.logistics_status === "new"),
      payment_pending: all.filter(o => (o.amount_remaining ?? 0) > 0 && o.logistics_status !== "cancelled" && o.logistics_status !== "delivered"),
      to_weigh: all.filter(o => o.logistics_status === "awaiting_weighing"),
      to_ship: all.filter(o => o.logistics_status === "validated" || o.logistics_status === "ready_to_ship"),
      in_delivery: all.filter(o => o.logistics_status === "shipped"),
    };
  }, [filteredRows, searchTerm]);

  // Contenu selon l'onglet actif
  const displayOrders = useMemo(() => {
    switch (activeTab) {
      case "actions": return filteredRows.filter(o =>
        !o.logistics_status ||
        o.logistics_status === "new" ||
        ((o.amount_remaining ?? 0) > 0 && o.logistics_status !== "cancelled" && o.logistics_status !== "delivered") ||
        o.logistics_status === "awaiting_weighing" ||
        o.logistics_status === "validated" ||
        o.logistics_status === "ready_to_ship" ||
        o.logistics_status === "shipped"
      );
      case "local": return localOrders;
      case "import": return importOrders;
      case "all": return filteredRows;
      case "archive": return filteredRows.filter(o => o.logistics_status === "delivered" || o.logistics_status === "cancelled");
      default: return filteredRows;
    }
  }, [activeTab, filteredRows, localOrders, importOrders]);

  // Onglets de navigation (en bas sur mobile)
  const tabs = [
    { key: "actions", label: "Actions", icon: ClipboardList, count: actionGroups.to_confirm.length + actionGroups.payment_pending.length },
    { key: "local", label: "Local", icon: Home, count: localOrders.length },
    { key: "import", label: "Import", icon: Package, count: importOrders.length },
    { key: "all", label: "Toutes", icon: ClipboardList, count: filteredRows.length },
    { key: "archive", label: "Archive", icon: Archive, count: filteredRows.filter(o => o.logistics_status === "delivered" || o.logistics_status === "cancelled").length },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen text-gray-500">Chargement...</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ═══ HEADER SIMPLE (pas sticky) ═══ */}
      <div className="bg-white border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Rechercher..."
              className="pl-8 h-9 text-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <WorkflowFilterPanel
            filters={filters}
            activeCount={activeCount}
            options={options}
            filteredCount={filteredRows.length}
            totalCount={orders.length}
            onUpdate={updateFilter}
            onToggleArray={toggleArrayValue}
            onReset={resetFilters}
          />
        </div>
      </div>

      {/* ═══ CONTENU SCROLLABLE ═══ */}
      <div className="flex-1 overflow-y-auto pb-20">
        {/* Groupes d'actions (visible seulement sur l'onglet Actions) */}
        {activeTab === "actions" && (
          <div className="p-3 space-y-3">
            {actionGroups.to_confirm.length > 0 && (
              <GroupCard title="A confirmer" count={actionGroups.to_confirm.length} color="bg-purple-50 border-purple-200" orders={actionGroups.to_confirm} onSelect={setSelectedOrder} />
            )}
            {actionGroups.payment_pending.length > 0 && (
              <GroupCard title="Paiement en attente" count={actionGroups.payment_pending.length} color="bg-amber-50 border-amber-200" orders={actionGroups.payment_pending} onSelect={setSelectedOrder} />
            )}
            {actionGroups.to_weigh.length > 0 && (
              <GroupCard title="A peser" count={actionGroups.to_weigh.length} color="bg-orange-50 border-orange-200" orders={actionGroups.to_weigh} onSelect={setSelectedOrder} />
            )}
            {actionGroups.to_ship.length > 0 && (
              <GroupCard title="A expedier" count={actionGroups.to_ship.length} color="bg-emerald-50 border-emerald-200" orders={actionGroups.to_ship} onSelect={setSelectedOrder} />
            )}
            {actionGroups.in_delivery.length > 0 && (
              <GroupCard title="En livraison" count={actionGroups.in_delivery.length} color="bg-blue-50 border-blue-200" orders={actionGroups.in_delivery} onSelect={setSelectedOrder} />
            )}
            {Object.values(actionGroups).every(g => g.length === 0) && (
              <div className="text-center py-12 text-gray-500">
                <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">Tout est a jour !</p>
                <p className="text-sm">Aucune action requise.</p>
              </div>
            )}
          </div>
        )}

        {/* Liste simple pour les autres onglets */}
        {activeTab !== "actions" && (
          <div className="divide-y divide-gray-100">
            {displayOrders.length === 0 ? (
              <div className="text-center py-12 text-gray-500">Aucune commande</div>
            ) : (
              displayOrders.map((order, i) => (
                <button
                  key={order.order_id}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
                  onClick={() => setSelectedOrder(order)}
                >
                  <div className="shrink-0">
                    <div className="font-mono text-sm font-bold">#{i + 1}</div>
                    <div className="text-[10px] text-gray-400">{order.order_id?.slice(-6)}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{order.customer_name ?? "—"}</div>
                    <div className="text-xs text-gray-500">{(order.amount_remaining ?? 0) > 0 ? `${(order.amount_remaining ?? 0).toLocaleString()} F reste` : "Paye"}</div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {order.order_type === "local" ? "LOCAL" : "IMPORT"}
                  </Badge>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* ═══ NAVIGATION EN BAS (type app mobile) ═══ */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-50">
        <div className="flex justify-around items-center h-14">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                activeTab === tab.key ? "text-orange-600" : "text-gray-500"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
              {tab.count > 0 && (
                <span className={`absolute -top-1 text-[9px] font-bold px-1 rounded-full ${
                  activeTab === tab.key ? "bg-orange-500 text-white" : "bg-gray-300 text-gray-700"
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Drawer */}
      <OrderDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}

/* ═══ Groupe d'actions ═══ */
function GroupCard({ title, count, color, orders, onSelect }: {
  title: string; count: number; color: string;
  orders: WorkflowRow[]; onSelect: (o: WorkflowRow) => void;
}) {
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
          <button
            key={order.order_id}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
            onClick={() => onSelect(order)}
          >
            <div className="font-mono text-xs font-bold text-gray-600">#{i + 1}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{order.customer_name ?? "—"}</div>
              <div className="text-xs text-gray-500">{order.customer_phone ?? "—"}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold">{order.order_total?.toLocaleString()} F</div>
              {(order.amount_remaining ?? 0) > 0 && (
                <div className="text-xs text-red-500">Reste: {(order.amount_remaining ?? 0).toLocaleString()} F</div>
              )}
            </div>
          </button>
        ))}
        {orders.length > 5 && (
          <div className="px-4 py-2 text-center text-xs text-gray-400">
            + {orders.length - 5} commandes
          </div>
        )}
      </div>
    </div>
  );
}
