// ═══════════════════════════════════════════════════════════════
// useRealOrders — State management complet du Cockpit
// Supabase = source de vérité unique pour le fret.
// Le localStorage ne sert plus qu'aux paiements/audit locaux.
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listLogisticsOrders } from "@/lib/admin-logistics.functions";
import { updateShipmentAssessment } from "@/lib/shipment-assessments.functions";
import { createOrderPayment, listAllOrderPayments, getOrderTypesBatch } from "@/lib/cockpit-payments.functions";
import { preloadOrderNumbers } from "@/cockpit/lib/orderNumbers";
import type { PaymentRecord, AuditEntry, CancellationRecord, WeighingRecord, PaymentMethod, RefundType } from "@/cockpit/types";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

const LS_PAYMENTS = "kz_payments_v2";
const LS_AUDIT = "kz_audit_v2";
const LS_CANCEL = "kz_cancel_v2";
const LS_WEIGHT = "kz_weight_v2";
const LS_STATUS = "kz_status_v2";
const LS_FREIGHT_LEGACY = "kz_freight_v2"; // ⚠️ déprécié — purgé au montage

function load<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
function save(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
}

export function useRealOrders() {
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

  // Purge unique du cache fret historique (source de fret fantôme).
  useEffect(() => {
    try { localStorage.removeItem(LS_FREIGHT_LEGACY); } catch { /* ignore */ }
  }, []);

  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ["cockpit-orders"],
    queryFn: async () => { const r = await listLogisticsOrders({ data: { page: 1, pageSize: 100 } }); return r.rows ?? []; },
    refetchInterval: 30000,
  });

  const orders: LogisticsOrderRow[] = ordersData ?? [];

  useEffect(() => {
    if (orders.length > 0) preloadOrderNumbers(orders.map(o => o.order_id ?? "").filter(Boolean));
  }, [orders]);

  const [orderTypeMap, setOrderTypeMap] = useState<Record<string, "local" | "import" | "mixte">>({});
  useEffect(() => {
    if (orders.length === 0) return;
    const ids = orders.map(o => o.order_id ?? "").filter(Boolean);
    if (ids.length === 0) return;
    getOrderTypesBatch({ data: { order_ids: ids } })
      .then(map => setOrderTypeMap(map as Record<string, "local" | "import" | "mixte">))
      .catch(() => {});
  }, [ordersData]);

  const [localPayments, setLocalPayments] = useState<PaymentRecord[]>(() => load(LS_PAYMENTS, []));
  useEffect(() => save(LS_PAYMENTS, localPayments), [localPayments]);

  const [localAudit, setLocalAudit] = useState<AuditEntry[]>(() => load(LS_AUDIT, []));
  useEffect(() => save(LS_AUDIT, localAudit), [localAudit]);

  const [cancellations, setCancellations] = useState<CancellationRecord[]>(() => load(LS_CANCEL, []));
  useEffect(() => save(LS_CANCEL, cancellations), [cancellations]);

  const [weighings, setWeighings] = useState<WeighingRecord[]>(() => load(LS_WEIGHT, []));
  useEffect(() => save(LS_WEIGHT, weighings), [weighings]);

  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>(() => load(LS_STATUS, {}));
  useEffect(() => save(LS_STATUS, statusOverrides), [statusOverrides]);

  // Compat : freightMap est désormais TOUJOURS vide (le fret vient du serveur).
  const freightMap = useMemo<Record<string, number>>(() => ({}), []);

  const ordersWithStatus = useMemo<LogisticsOrderRow[]>(() => {
    return orders.map(o => {
      const override = statusOverrides[o.order_id ?? ""];
      if (override) return { ...o, logistics_status: override };
      return o;
    });
  }, [orders, statusOverrides]);

  const { data: sbPayments } = useQuery({
    queryKey: ["cockpit-payments"],
    queryFn: async () => { try { return await listAllOrderPayments({ data: undefined }); } catch { return []; } },
    refetchInterval: 20000,
    retry: 2,
  });

  const allPayments = useMemo(() => {
    const sb = (sbPayments ?? []) as unknown as PaymentRecord[];
    const merged = [...sb];
    for (const lp of localPayments) if (!merged.some(m => m.id === lp.id)) merged.push(lp);
    return merged;
  }, [sbPayments, localPayments]);

  const getPayments = useCallback((orderId: string) => allPayments.filter(p => p.orderId === orderId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [allPayments]);
  const getTotalPaid = useCallback((orderId: string) => allPayments.filter(p => p.orderId === orderId).reduce((s, p) => s + p.amount, 0), [allPayments]);
  const getAudit = useCallback((orderId: string) => localAudit.filter(a => a.orderId === orderId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [localAudit]);
  const getCancellation = useCallback((orderId: string) => cancellations.find(c => c.orderId === orderId) ?? null, [cancellations]);
  const getWeighings = useCallback((orderId: string) => weighings.filter(w => w.orderId === orderId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [weighings]);

  // ─── SOURCE DE VÉRITÉ UNIQUE pour les finances ───
  //   Produits = order.order_total
  //   Fret     = order.total_shipping_fees   (= déclaré figé + pesé persisté serveur)
  //   Total    = Produits + Fret
  const getOrderFinancials = useCallback((order: LogisticsOrderRow) => {
    const oid = order.order_id ?? "";
    const productTotal = Number(order.order_total ?? 0);
    const freight = Number(order.total_shipping_fees ?? 0);
    const grandTotal = productTotal + freight;
    const declaredCircuit = order.weight_status === "declared" || order.weight_status === "verified" || order.weight_status === "anomaly";
    const recordedPaid = getTotalPaid(oid);
    const paid = declaredCircuit && freight > 0 ? Math.max(recordedPaid, grandTotal) : recordedPaid;
    const remaining = Math.max(0, grandTotal - paid);
    return { productTotal, freight, grandTotal, paid, remaining };
  }, [getTotalPaid]);

  const payMut = useMutation({
    mutationFn: async (p: { orderId: string; amount: number; method: PaymentMethod; reference: string; adminName: string }) => {
      try { await createOrderPayment({ data: { order_id: p.orderId, amount: p.amount, method: p.method, reference: p.reference, admin_name: p.adminName } }); } catch { /* fallback local */ }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cockpit-payments"] }),
  });

  const addPayment = useCallback((orderId: string, amount: number, method: string, reference: string, adminName: string) => {
    const p: PaymentRecord = { id: `pay_${Date.now()}`, orderId, amount, method: method as PaymentMethod, reference, adminName, timestamp: new Date().toISOString(), editHistory: [] };
    setLocalPayments(prev => [p, ...prev]);
    payMut.mutate({ orderId, amount, method: method as PaymentMethod, reference, adminName });
    addAuditEntry(orderId, `Paiement ${fmtF(amount)} via ${method}`, adminName, reference);
  }, [payMut]);

  const editPayment = useCallback((paymentId: string, updates: { amount?: number; method?: string; reference?: string }) => {
    setLocalPayments(prev => prev.map(p => {
      if (p.id !== paymentId) return p;
      const newMethod = (updates.method ?? p.method) as PaymentMethod;
      const edit = { oldAmount: p.amount, newAmount: updates.amount ?? p.amount, oldMethod: p.method, newMethod, editedBy: p.adminName, editedAt: new Date().toISOString() };
      return { ...p, ...updates, method: newMethod, editHistory: [...(p.editHistory ?? []), edit] } as PaymentRecord;
    }));
  }, []);

  const deletePayment = useCallback((paymentId: string) => {
    const p = allPayments.find(x => x.id === paymentId);
    if (p) addAuditEntry(p.orderId, `Suppression paiement ${fmtF(p.amount)}`, p.adminName);
    setLocalPayments(prev => prev.filter(p => p.id !== paymentId));
  }, [allPayments]);

  const cancelOrder = useCallback((orderId: string, reason: string, refundType: RefundType, adminName: string) => {
    const paid = getTotalPaid(orderId);
    setCancellations(prev => [{ orderId, reason, refundType, paidAmount: paid, cancelledBy: adminName, cancelledAt: new Date().toISOString() }, ...prev]);
    setStatusOverrides(prev => ({ ...prev, [orderId]: "cancelled" }));
    addAuditEntry(orderId, `Annulation — ${reason} — remboursement: ${refundType} — ${fmtF(paid)}`, adminName);
  }, [getTotalPaid]);

  // Persistance serveur du fret pesé (assessment.air_freight_fee).
  const weighMut = useMutation({
    mutationFn: async (p: { assessmentId: string; airFreightFee: number; realKg: number; volKg: number }) => {
      await updateShipmentAssessment({
        data: {
          id: p.assessmentId,
          air_freight_fee: p.airFreightFee,
          real_weight_kg: p.realKg,
          volumetric_weight_kg: p.volKg,
        },
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cockpit-orders"] }); refetch(); },
  });

  const addWeighing = useCallback((w: Omit<WeighingRecord, "id" | "timestamp"> & { assessmentId?: string | null }) => {
    const { assessmentId, ...rest } = w as any;
    const record: WeighingRecord = { ...rest, id: `wgh_${Date.now()}`, timestamp: new Date().toISOString() };
    setWeighings(prev => [record, ...prev]);
    if (assessmentId) {
      weighMut.mutate({
        assessmentId,
        airFreightFee: Math.round(w.finalFreight),
        realKg: Number(w.realWeightKg) || 0,
        volKg: Number(w.volumetricWeightKg) || 0,
      });
    }
    addAuditEntry(w.orderId, `Pesée — ${w.realWeightKg}kg réel, ${w.volumetricWeightKg.toFixed(2)}kg vol, Fret ${fmtF(w.finalFreight)}`, w.weighedBy);
  }, [weighMut]);

  // Compat (PipelineView lit encore freightMap[oid] ?? total_shipping_fees).
  const setFreight = useCallback((_orderId: string, _amount: number) => { /* no-op */ }, []);

  const addAuditEntry = useCallback((orderId: string, action: string, adminName: string, details?: string) => {
    setLocalAudit(prev => [{ id: `audit_${Date.now()}`, orderId, action, adminName, timestamp: new Date().toISOString(), details }, ...prev]);
  }, []);

  const updateStatus = useCallback((orderId: string, newStatus: string, adminName: string) => {
    setStatusOverrides(prev => ({ ...prev, [orderId]: newStatus }));
    // ⚠️ Plus de propagation dans freightMap : le fret est lu uniquement depuis le serveur.
    addAuditEntry(orderId, `Statut → ${newStatus}`, adminName);
  }, [addAuditEntry]);

  return {
    orders: ordersWithStatus,
    rawOrders: orders,
    isLoading, searchTerm, setSearchTerm, refetch,
    allPayments, getPayments, getTotalPaid,
    addPayment, editPayment, deletePayment,
    getAudit, addAuditEntry, updateStatus,
    cancelOrder, getCancellation, cancellations,
    getWeighings, addWeighing,
    freightMap, setFreight, getOrderFinancials,
    orderTypeMap,
  };
}

function fmtF(n: number): string { return n.toLocaleString("fr-FR") + " FCFA"; }
