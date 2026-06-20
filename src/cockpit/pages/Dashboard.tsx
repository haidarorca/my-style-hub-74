// ═══════════════════════════════════════════════════════════════
// DASHBOARD — Cockpit Kawzone (architecture sous-commandes boutiques)
// Une seule vue : pipeline par sous-commande boutique.
// Le concept MIXTE et les KPI globaux ont été retirés.
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { Search, ClipboardList, Archive, ArrowUpDown, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRealOrders } from "@/cockpit/hooks/useRealOrders";
import { useAuth } from "@/hooks/use-auth";
import { CockpitOrderDrawerHost } from "@/cockpit/components/CockpitOrderDrawerHost";
import { PipelineView } from "@/cockpit/components/PipelineView";
import { CockpitFilterPanel } from "@/cockpit/components/CockpitFilterPanel";
import { useSubOrderRows } from "@/cockpit/hooks/useSubOrderRows";
import { useSubOrderHistories } from "@/cockpit/hooks/useSubOrderHistories";
import { useVendorProfiles } from "@/cockpit/hooks/useVendorProfiles";
import { useCockpitFilters } from "@/cockpit/hooks/useCockpitFilters";
import { fmtF } from "@/cockpit/lib/workflow";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { ArchiveFilter } from "@/cockpit/types";



type SortField = "date" | "amount" | "name" | "status";
type SortDir = "asc" | "desc";


export default function CockpitDashboard() {
  const { profile } = useAuth();
  const adminName = profile?.full_name ?? profile?.email ?? "Admin";
  const realOrders = useRealOrders();
  const {
    orders, isLoading, setSearchTerm,
    cancellations,
    freightMap, getOrderFinancials, orderTypeMap,
    getSubOrderStatus,
  } = realOrders;


  const [selectedOrder, setSelectedOrder] = useState<LogisticsOrderRow | null>(null);
  const [selectedSubKey, setSelectedSubKey] = useState<string | undefined>(undefined);

  // Le Cockpit n'expose QUE les sous-commandes Admin + Commission. Les boutiques
  // autonomes sont exclues à la source dans `useSubOrderRows` (rows = managed).
  // Chaque row reçoit `effective_status` (sub_order_states ?? mother).
  const { rows: subOrderRows } = useSubOrderRows(orders, getSubOrderStatus);

  // ─── Phase B : historique métier (événements / décisions / mouvements) ───
  // Utilisé par PipelineView pour les badges. Le drawer recalcule son propre
  // historique scopé à un id unique.
  const visibleOrderIds = useMemo(
    () => [...new Set(subOrderRows.map(r => r.mother_order_id))],
    [subOrderRows],
  );
  const { data: historyMap } = useSubOrderHistories(visibleOrderIds);


  // ─── Profils vendeurs (nom boutique, pays vendeur, marchés autorisés) ───
  const visibleVendorIds = useMemo(
    () => [...new Set(subOrderRows.map(r => r.vendor_id))],
    [subOrderRows],
  );
  const { data: vendorProfiles } = useVendorProfiles(visibleVendorIds);


  const openOrder = useCallback((o: LogisticsOrderRow) => {
    setSelectedSubKey(undefined);
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


  // ─── Moteur de filtres métier multi-dimensions ───
  const {
    filters,
    filteredRows: filteredSubRows,
    options: filterOptions,
    count: activeFilterCount,
    update: updateFilter,
    toggleArray: toggleArrayFilter,
    reset: resetFilters,
  } = useCockpitFilters({ rows: subOrderRows, vendorProfiles, historyMap });

  // Synchronise la recherche du moteur de filtres avec la barre globale.
  useEffect(() => { setSearchTerm(filters.search); }, [filters.search, setSearchTerm]);

  // Tri
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");


  // Articles / handlers / dialogs : centralisés dans CockpitOrderDrawerHost.



  const totalPaidMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) m[o.order_id ?? ""] = getOrderFinancials(o).paid;
    return m;
  }, [orders, getOrderFinancials]);




  // ─── Tri + résolution sous-commandes → commandes mères ───
  // Le moteur de filtres travaille sur les sous-commandes (granularité métier
  // du Cockpit). Le pipeline a besoin de la liste des commandes mères
  // correspondantes pour ses colonnes — on les dérive ici.
  const tabbedSubRows = useMemo(() => {
    const isDone = (r: typeof filteredSubRows[number]) => {
      const s = (r.effective_status ?? r.order.logistics_status ?? "").trim();
      return s === "delivered" || s === "cancelled";
    };
    if (activeTab === "archive") return filteredSubRows.filter(isDone);
    return filteredSubRows.filter(r => !isDone(r));
  }, [filteredSubRows, activeTab]);

  const displayOrders = useMemo(() => {
    const seen = new Set<string>();
    const list: LogisticsOrderRow[] = [];
    for (const r of tabbedSubRows) {
      const oid = r.mother_order_id;
      if (seen.has(oid)) continue;
      seen.add(oid);
      list.push(r.order);
    }
    return [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortField) {
        case "date": return dir * (new Date(b.order_created_at ?? 0).getTime() - new Date(a.order_created_at ?? 0).getTime());
        case "amount": return dir * ((b.order_total ?? 0) - (a.order_total ?? 0));
        case "name": return dir * ((a.customer_name ?? "").localeCompare(b.customer_name ?? ""));
        case "status": return dir * ((a.logistics_status ?? "").localeCompare(b.logistics_status ?? ""));
        default: return 0;
      }
    });
  }, [tabbedSubRows, sortField, sortDir]);

  const resultCount = tabbedSubRows.length;


  // Tous les handlers (status, paiement, pesée, cancel, fermeture, articles)
  // sont désormais gérés par CockpitOrderDrawerHost.



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
          <Input
            placeholder="Boutique, vendeur, téléphone, KZ-xxx, sous-cmd…"
            className="pl-8 h-9 text-sm"
            value={filters.search}
            onChange={e => updateFilter("search", e.target.value)}
          />
        </div>
      </div>

      {/* Barre outils */}
      <div className="px-4 pt-2 pb-1 space-y-2 relative">
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

          {/* Moteur de filtres métier multi-dimensions */}
          <CockpitFilterPanel
            filters={filters}
            count={activeFilterCount}
            total={subOrderRows.length}
            filteredCount={filteredSubRows.length}
            options={filterOptions}
            onUpdate={updateFilter}
            onToggleArray={toggleArrayFilter}
            onReset={resetFilters}
          />

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
            className="ml-auto flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            <Download className="h-3 w-3" />CSV
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400">
            {resultCount} sous-commande{resultCount > 1 ? "s" : ""} affichée{resultCount > 1 ? "s" : ""}
          </span>
          {resultCount !== subOrderRows.length && (
            <span className="text-[10px] text-orange-500">sur {subOrderRows.length} total</span>
          )}
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
            subRows={tabbedSubRows}
            historyMap={historyMap}

            onSelectSubRow={(row) => {
              setSelectedSubKey(row.sub_order_key);
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
      <CockpitOrderDrawerHost
        realOrders={realOrders}
        selectedOrder={selectedOrder}
        selectedSubKey={selectedSubKey}
        onSubOrderChange={(k) => setSelectedSubKey(k)}
        onClose={() => setSelectedOrder(null)}
        adminName={adminName}
      />

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
