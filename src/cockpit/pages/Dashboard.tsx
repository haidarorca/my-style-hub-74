// ═══════════════════════════════════════════════════════════════
// DASHBOARD — Cockpit Kawzone (architecture sous-commandes boutiques)
// Une seule vue : pipeline par sous-commande boutique.
// Le concept MIXTE et les KPI globaux ont été retirés.
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { Search, ClipboardList, Archive, X, Filter, ArrowUpDown, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRealOrders } from "@/cockpit/hooks/useRealOrders";
import { useArticleStates } from "@/cockpit/hooks/useArticleStates";
import { useAuth } from "@/hooks/use-auth";
import { OrderDrawer } from "@/cockpit/components/OrderDrawer";
import { CancelDialog } from "@/cockpit/components/CancelDialog";
import { CloseConfirmDialog } from "@/cockpit/components/CloseConfirmDialog";
import { DateRangeFilter } from "@/cockpit/components/DateRangeFilter";
import { OrderItemsPanel } from "@/cockpit/components/OrderItemsPanel";
import { PipelineView } from "@/cockpit/components/PipelineView";
import { useSubOrderRows } from "@/cockpit/hooks/useSubOrderRows";
import type { DateRange } from "react-day-picker";
import { fmtF } from "@/cockpit/lib/workflow";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { ArchiveFilter } from "@/cockpit/types";
import type { ArticleStatus, StockBreakAction, StockBreakDecision, Settlement } from "@/cockpit/lib/article-states";

type SortField = "date" | "amount" | "name" | "status";
type SortDir = "asc" | "desc";

const ALL_STATUSES = [
  { key: "new", label: "A confirmer" },
  { key: "confirmed", label: "Confirmee" },
  { key: "ordered_supplier", label: "Commandee fournisseur" },
  { key: "received_warehouse", label: "Recue entrepot" },
  { key: "awaiting_weighing", label: "A peser" },
  { key: "fees_calculated", label: "Calcul frais" },
  { key: "payment_fees", label: "Paiement client" },
  { key: "ready", label: "Prete (local)" },
  { key: "ready_delivery", label: "Prete (import)" },
  { key: "shipped", label: "Expediee" },
  { key: "delivered", label: "Livree" },
  { key: "cancelled", label: "Annulee" },
];

export default function CockpitDashboard() {
  const { profile } = useAuth();
  const adminName = profile?.full_name ?? profile?.email ?? "Admin";
  const {
    orders, isLoading, searchTerm, setSearchTerm,
    getPayments, getTotalPaid, getAudit,
    addPayment, editPayment, deletePayment,
    getWeighings, addWeighing,
    updateStatus, cancelOrder, cancellations,
    freightMap, getOrderFinancials, orderTypeMap,
  } = useRealOrders();

  const [selectedOrder, setSelectedOrder] = useState<LogisticsOrderRow | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | undefined>(undefined);

  const { rows: managedSubRows, allRows: allSubRows } = useSubOrderRows(orders);
  const [showAutonomous, setShowAutonomous] = useState(false);
  const subOrderRows = showAutonomous ? allSubRows : managedSubRows;
  const autonomousCount = allSubRows.length - managedSubRows.length;

  const openOrder = useCallback((o: LogisticsOrderRow) => {
    setSelectedVendorId(undefined);
    setSelectedOrder(o);
  }, []);

  // ─── Deep-link : ?orderId=…&focus=money ───
  const search = useSearch({ from: "/admin/cockpit" });
  const navigate = useNavigate({ from: "/admin/cockpit" });
  useEffect(() => {
    if (!search.orderId || orders.length === 0) return;
    const found = orders.find(o => o.order_id === search.orderId);
    if (!found) return;
    setSelectedOrder(found);
    const focus = search.focus;
    navigate({ search: {}, replace: true });
    if (focus === "money") {
      setTimeout(() => {
        const el = document.getElementById("cockpit-financial-actions");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
    }
  }, [search.orderId, search.focus, orders, navigate]);

  const [activeTab, setActiveTab] = useState<"actions" | "archive">("actions");

  // Dialogs
  const [showCancel, setShowCancel] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showItemsPanel, setShowItemsPanel] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Filtres avancés
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [balanceFilter, setBalanceFilter] = useState<string>("");
  const [minDays, setMinDays] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Tri
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ─── Article states ───
  const articlesHook = useArticleStates(
    selectedOrder?.order_id ?? null,
    selectedOrder?.logistics_status ?? undefined
  );
  const selectedArticles = selectedOrder ? articlesHook.articles : undefined;

  const handleStockBreak = useCallback((productId: string, data: { reason: string; action: StockBreakAction }) => {
    const art = selectedArticles?.find(a => a.product_id === productId);
    if (!art) return;
    const last_valid_status = art.status !== "no_stock" ? art.status : art.stock_break?.last_valid_status;
    const decision: StockBreakDecision = {
      reason: data.reason,
      action: data.action,
      action_label: data.action,
      resolved: true,
      created_at: new Date().toISOString(),
      last_valid_status,
    };
    void articlesHook.mutate({
      product_id: productId,
      variant_id: art.variant_id,
      patch: { status: "no_stock", stock_break: decision },
      audit_action: `stock_break.${data.action}`,
      expected_version: art.version,
    });
  }, [selectedArticles, articlesHook]);

  const handleResumeRestock = useCallback((productId: string) => {
    const art = selectedArticles?.find(a => a.product_id === productId);
    if (!art || !art.stock_break || art.stock_break.action !== "wait_restock") return;
    const memorized = art.stock_break.last_valid_status;
    const fallback: ArticleStatus = art.is_import ? "received" : "available";
    const target: ArticleStatus = memorized ?? fallback;
    const newSb: StockBreakDecision = {
      ...art.stock_break,
      resumed_at: new Date().toISOString(),
      resumed_by: adminName,
    };
    void articlesHook.mutate({
      product_id: productId,
      variant_id: art.variant_id,
      patch: { status: target, stock_break: newSb },
      audit_action: "stock_break.resume_restock",
      expected_version: art.version,
    });
  }, [selectedArticles, articlesHook, adminName]);

  const handleArticleStatusChange = useCallback((productId: string, status: ArticleStatus) => {
    const art = selectedArticles?.find(a => a.product_id === productId);
    if (!art) return;
    void articlesHook.mutate({
      product_id: productId,
      variant_id: art.variant_id,
      patch: { status },
      audit_action: `status.${status}`,
      expected_version: art.version,
    });
  }, [selectedArticles, articlesHook]);

  const handlePartialDeliver = useCallback((productId: string, qty: number) => {
    const art = selectedArticles?.find(a => a.product_id === productId);
    if (!art) return;
    const newDelivered = (art.delivered_qty ?? 0) + qty;
    const fullyDelivered = newDelivered >= art.quantity;
    void articlesHook.mutate({
      product_id: productId,
      variant_id: art.variant_id,
      patch: {
        delivered_qty: newDelivered,
        status: fullyDelivered ? "delivered" : art.status,
      },
      audit_action: "partial_deliver",
      expected_version: art.version,
    });
  }, [selectedArticles, articlesHook]);

  const handleSettleFinancial = useCallback((productId: string, data: { type: Settlement["type"]; amount: number; cost_attribution: Settlement["cost_attribution"]; method?: string; reference?: string; note?: string; shared_split?: Settlement["shared_split"] }) => {
    const art = selectedArticles?.find(a => a.product_id === productId);
    if (!art) return;
    const settlement: Settlement = {
      type: data.type,
      amount: data.amount,
      cost_attribution: data.cost_attribution,
      shared_split: data.shared_split,
      method: data.method,
      reference: data.reference,
      note: data.note,
      processed_at: new Date().toISOString(),
      processed_by: adminName,
    };
    void articlesHook.mutate({
      product_id: productId,
      variant_id: art.variant_id,
      patch: { settlement },
      audit_action: `settlement.${data.type}`,
      expected_version: art.version,
    });
  }, [selectedArticles, articlesHook, adminName]);

  const selectedIndex = useMemo(() => selectedOrder ? orders.findIndex(o => o.order_id === selectedOrder.order_id) : 0, [selectedOrder, orders]);
  const selPayments = selectedOrder ? getPayments(selectedOrder.order_id ?? "") : [];
  const selAudit = selectedOrder ? getAudit(selectedOrder.order_id ?? "") : [];
  const selWeighings = selectedOrder ? getWeighings(selectedOrder.order_id ?? "") : [];
  const selTotalPaid = selectedOrder ? getTotalPaid(selectedOrder.order_id ?? "") : 0;
  const selFinancials = selectedOrder ? getOrderFinancials(selectedOrder) : { productTotal: 0, freight: 0, grandTotal: 0, paid: 0, remaining: 0 };

  const totalPaidMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) m[o.order_id ?? ""] = getOrderFinancials(o).paid;
    return m;
  }, [orders, getOrderFinancials]);

  const getOrderAge = useCallback((o: LogisticsOrderRow) => {
    const created = new Date(o.order_created_at ?? Date.now());
    const now = new Date();
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  }, []);

  // ─── Filtered & Sorted orders ───
  const displayOrders = useMemo(() => {
    let list = orders;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(o =>
        (o.order_id ?? "").toLowerCase().includes(q) ||
        (o.customer_name ?? "").toLowerCase().includes(q) ||
        (o.customer_phone ?? "").toLowerCase().includes(q) ||
        getOrderNumber(o.order_id ?? "").toLowerCase().includes(q)
      );
    }

    if (activeTab === "archive") {
      list = list.filter(o => o.logistics_status === "delivered" || o.logistics_status === "cancelled");
    } else {
      list = list.filter(o => o.logistics_status !== "delivered" && o.logistics_status !== "cancelled");
    }

    if (statusFilter) {
      const statusMatch = (o: LogisticsOrderRow) => {
        const s = o.logistics_status ?? "";
        if (statusFilter === "new") return s === "" || s === "new";
        return s === statusFilter;
      };
      list = list.filter(statusMatch);
    }
    if (balanceFilter) {
      list = list.filter(o => {
        const { paid, remaining } = getOrderFinancials(o);
        const gt = (o.order_total ?? 0) + (o.total_shipping_fees ?? 0);
        if (balanceFilter === "unpaid") return paid === 0 && remaining > 0;
        if (balanceFilter === "partial") return paid > 0 && remaining > 0;
        if (balanceFilter === "paid") return remaining === 0 && gt > 0;
        return true;
      });
    }
    if (minDays) {
      const days = parseInt(minDays);
      if (!isNaN(days)) list = list.filter(o => getOrderAge(o) >= days);
    }
    if (dateRange?.from) {
      const fromTime = dateRange.from.getTime();
      list = list.filter(o => new Date(o.order_created_at ?? 0).getTime() >= fromTime);
    }
    if (dateRange?.to) {
      const toTime = dateRange.to.getTime() + 24 * 60 * 60 * 1000;
      list = list.filter(o => new Date(o.order_created_at ?? 0).getTime() <= toTime);
    }

    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortField) {
        case "date": return dir * (new Date(b.order_created_at ?? 0).getTime() - new Date(a.order_created_at ?? 0).getTime());
        case "amount": return dir * ((b.order_total ?? 0) - (a.order_total ?? 0));
        case "name": return dir * ((a.customer_name ?? "").localeCompare(b.customer_name ?? ""));
        case "status": return dir * ((a.logistics_status ?? "").localeCompare(b.logistics_status ?? ""));
        default: return 0;
      }
    });

    return list;
  }, [orders, searchTerm, activeTab, getOrderFinancials, statusFilter, balanceFilter, minDays, sortField, sortDir, getOrderAge, dateRange]);

  const resultCount = displayOrders.length;
  const activeFilterCount = [statusFilter, balanceFilter, minDays, (dateRange?.from ? "date" : "")].filter(Boolean).length;

  const handleStatus = (orderId: string, status: string, _admin: string) => {
    updateStatus(orderId, status, _admin || adminName);
    setHasChanges(false);
  };
  const handlePayment = (orderId: string, amount: number, method: string, reference: string, _admin: string) => {
    addPayment(orderId, amount, method, reference, _admin || adminName);
    setHasChanges(false);
  };
  const handleWeigh = (record: Parameters<typeof addWeighing>[0]) => { addWeighing(record); setHasChanges(false); };

  const doCancel = useCallback((reason: string, refundType: string) => {
    if (!selectedOrder) return;
    cancelOrder(selectedOrder.order_id ?? "", reason, refundType as any, adminName);
    setShowCancel(false);
    setSelectedOrder(null);
    setSelectedVendorId(undefined);
  }, [selectedOrder, cancelOrder, adminName]);

  const handleCloseDrawer = useCallback(() => {
    setShowItemsPanel(false);
    if (hasChanges) setShowCloseConfirm(true);
    else { setSelectedOrder(null); setSelectedVendorId(undefined); }
  }, [hasChanges]);
  const confirmClose = useCallback(() => { setShowCloseConfirm(false); setHasChanges(false); setSelectedOrder(null); setSelectedVendorId(undefined); }, []);

  if (isLoading) return <div className="flex items-center justify-center h-screen text-gray-500">Chargement des commandes...</div>;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-sm font-bold">Kawzone Cockpit</h1>
          <span className="text-[10px] text-gray-500">{subOrderRows.length} sous-commandes</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
          <Input placeholder="Rechercher (nom, telephone, KZ-xxx)..." className="pl-8 h-9 text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {/* Barre outils */}
      <div className="px-4 pt-2 pb-1 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tri */}
          <div className="relative shrink-0">
            <select
              value={`${sortField}_${sortDir}`}
              onChange={e => { const [f, d] = e.target.value.split("_"); setSortField(f as SortField); setSortDir(d as SortDir); }}
              className="appearance-none bg-gray-100 text-[10px] text-gray-600 rounded-lg pl-7 pr-3 py-1.5 cursor-pointer"
            >
              <option value="date_desc">Date ↓</option>
              <option value="date_asc">Date ↑</option>
              <option value="amount_desc">Montant ↓</option>
              <option value="amount_asc">Montant ↑</option>
              <option value="name_asc">Nom A-Z</option>
              <option value="status_asc">Statut</option>
            </select>
            <ArrowUpDown className="absolute left-2 top-1.5 h-3 w-3 text-gray-400 pointer-events-none" />
          </div>

          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-lg font-medium ${showFilters || activeFilterCount > 0 ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"}`}
          >
            <Filter className="h-3 w-3" />
            Filtres{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>

          <button
            onClick={() => setShowAutonomous(v => !v)}
            title="Afficher aussi les sous-commandes de boutiques 100% autonomes (sans intervention Kawzone)"
            className={`flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-lg font-medium ml-auto ${showAutonomous ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {showAutonomous ? "Tout afficher" : `Kawzone uniquement${autonomousCount > 0 ? ` (+${autonomousCount} masquées)` : ""}`}
          </button>

          <button
            onClick={() => {
              const rows = displayOrders.map(o => {
                const { productTotal, freight, grandTotal, paid, remaining } = getOrderFinancials(o);
                return [getOrderNumber(o.order_id ?? ""), o.customer_name ?? "", o.logistics_status ?? "new", productTotal, freight, grandTotal, paid, remaining].join(",");
              });
              const csv = "KZ,Client,Statut,Produit,Fret,Total,Paye,Reste\n" + rows.join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `cockpit_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            <Download className="h-3 w-3" />CSV
          </button>
        </div>

        {showFilters && (
          <div className="bg-white border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">Filtres avancés</span>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setStatusFilter(""); setBalanceFilter(""); setMinDays(""); setDateRange(undefined); }}
                  className="text-[10px] text-red-500 hover:text-red-700"
                >
                  Tout effacer
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">Statut</label>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full text-[11px] border rounded h-8 px-2">
                  <option value="">Tous</option>
                  {ALL_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">Solde</label>
                <select value={balanceFilter} onChange={e => setBalanceFilter(e.target.value)} className="w-full text-[11px] border rounded h-8 px-2">
                  <option value="">Tous</option>
                  <option value="unpaid">Non paye</option>
                  <option value="partial">Partiel</option>
                  <option value="paid">Paye total</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">Anciennete min (jours)</label>
                <input type="number" placeholder="Ex: 7" value={minDays} onChange={e => setMinDays(e.target.value)} className="w-full text-[11px] border rounded h-8 px-2" />
              </div>
              <div className="col-span-2">
                <DateRangeFilter dateRange={dateRange} onChange={setDateRange} />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400">{resultCount} commande{resultCount > 1 ? "s" : ""} affichee{resultCount > 1 ? "s" : ""}</span>
          {resultCount !== orders.length && <span className="text-[10px] text-orange-500">sur {orders.length} total</span>}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-16">
        {activeTab === "archive" ? (
          <ArchiveView orders={displayOrders} onSelect={setSelectedOrder} cancellations={cancellations} />
        ) : (
          <PipelineView
            orders={displayOrders}
            totalPaidMap={totalPaidMap}
            freightMap={freightMap}
            onSelect={openOrder}
            orderTypeMap={orderTypeMap}
            subRows={subOrderRows.filter(r => displayOrders.some(o => o.order_id === r.mother_order_id))}
            onSelectSubRow={(row) => {
              setSelectedVendorId(row.vendor_id);
              setSelectedOrder(row.order);
            }}
          />
        )}
      </div>

      {/* Bottom nav — Actions + Archive uniquement */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-50">
        <div className="flex justify-around items-center h-14">
          {[
            { k: "actions" as const, l: "Actions", i: ClipboardList },
            { k: "archive" as const, l: "Archive", i: Archive },
          ].map(t => (
            <button key={t.k} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${activeTab === t.k ? "text-orange-600" : "text-gray-500"}`} onClick={() => setActiveTab(t.k)}>
              <t.i className="h-5 w-5" /><span className="text-[10px] font-medium">{t.l}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Drawer */}
      {selectedOrder && (
        <OrderDrawer
          order={selectedOrder} orderIndex={selectedIndex} payments={selPayments} audit={selAudit} weighings={selWeighings} financials={selFinancials}
          onClose={handleCloseDrawer} onPayment={handlePayment} onEditPayment={editPayment} onDeletePayment={deletePayment}
          onWeigh={handleWeigh} onStatusChange={handleStatus} onRequestCancel={() => setShowCancel(true)} onViewItems={() => setShowItemsPanel(true)} onFormInteraction={() => setHasChanges(true)}
          articles={selectedArticles}
          onStockBreak={handleStockBreak}
          onArticleStatusChange={handleArticleStatusChange}
          onPartialDeliver={handlePartialDeliver}
          onSettleFinancial={handleSettleFinancial}
          onResumeRestock={handleResumeRestock}
          vendorId={selectedVendorId}
          onVendorChange={setSelectedVendorId}
          dialogs={
            <>
              {showItemsPanel && (
                <OrderItemsPanel orderId={selectedOrder.order_id ?? ""} onClose={() => setShowItemsPanel(false)} />
              )}
              <CancelDialog open={showCancel} onClose={() => setShowCancel(false)} onConfirm={doCancel} paidAmount={selTotalPaid} status={selectedOrder.logistics_status ?? "new"} kzNumber={getOrderNumber(selectedOrder.order_id ?? "")} />
              <CloseConfirmDialog open={showCloseConfirm} onStay={() => setShowCloseConfirm(false)} onLeave={confirmClose} />
            </>
          }
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════
// Archive View — liste simple des commandes terminées
// ════════════════════════════════════════════

function ArchiveView({ orders, onSelect, cancellations }: {
  orders: LogisticsOrderRow[];
  onSelect: (o: LogisticsOrderRow) => void;
  cancellations: any[];
}) {
  const [filter, setFilter] = useState<ArchiveFilter>("all");
  const filtered = orders.filter(o => filter === "all" || o.logistics_status === filter);
  return (
    <div>
      <div className="px-4 pt-2 pb-1 flex gap-2">
        {(["all", "delivered", "cancelled"] as ArchiveFilter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`text-[10px] px-3 py-1.5 rounded-full border ${filter === f ? "bg-orange-100 border-orange-300 text-orange-800 font-semibold" : "bg-white border-gray-200 text-gray-600"}`}>
            {f === "all" ? "Toutes" : f === "delivered" ? "Livrées" : "Annulées"}
          </button>
        ))}
      </div>
      <div className="divide-y divide-gray-100">
        {filtered.length === 0 ? <div className="text-center py-12 text-gray-500">Archive vide</div> : filtered.map(o => {
          const cancel = cancellations.find((c: any) => c.orderId === o.order_id);
          return (
            <button key={o.order_id} onClick={() => onSelect(o)} className="w-full flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 text-left">
              <div className="shrink-0 w-16">
                <div className="font-mono text-[11px] font-bold text-gray-800">{getOrderNumber(o.order_id ?? "")}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{o.customer_name ?? "—"}</div>
                {cancel && <div className="text-[10px] text-red-500">Annulée: {cancel.reason} ({cancel.refundType})</div>}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-bold">{fmtF(o.order_total ?? 0)}</div>
                <div className={`text-[10px] ${o.logistics_status === "delivered" ? "text-emerald-500" : "text-red-500"}`}>{o.logistics_status === "delivered" ? "Livrée" : "Annulée"}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
