// ═══════════════════════════════════════════════════════════════
// DASHBOARD — Centre de pilotage ERP Kawzone
// Chaque bouton modifie réellement les données et fait avancer
// la commande dans son cycle de vie.
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from "react";
import { Search, ClipboardList, Home, Package, Archive, X, ArrowLeft, Pencil, Trash2, Filter, ChevronDown, AlertTriangle, ArrowUpDown, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRealOrders } from "@/cockpit/hooks/useRealOrders";
import { useAuth } from "@/hooks/use-auth";
import { KpiCards } from "@/cockpit/components/KpiCards";
import { OrderCard } from "@/cockpit/components/OrderCard";
import { OrderDrawer } from "@/cockpit/components/OrderDrawer";
import { CancelDialog } from "@/cockpit/components/CancelDialog";
import { CloseConfirmDialog } from "@/cockpit/components/CloseConfirmDialog";
import { DateRangeFilter } from "@/cockpit/components/DateRangeFilter";
import { PipelineView } from "@/cockpit/components/PipelineView";
import type { DateRange } from "react-day-picker";
import { fmtF, isImport, STATUS_LABELS, statusToKpiFilter } from "@/cockpit/lib/workflow";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { KpiFilter, ArchiveFilter } from "@/cockpit/types";

// ─── Config tri ───
type SortField = "date" | "amount" | "name" | "status";
type SortDir = "asc" | "desc";

// ─── Tous les statuts pour le filtre ───
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

// ─── Config postes de travail ───
// Chaque poste définit: titre, label du bouton, couleur, prochain statut
const WORKSTATIONS: Record<string, { title: string; actionLabel: string; actionColor: string; nextStatus: string }> = {
  new: { title: "POSTE — À confirmer", actionLabel: "Confirmer", actionColor: "bg-emerald-600 hover:bg-emerald-700 text-white", nextStatus: "confirmed" },
  payment_pending: { title: "POSTE — Paiements", actionLabel: "Marquer payée", actionColor: "bg-emerald-600 hover:bg-emerald-700 text-white", nextStatus: "ready" },
  to_weigh: { title: "POSTE — À peser", actionLabel: "Pesée enregistrée", actionColor: "bg-orange-600 hover:bg-orange-700 text-white", nextStatus: "fees_calculated" },
  ready: { title: "POSTE — Prête à expédier", actionLabel: "Expédier", actionColor: "bg-indigo-600 hover:bg-indigo-700 text-white", nextStatus: "shipped" },
  shipped: { title: "POSTE — En livraison", actionLabel: "Marquer livrée", actionColor: "bg-emerald-600 hover:bg-emerald-700 text-white", nextStatus: "delivered" },
};

export default function CockpitDashboard() {
  const { profile } = useAuth();
  const adminName = profile?.full_name ?? profile?.email ?? "Admin";
  const {
    orders, isLoading, searchTerm, setSearchTerm,
    getPayments, getTotalPaid, getAudit,
    addPayment, editPayment, deletePayment,
    getWeighings, addWeighing,
    updateStatus, cancelOrder, getCancellation, cancellations,
    freightMap, getOrderFinancials,
  } = useRealOrders();

  const [selectedOrder, setSelectedOrder] = useState<LogisticsOrderRow | null>(null);
  const [activeTab, setActiveTab] = useState<"actions" | "local" | "import" | "archive">("actions");
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>(null);
  const [viewMode, setViewMode] = useState<"list" | "pipeline">("pipeline");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("all");

  // Dialogs
  const [showCancel, setShowCancel] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // ─── Filtres avancés ───
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>(""); // "", "local", "import"
  const [balanceFilter, setBalanceFilter] = useState<string>(""); // "", "unpaid", "partial", "paid"
  const [minDays, setMinDays] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // ─── Tri ───
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ─── Sélection multiple ───
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  // États locaux pour formulaires inline
  const [payForms, setPayForms] = useState<Record<string, { amount: string; method: string; reference: string }>>({});
  const [weighForms, setWeighForms] = useState<Record<string, { realWeight: string; length: string; width: string; height: string }>>({});
  const [editingPay, setEditingPay] = useState<string | null>(null);
  const [editPayForm, setEditPayForm] = useState<{ amount: string; method: string; reference: string }>({ amount: "", method: "wave", reference: "" });

  const selectedIndex = useMemo(() => selectedOrder ? orders.findIndex(o => o.order_id === selectedOrder.order_id) : 0, [selectedOrder, orders]);
  const selPayments = selectedOrder ? getPayments(selectedOrder.order_id ?? "") : [];
  const selAudit = selectedOrder ? getAudit(selectedOrder.order_id ?? "") : [];
  const selWeighings = selectedOrder ? getWeighings(selectedOrder.order_id ?? "") : [];
  const selTotalPaid = selectedOrder ? getTotalPaid(selectedOrder.order_id ?? "") : 0;
  const selFinancials = selectedOrder ? getOrderFinancials(selectedOrder) : { productTotal: 0, freight: 0, grandTotal: 0, paid: 0, remaining: 0 };

  // totalPaidMap pour PipelineView
  const totalPaidMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) m[o.order_id ?? ""] = getOrderFinancials(o).paid;
    return m;
  }, [orders, getOrderFinancials]);

  // ─── KPI data ───
  const kpi = useMemo(() => {
    const s = { new: 0, payment_pending: 0, to_weigh: 0, ready: 0, shipped: 0 };
    let debt = 0;
    for (const o of orders) {
      const st = o.logistics_status ?? "";
      if (st === "delivered" || st === "cancelled") continue;

      // Compter par statut exact pour les KPI
      if (st === "" || st === "new") s.new++;
      else if (st === "awaiting_weighing") s.to_weigh++;
      else if (st === "shipped") s.shipped++;
      else if (st === "ready" || st === "ready_delivery") s.ready++;

      // Dettes: solde restant (toutes commandes actives)
      const { remaining } = getOrderFinancials(o);
      if (remaining > 0) debt += remaining;
    }
    return { ...s, debt };
  }, [orders, getOrderFinancials]);

  // ─── Calcul d'alerte (âge de la commande) ───
  const getOrderAge = useCallback((o: LogisticsOrderRow) => {
    const created = new Date(o.order_created_at ?? Date.now());
    const now = new Date();
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  }, []);

  // ─── Filtered & Sorted orders ───
  const displayOrders = useMemo(() => {
    let list = orders;

    // 1. Recherche texte
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(o =>
        (o.order_id ?? "").toLowerCase().includes(q) ||
        (o.customer_name ?? "").toLowerCase().includes(q) ||
        (o.customer_phone ?? "").toLowerCase().includes(q) ||
        getOrderNumber(o.order_id ?? "").toLowerCase().includes(q)
      );
    }

    // 2. Tab filter (local/import/archive)
    switch (activeTab) {
      case "local": list = list.filter(o => !isImport(o)); break;
      case "import": list = list.filter(o => isImport(o)); break;
      case "archive": list = list.filter(o => o.logistics_status === "delivered" || o.logistics_status === "cancelled"); break;
      default: list = list.filter(o => o.logistics_status !== "delivered" && o.logistics_status !== "cancelled"); break;
    }

    // 3. KPI filter (quand on clique sur un KPI card)
    if (kpiFilter === "debt") {
      list = list.filter(o => getOrderFinancials(o).remaining > 0);
    } else if (kpiFilter === "payment_pending") {
      list = list.filter(o => getOrderFinancials(o).remaining > 0);
    } else if (kpiFilter === "ready") {
      list = list.filter(o => {
        const st = o.logistics_status ?? "";
        return (st === "ready" || st === "ready_delivery") && getOrderFinancials(o).remaining === 0;
      });
    } else if (kpiFilter === "new") {
      list = list.filter(o => { const st = o.logistics_status ?? ""; return st === "" || st === "new"; });
    } else if (kpiFilter === "to_weigh") {
      list = list.filter(o => o.logistics_status === "awaiting_weighing");
    } else if (kpiFilter === "shipped") {
      list = list.filter(o => o.logistics_status === "shipped");
    }

    // 4. Filtres avancés combinables
    if (statusFilter) {
      list = list.filter(o => (o.logistics_status ?? "") === statusFilter);
    }
    if (typeFilter) {
      list = list.filter(o => typeFilter === "import" ? isImport(o) : !isImport(o));
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
      if (!isNaN(days)) {
        list = list.filter(o => getOrderAge(o) >= days);
      }
    }
    // 5b. Filtre par période (date de création)
    if (dateRange?.from) {
      const fromTime = dateRange.from.getTime();
      list = list.filter(o => new Date(o.order_created_at ?? 0).getTime() >= fromTime);
    }
    if (dateRange?.to) {
      const toTime = dateRange.to.getTime() + 24 * 60 * 60 * 1000; // inclusif
      list = list.filter(o => new Date(o.order_created_at ?? 0).getTime() <= toTime);
    }

    // 5. Tri
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
  }, [orders, searchTerm, activeTab, kpiFilter, getOrderFinancials, statusFilter, typeFilter, balanceFilter, minDays, sortField, sortDir, getOrderAge]);

  // ─── Compteurs de résultats ───
  const resultCount = displayOrders.length;
  const activeFilterCount = [statusFilter, typeFilter, balanceFilter, minDays, (dateRange?.from ? "date" : "")].filter(Boolean).length;

  // ─── Handlers ───
  const handleStatus = (orderId: string, status: string, _admin: string) => {
    updateStatus(orderId, status, _admin || adminName);
    setHasChanges(false); // BUG 2 FIX : remettre le flag à false après action réussie
  };
  const handlePayment = (orderId: string, amount: number, method: string, reference: string, _admin: string) => {
    addPayment(orderId, amount, method, reference, _admin || adminName);
    setHasChanges(false); // BUG 2 FIX : remettre le flag à false après paiement enregistré
  };
  const handleWeigh = (record: Parameters<typeof addWeighing>[0]) => { addWeighing(record); setHasChanges(false); };

  const doCancel = useCallback((reason: string, refundType: string) => {
    if (!selectedOrder) return;
    cancelOrder(selectedOrder.order_id ?? "", reason, refundType as any, adminName);
    setShowCancel(false);
    setSelectedOrder(null);
  }, [selectedOrder, cancelOrder, adminName]);

  const handleCloseDrawer = useCallback(() => { if (hasChanges) setShowCloseConfirm(true); else setSelectedOrder(null); }, [hasChanges]);
  const confirmClose = useCallback(() => { setShowCloseConfirm(false); setHasChanges(false); setSelectedOrder(null); }, []);

  if (isLoading) return <div className="flex items-center justify-center h-screen text-gray-500">Chargement des commandes...</div>;

  const ws = kpiFilter ? WORKSTATIONS[kpiFilter] : null;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-sm font-bold">{ws ? ws.title : "Kawzone Cockpit"}</h1>
          <span className="text-[10px] text-gray-500">{orders.length} commandes</span>
        </div>
        {!ws && (
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
            <Input placeholder="Rechercher (nom, telephone, KZ-xxx)..." className="pl-8 h-9 text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        )}
      </div>

      {/* KPI (seulement hors poste de travail) */}
      {!ws && activeTab === "actions" && (
        <div className="px-4 pt-2 pb-1">
          <KpiCards {...kpi} activeFilter={kpiFilter} onFilter={setKpiFilter} />
          {kpiFilter && <button onClick={() => setKpiFilter(null)} className="mt-1 text-[10px] text-orange-600 flex items-center gap-1"><X className="h-3 w-3" />Effacer le filtre</button>}
        </div>
      )}

      {/* Barre outils : Filtres + Tri + Vue + Export */}
      {!ws && (
        <div className="px-4 pt-2 pb-1 space-y-2">
          {/* Ligne 1: Toggle vue + Tri + Filtres + Export */}
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-0.5 shrink-0">
              <button onClick={() => setViewMode("list")} className={`text-[10px] px-3 py-1.5 rounded-md ${viewMode === "list" ? "bg-white shadow-sm font-semibold" : "text-gray-500"}`}>Liste</button>
              <button onClick={() => setViewMode("pipeline")} className={`text-[10px] px-3 py-1.5 rounded-md ${viewMode === "pipeline" ? "bg-white shadow-sm font-semibold" : "text-gray-500"}`}>Pipeline</button>
            </div>

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

            {/* Bouton filtres */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-lg font-medium ${showFilters || activeFilterCount > 0 ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"}`}
            >
              <Filter className="h-3 w-3" />
              Filtres{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>

            {/* Export CSV */}
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
              className="flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 ml-auto"
            >
              <Download className="h-3 w-3" />CSV
            </button>
          </div>

          {/* Ligne 2: Panneau filtres avancés */}
          {showFilters && (
            <div className="bg-white border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">Filtres avancés</span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => { setStatusFilter(""); setTypeFilter(""); setBalanceFilter(""); setMinDays(""); setDateRange(undefined); }}
                    className="text-[10px] text-red-500 hover:text-red-700"
                  >
                    Tout effacer
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* Statut */}
                <div>
                  <label className="text-[10px] text-gray-500 block mb-0.5">Statut</label>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full text-[11px] border rounded h-8 px-2">
                    <option value="">Tous</option>
                    {ALL_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                {/* Type */}
                <div>
                  <label className="text-[10px] text-gray-500 block mb-0.5">Type</label>
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-full text-[11px] border rounded h-8 px-2">
                    <option value="">Tous</option>
                    <option value="local">Local</option>
                    <option value="import">Import</option>
                  </select>
                </div>
                {/* Solde */}
                <div>
                  <label className="text-[10px] text-gray-500 block mb-0.5">Solde</label>
                  <select value={balanceFilter} onChange={e => setBalanceFilter(e.target.value)} className="w-full text-[11px] border rounded h-8 px-2">
                    <option value="">Tous</option>
                    <option value="unpaid">Non paye</option>
                    <option value="partial">Partiel</option>
                    <option value="paid">Paye total</option>
                  </select>
                </div>
                {/* Ancienneté */}
                <div>
                  <label className="text-[10px] text-gray-500 block mb-0.5">Anciennete min (jours)</label>
                  <input type="number" placeholder="Ex: 7" value={minDays} onChange={e => setMinDays(e.target.value)} className="w-full text-[11px] border rounded h-8 px-2" />
                </div>
                {/* Période */}
                <div className="col-span-2">
                  <DateRangeFilter dateRange={dateRange} onChange={setDateRange} />
                </div>
              </div>
            </div>
          )}

          {/* Compteur résultats */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400">{resultCount} commande{resultCount > 1 ? "s" : ""} affichee{resultCount > 1 ? "s" : ""}</span>
            {resultCount !== orders.length && <span className="text-[10px] text-orange-500">sur {orders.length} total</span>}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-16">
        {kpiFilter ? (() => {
          const f = kpiFilter;
          const ws = WORKSTATIONS[f];
          const isPaymentStation = f === "payment_pending";
          const isWeighStation = f === "to_weigh";
          const isSimpleStation = !!ws && !isPaymentStation && !isWeighStation;
          return (
            <div>
              <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{ws?.title ?? f}</h2>
                  <p className="text-xs text-gray-500">{displayOrders.length} commande{displayOrders.length > 1 ? "s" : ""}</p>
                </div>
                <button onClick={() => setKpiFilter(null)} className="text-xs text-orange-600 font-medium px-3 py-1.5 rounded-lg hover:bg-orange-50 flex items-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" />Retour
                </button>
              </div>
              {displayOrders.length === 0 ? (
                <div className="text-center py-12 text-gray-500"><p className="font-medium">Aucune commande</p><p className="text-sm">Tout est a jour !</p></div>
              ) : displayOrders.map(o => {
                const oid = o.order_id ?? "";
                const { productTotal, freight, grandTotal, paid, remaining } = getOrderFinancials(o);
                const payments = getPayments(oid);

                // ═══════════════════════════════════════════
                // POSTE PAIEMENTS — Formulaire inline complet
                // ═══════════════════════════════════════════
                if (isPaymentStation) {
                  const pf = payForms[oid] ?? { amount: "", method: "wave", reference: "" };
                  return (
                    <div key={oid} className="px-4 py-3 border-b border-gray-100 bg-white">
                      {/* Infos commande */}
                      <div onClick={() => setSelectedOrder(o)} className="cursor-pointer">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[11px] font-bold">{getOrderNumber(oid)}</span>
                          <span className="text-xs font-medium">{o.customer_name}</span>
                        </div>
                        {/* Décomposition complète des montants */}
                        <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
                          <div className="bg-gray-50 rounded p-1.5">
                            <div className="text-gray-400">Produit</div>
                            <div className="font-semibold">{fmtF(productTotal)}</div>
                          </div>
                          <div className="bg-orange-50 rounded p-1.5">
                            <div className="text-orange-400">Fret</div>
                            <div className="font-semibold text-orange-700">{fmtF(freight)}</div>
                          </div>
                          <div className="bg-emerald-50 rounded p-1.5">
                            <div className="text-emerald-400">Total</div>
                            <div className="font-semibold text-emerald-700">{fmtF(grandTotal)}</div>
                          </div>
                        </div>
                        <div className="flex gap-4 text-[10px] mb-2">
                          <span>Paye: <b className="text-emerald-600">{fmtF(paid)}</b></span>
                          <span>Reste: <b className={remaining > 0 ? "text-red-600" : "text-emerald-600"}>{fmtF(remaining)}</b></span>
                          <span>{payments.length} paiement{payments.length > 1 ? "s" : ""}</span>
                        </div>
                      </div>

                      {/* Historique des paiements (modifiable) */}
                      {payments.length > 0 && (
                        <div className="mb-2 space-y-1">
                          {payments.map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1 text-[10px]">
                              {editingPay === p.id ? (
                                <div className="flex gap-1 flex-1 items-center">
                                  <input type="number" className="w-16 h-6 text-[10px] border rounded px-1" value={editPayForm.amount} onChange={e => setEditPayForm(prev => ({ ...prev, amount: e.target.value }))} />
                                  <select className="h-6 text-[10px] border rounded" value={editPayForm.method} onChange={e => setEditPayForm(prev => ({ ...prev, method: e.target.value }))}>
                                    <option value="wave">Wave</option>
                                    <option value="orange_money">OM</option>
                                    <option value="cash">Cash</option>
                                    <option value="bank_transfer">Virement</option>
                                  </select>
                                  <input type="text" className="w-14 h-6 text-[10px] border rounded px-1" value={editPayForm.reference} onChange={e => setEditPayForm(prev => ({ ...prev, reference: e.target.value }))} />
                                  <button className="h-6 px-2 bg-emerald-600 text-white text-[10px] rounded" onClick={() => { editPayment(p.id, { amount: parseFloat(editPayForm.amount) || p.amount, method: editPayForm.method, reference: editPayForm.reference }); setEditingPay(null); }}>OK</button>
                                  <button className="h-6 px-2 bg-gray-400 text-white text-[10px] rounded" onClick={() => setEditingPay(null)}>X</button>
                                </div>
                              ) : (
                                <>
                                  <span>{fmtF(p.amount)} — {p.method} — {p.reference}</span>
                                  <div className="flex gap-1">
                                    <button onClick={() => { setEditingPay(p.id); setEditPayForm({ amount: String(p.amount), method: p.method, reference: p.reference }); }} className="p-0.5 text-gray-400 hover:text-blue-600"><Pencil className="h-3 w-3" /></button>
                                    <button onClick={() => { if (confirm("Supprimer ce paiement ?")) deletePayment(p.id); }} className="p-0.5 text-gray-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Formulaire d'ajout de paiement */}
                      {remaining > 0 ? (
                        <div className="flex gap-2 mt-1">
                          <input type="number" placeholder="Montant" className="w-20 h-8 text-xs border rounded px-2" value={pf.amount} onChange={e => setPayForms(prev => ({ ...prev, [oid]: { ...pf, amount: e.target.value } }))} />
                          <select className="h-8 text-xs border rounded px-1" value={pf.method} onChange={e => setPayForms(prev => ({ ...prev, [oid]: { ...pf, method: e.target.value } }))}>
                            <option value="wave">Wave</option>
                            <option value="orange_money">OM</option>
                            <option value="cash">Cash</option>
                            <option value="bank_transfer">Virement</option>
                          </select>
                          <input type="text" placeholder="Ref" className="w-16 h-8 text-xs border rounded px-2" value={pf.reference} onChange={e => setPayForms(prev => ({ ...prev, [oid]: { ...pf, reference: e.target.value } }))} />
                          <button
                            className="h-8 px-3 bg-emerald-600 text-white text-xs rounded font-medium"
                            onClick={() => {
                              const amt = parseFloat(pf.amount);
                              if (amt > 0) {
                                const actualAmt = amt > remaining ? remaining : amt;
                                handlePayment(oid, actualAmt, pf.method, pf.reference, adminName);
                                setPayForms(prev => ({ ...prev, [oid]: { amount: "", method: "wave", reference: "" } }));
                                // Auto-avancement si solde atteint
                                if (actualAmt >= remaining) {
                                  const nextSt = isImport(o) ? "ready_delivery" : "ready";
                                  handleStatus(oid, nextSt, adminName);
                                }
                              }
                            }}
                          >
                            Encaisser
                          </button>
                        </div>
                      ) : (
                        <div className="text-[10px] text-emerald-600 font-medium bg-emerald-50 rounded px-2 py-1">Paye en totalite — {fmtF(paid)} / {fmtF(grandTotal)}</div>
                      )}
                    </div>
                  );
                }

                // ═══════════════════════════════════════════
                // POSTE À PESER — Formulaire inline
                // ═══════════════════════════════════════════
                if (isWeighStation) {
                  const wf = weighForms[oid] ?? { realWeight: "", length: "", width: "", height: "" };
                  const rw = parseFloat(wf.realWeight) || 0;
                  const l = parseFloat(wf.length) || 0;
                  const w = parseFloat(wf.width) || 0;
                  const h = parseFloat(wf.height) || 0;
                  const volWeight = (l * w * h) / 5000;
                  const chargeable = Math.max(rw, volWeight);
                  const freight = Math.round(chargeable * 7500);
                  return (
                    <div key={oid} className="px-4 py-3 border-b border-gray-100 bg-white">
                      <div onClick={() => setSelectedOrder(o)} className="cursor-pointer mb-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[11px] font-bold">{getOrderNumber(oid)}</span>
                          <span className="text-xs">{o.customer_name}</span>
                        </div>
                        <div className="text-[10px] text-gray-500">Produit: {fmtF(productTotal)}</div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        <input type="number" placeholder="Poids (kg)" className="h-8 text-xs border rounded px-2" value={wf.realWeight} onChange={e => setWeighForms(prev => ({ ...prev, [oid]: { ...wf, realWeight: e.target.value } }))} />
                        <input type="number" placeholder="L (cm)" className="h-8 text-xs border rounded px-2" value={wf.length} onChange={e => setWeighForms(prev => ({ ...prev, [oid]: { ...wf, length: e.target.value } }))} />
                        <input type="number" placeholder="l (cm)" className="h-8 text-xs border rounded px-2" value={wf.width} onChange={e => setWeighForms(prev => ({ ...prev, [oid]: { ...wf, width: e.target.value } }))} />
                        <input type="number" placeholder="H (cm)" className="h-8 text-xs border rounded px-2" value={wf.height} onChange={e => setWeighForms(prev => ({ ...prev, [oid]: { ...wf, height: e.target.value } }))} />
                      </div>
                      {rw > 0 && (
                        <div className="text-[10px] text-gray-500 mb-2 space-y-0.5">
                          <div>Vol: {volWeight.toFixed(2)}kg | Facture: {chargeable.toFixed(2)}kg</div>
                          <div className="font-bold text-orange-700">Fret: {fmtF(freight)}</div>
                          <div className="font-semibold">Total client: {fmtF(productTotal + freight)}</div>
                        </div>
                      )}
                      <button
                        className="h-8 px-4 bg-orange-600 text-white text-xs rounded font-medium w-full disabled:opacity-50"
                        disabled={!rw}
                        onClick={() => {
                          if (rw) {
                            // 1. Enregistrer la pesée
                            handleWeigh({
                              orderId: oid, realWeightKg: rw, lengthCm: l, widthCm: w, heightCm: h,
                              volumetricWeightKg: volWeight, chargeableWeightKg: chargeable,
                              freightRatePerKg: 7500, estimatedFreight: freight, finalFreight: freight,
                              weighedBy: adminName,
                            });
                            // 2. Reset formulaire
                            setWeighForms(prev => ({ ...prev, [oid]: { realWeight: "", length: "", width: "", height: "" } }));
                            // 3. Auto-avancer vers "fees_calculated" (fret calculé, attente paiement)
                            handleStatus(oid, "fees_calculated", adminName);
                          }
                        }}
                      >
                        Enregistrer la pesee → Calcul frais
                      </button>
                    </div>
                  );
                }

                // ═══════════════════════════════════════════
                // POSTE SIMPLE (Confirmer, Expédier, Marquer livrée)
                // ═══════════════════════════════════════════
                if (isSimpleStation && ws) {
                  return (
                    <div key={oid} className="px-4 py-3 border-b border-gray-100 bg-white">
                      <OrderCard
                        order={o}
                        index={0}
                        onClick={() => setSelectedOrder(o)}
                        totalPaid={paid}
                        freight={freight}
                        grandTotal={grandTotal}
                        quickAction={{
                          label: ws.actionLabel,
                          color: ws.actionColor,
                          onClick: (e) => {
                            e.stopPropagation();
                            handleStatus(oid, ws.nextStatus, adminName);
                          },
                        }}
                      />
                    </div>
                  );
                }

                // Fallback: afficher la carte sans action
                return (
                  <OrderCard
                    key={oid}
                    order={o}
                    index={0}
                    onClick={() => setSelectedOrder(o)}
                    totalPaid={paid}
                    freight={freight}
                    grandTotal={grandTotal}
                  />
                );
              })}
            </div>
          );
        })() : activeTab === "actions" && viewMode === "pipeline" ? (
          <PipelineView orders={displayOrders} totalPaidMap={totalPaidMap} freightMap={freightMap} onSelect={setSelectedOrder} />
        ) : activeTab === "archive" ? (
          <ArchiveView orders={displayOrders} archiveFilter={archiveFilter} onSelect={setSelectedOrder} cancellations={cancellations} />
        ) : (
          <div className="divide-y divide-gray-100">
            {displayOrders.length === 0 ? <div className="text-center py-12 text-gray-500">Aucune commande</div> : displayOrders.map((o, i) => {
              const a = getOrderFinancials(o);
              return <OrderCard key={o.order_id} order={o} index={i} onClick={() => setSelectedOrder(o)} totalPaid={a.paid} freight={a.freight} grandTotal={a.grandTotal} />;
            })}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      {!ws && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-50">
          <div className="flex justify-around items-center h-14">
            {[{ k: "actions" as const, l: "Actions", i: ClipboardList }, { k: "local" as const, l: "Local", i: Home }, { k: "import" as const, l: "Import", i: Package }, { k: "archive" as const, l: "Archive", i: Archive }].map(t => (
              <button key={t.k} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${activeTab === t.k ? "text-orange-600" : "text-gray-500"}`} onClick={() => { setActiveTab(t.k); setKpiFilter(null); }}>
                <t.i className="h-5 w-5" /><span className="text-[10px] font-medium">{t.l}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Drawer avec dialogs internes (dans SheetContent pour eviter inert Radix) */}
      {selectedOrder && (
        <OrderDrawer
          order={selectedOrder} orderIndex={selectedIndex} payments={selPayments} audit={selAudit} weighings={selWeighings} financials={selFinancials}
          onClose={handleCloseDrawer} onPayment={handlePayment} onEditPayment={editPayment} onDeletePayment={deletePayment}
          onWeigh={handleWeigh} onStatusChange={handleStatus} onRequestCancel={() => setShowCancel(true)} onFormInteraction={() => setHasChanges(true)}
          dialogs={
            <>
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
// Archive View
// ════════════════════════════════════════════

function ArchiveView({ orders, archiveFilter, onSelect, cancellations }: {
  orders: LogisticsOrderRow[]; archiveFilter: ArchiveFilter;
  onSelect: (o: LogisticsOrderRow) => void; cancellations: any[];
}) {
  const [filter, setFilter] = useState<ArchiveFilter>(archiveFilter);
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
