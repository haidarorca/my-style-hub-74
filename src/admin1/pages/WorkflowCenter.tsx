// @ts-nocheck
import { useState, useMemo } from "react";
import { Zap, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import type { OrderWithDetails } from "@/admin1/types/admin1";
import { useAdmin1Orders } from "@/admin1/hooks/useAdmin1Orders";
import { useAdmin1Kpi } from "@/admin1/hooks/useAdmin1Kpi";
import { buildTabs } from "@/admin1/lib/admin1.config";
import { KpiDashboard } from "@/admin1/components/KpiDashboard";
import { OrderTable } from "@/admin1/components/OrderTable";
import { OrderDrawer } from "@/admin1/components/OrderDrawer";
import { cn } from "@/lib/utils";

export default function Admin1WorkflowCenter() {
  const { orders, counts, isLoading, error, searchOrders, filterByStatuses } = useAdmin1Orders();
  const kpi = useAdmin1Kpi(
    orders.map((o) => ({ ...o, packages: [], payments: [], status_history: [] })),
    orders.flatMap((o) => o.payments)
  );

  const [activeTab, setActiveTab] = useState("new");
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const tabs = useMemo(() => buildTabs(counts), [counts]);

  /* ── Commandes a afficher selon l'onglet actif ── */
  const displayedOrders = useMemo(() => {
    const activeStatuses = tabs.find((t) => t.key === activeTab)?.statuses ?? ["new"];
    let filtered = filterByStatuses(activeStatuses);
    if (searchTerm.trim()) {
      const all = searchOrders(searchTerm);
      filtered = all.filter((o) => activeStatuses.includes(o.status));
    }
    return filtered;
  }, [activeTab, tabs, filterByStatuses, searchTerm, searchOrders]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" richColors />

      {/* ═══ EN-TETE ═══ */}
      <div className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-4 py-3">
          {/* Titre */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="bg-orange-500 text-white p-1.5 rounded-lg">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight">Workflow Center</h1>
                <p className="text-[11px] text-muted-foreground">
                  {orders.length} commandes · Pipeline operationnel
                </p>
              </div>
            </div>
          </div>

          {/* KPI */}
          <div className="mb-3">
            <KpiDashboard kpi={kpi} />
          </div>

          {/* Barre de recherche */}
          <div className="relative max-w-md mb-3">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher n°, client, telephone..."
              className="pl-9 h-9 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* 8 Onglets */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className={cn(
                    "text-xs h-8 px-2.5 gap-1.5 data-[state=active]:ring-2 data-[state=active]:ring-offset-0",
                    tab.count > 0 && tab.key !== "closed" && "data-[state=active]:ring-opacity-50"
                  )}
                  style={{
                    borderLeft: `3px solid`,
                    borderLeftColor: tab.key === "new" ? "#a855f7" :
                      tab.key === "deposit" ? "#f59e0b" :
                      tab.key === "processing" ? "#3b82f6" :
                      tab.key === "weigh" ? "#f97316" :
                      tab.key === "balance" ? "#06b6d4" :
                      tab.key === "ship" ? "#10b981" :
                      tab.key === "delivery" ? "#6366f1" : "#64748b"
                  }}
                >
                  <span className={tab.color}>{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  <Badge variant="outline" className={cn("text-[9px] h-4 min-w-4 px-1", tab.bg, tab.color)}>
                    {tab.count}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* ═══ CONTENU ═══ */}
      <div className="max-w-[1440px] mx-auto px-4 py-4">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Chargement...</div>
        ) : error ? (
          <div className="text-center py-12 text-red-600 text-sm">Erreur : {error instanceof Error ? error.message : "Inconnue"}</div>
        ) : (
          <div className="space-y-3">
            {/* Info onglet actif */}
            {(() => {
              const activeTabConfig = tabs.find((t) => t.key === activeTab);
              if (!activeTabConfig) return null;
              return (
                <div className={cn("rounded-lg border p-3 flex items-center justify-between", activeTabConfig.bg, activeTabConfig.border)}>
                  <div>
                    <span className={cn("font-semibold text-sm", activeTabConfig.color)}>{activeTabConfig.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">{displayedOrders.length} commande{displayedOrders.length > 1 ? "s" : ""}</span>
                  </div>
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", activeTabConfig.bg, activeTabConfig.color)}>
                    {activeTabConfig.action_label}
                  </span>
                </div>
              );
            })()}

            {/* Table */}
            <div className="rounded-xl border bg-white overflow-hidden">
              <OrderTable orders={displayedOrders} onSelect={setSelectedOrder} />
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      <OrderDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}
