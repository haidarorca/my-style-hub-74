// ═══════════════════════════════════════════════════════════════
// DASHBOARD — Centre de pilotage Kawzone
// Vue Pipeline par defaut + Postes de travail quand KPI clique
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from "react";
import { Search, ClipboardList, Home, Package, Archive, X, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRealOrders } from "@/cockpit/hooks/useRealOrders";
import { useAuth } from "@/hooks/use-auth";
import { KpiCards } from "@/cockpit/components/KpiCards";
import { OrderCard } from "@/cockpit/components/OrderCard";
import { OrderDrawer } from "@/cockpit/components/OrderDrawer";
import { CancelDialog } from "@/cockpit/components/CancelDialog";
import { CloseConfirmDialog } from "@/cockpit/components/CloseConfirmDialog";
import { PipelineView } from "@/cockpit/components/PipelineView";
import { fmtF, isImport, statusToKpiFilter } from "@/cockpit/lib/workflow";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { KpiFilter, ArchiveFilter } from "@/cockpit/types";

// Config postes de travail avec actions directes
const WORKSTATIONS: Record<string, { title: string; actionLabel: string; actionColor: string; nextStatus: string }> = {
  new: { title: "POSTE — À confirmer", actionLabel: "Confirmer", actionColor: "bg-emerald-600 hover:bg-emerald-700 text-white", nextStatus: "confirmed" },
  payment_pending: { title: "POSTE — Paiements", actionLabel: "Marquer payée", actionColor: "bg-emerald-600 hover:bg-emerald-700 text-white", nextStatus: "ready" },
  to_weigh: { title: "POSTE — À peser", actionLabel: "Pesée enregistrée", actionColor: "bg-orange-600 hover:bg-orange-700 text-white", nextStatus: "payment_fees" },
  ready: { title: "POSTE — Prêt à expédier", actionLabel: "Expédier", actionColor: "bg-indigo-600 hover:bg-indigo-700 text-white", nextStatus: "shipped" },
  shipped: { title: "POSTE — En livraison", actionLabel: "Marquer livrée", actionColor: "bg-emerald-600 hover:bg-emerald-700 text-white", nextStatus: "delivered" },
};

export default function CockpitDashboard() {
  const { profile } = useAuth();
  const adminName = profile?.full_name ?? profile?.email ?? "Admin";
  const { orders, isLoading, searchTerm, setSearchTerm, getPayments, getTotalPaid, getAudit, addPayment, editPayment, deletePayment, getWeighings, addWeighing, updateStatus, cancelOrder, getCancellation, cancellations } = useRealOrders();

  const [selectedOrder, setSelectedOrder] = useState<LogisticsOrderRow | null>(null);
  const [activeTab, setActiveTab] = useState<"actions" | "local" | "import" | "archive">("actions");
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>(null);
  const [viewMode, setViewMode] = useState<"list" | "pipeline">("pipeline");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("all");

  // Dialogs
  const [showCancel, setShowCancel] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // États locaux pour formulaires inline des postes de travail
  const [payForms, setPayForms] = useState<Record<string, { amount: string; method: string; reference: string }>>({});
  const [weighForms, setWeighForms] = useState<Record<string, { realWeight: string; length: string; width: string; height: string }>>({});

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
      const st = o.logistics_status ?? "";
      if (st === "delivered" || st === "cancelled") continue;
      const f = statusToKpiFilter(st);
      if (f && f !== "debt") s[f as keyof typeof s]++;
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
        let filtered = list.filter(o => o.logistics_status !== "delivered" && o.logistics_status !== "cancelled");
        if (kpiFilter === "debt") filtered = filtered.filter(o => (o.order_total ?? 0) + (o.total_shipping_fees ?? 0) - (totalPaidMap[o.order_id ?? ""] ?? 0) > 0);
        else if (kpiFilter === "payment_pending") {
          filtered = filtered.filter(o => {
            const grandTotal = (o.order_total ?? 0) + (o.total_shipping_fees ?? 0);
            const paid = totalPaidMap[o.order_id ?? ""] ?? 0;
            return paid > 0 || grandTotal - paid > 0;
          });
        }
        else if (kpiFilter) filtered = filtered.filter(o => statusToKpiFilter(o.logistics_status ?? "") === kpiFilter);
        return filtered;
      }
    }
  }, [orders, searchTerm, activeTab, kpiFilter, totalPaidMap]);

  // Handlers
  const handleStatus = (orderId: string, status: string, _admin: string) => updateStatus(orderId, status, _admin || adminName);
  const handlePayment = (orderId: string, amount: number, method: string, reference: string, _admin: string) => addPayment(orderId, amount, method, reference, _admin || adminName);
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

  // Mode poste de travail (KPI cliqué avec action directe)
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

      {/* Toggle Liste/Pipeline (seulement hors poste + Actions) */}
      {!ws && activeTab === "actions" && (
        <div className="px-4 pt-1 pb-1 flex items-center justify-between">
          <span className="text-[10px] text-gray-400">{displayOrders.length} commande{displayOrders.length > 1 ? "s" : ""}</span>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode("list")} className={`text-[10px] px-3 py-1 rounded-md ${viewMode === "list" ? "bg-white shadow-sm font-semibold" : "text-gray-500"}`}>Liste</button>
            <button onClick={() => setViewMode("pipeline")} className={`text-[10px] px-3 py-1 rounded-md ${viewMode === "pipeline" ? "bg-white shadow-sm font-semibold" : "text-gray-500"}`}>Pipeline</button>
          </div>
        </div>
      )}



      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-16">
        {/* POSTE DE TRAVAIL avec formulaire inline */}
        {kpiFilter ? (() => {
          const f = kpiFilter;
          const ws = WORKSTATIONS[f];
          const isPaymentStation = f === "payment_pending";
          const isWeighStation = f === "to_weigh";
          const isSimpleStation = !!ws;
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
                const paid = totalPaidMap[oid] ?? 0;
                const grandTotal = (o.order_total ?? 0) + (o.total_shipping_fees ?? 0);
                const remaining = Math.max(0, grandTotal - paid);

                // Poste PAIEMENTS — formulaire inline
                if (isPaymentStation) {
                  const pf = payForms[oid] ?? { amount: "", method: "wave", reference: "" };
                  return (
                    <div key={oid} className="px-4 py-3 border-b border-gray-100 bg-white">
                      <div onClick={() => setSelectedOrder(o)} className="cursor-pointer">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[11px] font-bold">{getOrderNumber(oid)}</span>
                          <span className="text-xs font-medium">{o.customer_name}</span>
                        </div>
                        <div className="flex gap-3 text-[10px] text-gray-500 mb-2">
                          <span>Total: <b>{fmtF(grandTotal)}</b></span>
                          <span>Paye: <b className="text-emerald-600">{fmtF(paid)}</b></span>
                          <span>Reste: <b className="text-red-600">{fmtF(remaining)}</b></span>
                        </div>
                      </div>
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
                          <button className="h-8 px-3 bg-emerald-600 text-white text-xs rounded font-medium" onClick={() => { const amt = parseFloat(pf.amount); if (amt > 0) { const actualAmt = amt > remaining ? remaining : amt; handlePayment(oid, actualAmt, pf.method, pf.reference, adminName); setPayForms(prev => ({ ...prev, [oid]: { amount: "", method: "wave", reference: "" } })); if (actualAmt >= remaining) handleStatus(oid, "ready", adminName); } }}>
                            Encaisser
                          </button>
                        </div>
                      ) : <div className="text-[10px] text-emerald-600 font-medium">Paye en totalite</div>}
                    </div>
                  );
                }

                // Poste A PESER — formulaire inline
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
                        </div>
                      )}
                      <button className="h-8 px-4 bg-orange-600 text-white text-xs rounded font-medium w-full" disabled={!rw} onClick={() => { if (rw) { handleWeigh({ orderId: oid, realWeightKg: rw, lengthCm: l, widthCm: w, heightCm: h, volumetricWeightKg: volWeight, chargeableWeightKg: chargeable, freightRatePerKg: 7500, estimatedFreight: freight, finalFreight: freight, weighedBy: adminName }); setWeighForms(prev => ({ ...prev, [oid]: { realWeight: "", length: "", width: "", height: "" } })); handleStatus(oid, "payment_fees", adminName); } }}>
                        Enregistrer la pesee
                      </button>
                    </div>
                  );
                }

                // Poste simple (Confirmer, Expedier, Marquer livree)
                return (
                  <OrderCard
                    key={oid}
                    order={o}
                    index={0}
                    onClick={() => setSelectedOrder(o)}
                    totalPaid={paid}
                    quickAction={ws ? { label: ws.actionLabel, color: ws.actionColor, onClick: (e) => { e.stopPropagation(); handleStatus(oid, ws.nextStatus, adminName); } } : undefined}
                  />
                );
              })}
            </div>
          );
        })() : activeTab === "actions" && viewMode === "pipeline" ? (
          <PipelineView orders={displayOrders} totalPaidMap={totalPaidMap} onSelect={setSelectedOrder} />
        ) : activeTab === "archive" ? (
          <ArchiveView orders={displayOrders} archiveFilter={archiveFilter} totalPaidMap={totalPaidMap} onSelect={setSelectedOrder} cancellations={cancellations} />
        ) : (
          <div className="divide-y divide-gray-100">
            {displayOrders.length === 0 ? <div className="text-center py-12 text-gray-500">Aucune commande</div> : displayOrders.map((o, i) => <OrderCard key={o.order_id} order={o} index={i} onClick={() => setSelectedOrder(o)} totalPaid={totalPaidMap[o.order_id ?? ""]} />)}
          </div>
        )}
      </div>

      {/* Bottom nav (seulement hors poste de travail) */}
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

      {/* Drawer */}
      {selectedOrder && (
        <OrderDrawer order={selectedOrder} orderIndex={selectedIndex} payments={selPayments} audit={selAudit} weighings={selWeighings}
          onClose={handleCloseDrawer} onPayment={handlePayment} onEditPayment={editPayment} onDeletePayment={deletePayment}
          onWeigh={handleWeigh} onStatusChange={handleStatus} onRequestCancel={() => setShowCancel(true)} onFormInteraction={() => setHasChanges(true)} />
      )}

      {/* Cancel Dialog */}
      {selectedOrder && <CancelDialog open={showCancel} onClose={() => setShowCancel(false)} onConfirm={doCancel} paidAmount={selTotalPaid} status={selectedOrder.logistics_status ?? "new"} kzNumber={getOrderNumber(selectedOrder.order_id ?? "")} />}

      {/* Close Confirm Dialog */}
      <CloseConfirmDialog open={showCloseConfirm} onStay={() => setShowCloseConfirm(false)} onLeave={confirmClose} />
    </div>
  );
}

// ════════════════════════════════════════════
// Archive View
// ════════════════════════════════════════════

function ArchiveView({ orders, archiveFilter, totalPaidMap, onSelect, cancellations }: {
  orders: LogisticsOrderRow[]; archiveFilter: ArchiveFilter; totalPaidMap: Record<string, number>;
  onSelect: (o: LogisticsOrderRow) => void; cancellations: any[];
}) {
  const filtered = orders.filter(o => archiveFilter === "all" || o.logistics_status === archiveFilter);
  return (
    <div>
      <div className="px-4 pt-2 pb-1 flex gap-2">
        {(["all", "delivered", "cancelled"] as ArchiveFilter[]).map(f => (
          <button key={f} onClick={() => {}} className={`text-[10px] px-3 py-1.5 rounded-full border ${archiveFilter === f ? "bg-orange-100 border-orange-300 text-orange-800 font-semibold" : "bg-white border-gray-200 text-gray-600"}`}>
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
