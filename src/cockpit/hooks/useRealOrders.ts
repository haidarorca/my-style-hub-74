// ═══════════════════════════════════════════════════════════════
// useRealOrders — State management complet du Cockpit
// Supabase prioritaire + localStorage fallback
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listLogisticsOrders } from "@/lib/admin-logistics.functions";
import { createOrderPayment, listAllOrderPayments } from "@/lib/cockpit-payments.functions";
import { preloadOrderNumbers } from "@/cockpit/lib/orderNumbers";
import type { PaymentRecord, AuditEntry, CancellationRecord, WeighingRecord, PaymentMethod, RefundType } from "@/cockpit/types";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

const LS_PAYMENTS = "kz_payments_v2";
const LS_AUDIT = "kz_audit_v2";
const LS_CANCEL = "kz_cancel_v2";
const LS_WEIGHT = "kz_weight_v2";
const LS_STATUS = "kz_status_v2"; // Overrides de statut (annulations, etc)
const LS_FREIGHT = "kz_freight_v2"; // Fret calculé par commande (persiste le montant du transport)

function load<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
function save(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
}

export function useRealOrders() {
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

  /* ── Commandes Supabase ── */
  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ["cockpit-orders"],
    queryFn: async () => { const r = await listLogisticsOrders({ data: { page: 1, pageSize: 100 } }); return r.rows ?? []; },
    refetchInterval: 30000,
  });

  const orders: LogisticsOrderRow[] = ordersData ?? [];

  /* ── Preload KZ numbers ── */
  useEffect(() => {
    if (orders.length > 0) preloadOrderNumbers(orders.map(o => o.order_id ?? "").filter(Boolean));
  }, [orders]);

  /* ── Paiements locaux ── */
  const [localPayments, setLocalPayments] = useState<PaymentRecord[]>(() => load(LS_PAYMENTS, []));
  useEffect(() => save(LS_PAYMENTS, localPayments), [localPayments]);

  /* ── Audit local ── */
  const [localAudit, setLocalAudit] = useState<AuditEntry[]>(() => load(LS_AUDIT, []));
  useEffect(() => save(LS_AUDIT, localAudit), [localAudit]);

  /* ── Annulations ── */
  const [cancellations, setCancellations] = useState<CancellationRecord[]>(() => load(LS_CANCEL, []));
  useEffect(() => save(LS_CANCEL, cancellations), [cancellations]);

  /* ── Pesées ── */
  const [weighings, setWeighings] = useState<WeighingRecord[]>(() => load(LS_WEIGHT, []));
  useEffect(() => save(LS_WEIGHT, weighings), [weighings]);

  /* ── Fret calculé par commande (persisté après pesée) ── 
     Clé: orderId, Valeur: montant du fret en FCFA
     Permet d'afficher Prix produit + Fret = Total dans les KPI */
  const [freightMap, setFreightMap] = useState<Record<string, number>>(() => load(LS_FREIGHT, {}));
  useEffect(() => save(LS_FREIGHT, freightMap), [freightMap]);

  /* ── Overrides de statut (annulations, etc) ── 
     Clé: orderId, Valeur: statut forcé
     Permet de refléter les changements locaux sans attendre Supabase */
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>(() => load(LS_STATUS, {}));
  useEffect(() => save(LS_STATUS, statusOverrides), [statusOverrides]);

  /* ── Commandes avec statuts overridés ── */
  const ordersWithStatus = useMemo<LogisticsOrderRow[]>(() => {
    return orders.map(o => {
      const override = statusOverrides[o.order_id ?? ""];
      if (override) return { ...o, logistics_status: override };
      return o;
    });
  }, [orders, statusOverrides]);

  /* ── Paiements Supabase ── */
  const { data: sbPayments } = useQuery({
    queryKey: ["cockpit-payments"],
    queryFn: async () => { try { return await listAllOrderPayments({ data: undefined }); } catch { return []; } },
    refetchInterval: 20000,
    retry: 2,
  });

  /* ── Fusion Supabase + local ── */
  const allPayments = useMemo(() => {
    const sb = (sbPayments ?? []) as PaymentRecord[];
    const merged = [...sb];
    for (const lp of localPayments) if (!merged.some(m => m.id === lp.id)) merged.push(lp);
    return merged;
  }, [sbPayments, localPayments]);

  /* ── Helpers ── */
  const getPayments = useCallback((orderId: string) => allPayments.filter(p => p.orderId === orderId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [allPayments]);
  const getTotalPaid = useCallback((orderId: string) => allPayments.filter(p => p.orderId === orderId).reduce((s, p) => s + p.amount, 0), [allPayments]);
  const getAudit = useCallback((orderId: string) => localAudit.filter(a => a.orderId === orderId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [localAudit]);
  const getCancellation = useCallback((orderId: string) => cancellations.find(c => c.orderId === orderId) ?? null, [cancellations]);
  const getWeighings = useCallback((orderId: string) => weighings.filter(w => w.orderId === orderId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [weighings]);

  /* ── MUTATION : Ajouter paiement ── */
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
      const edit = { oldAmount: p.amount, newAmount: updates.amount ?? p.amount, oldMethod: p.method, newMethod: updates.method ?? p.method, editedBy: p.adminName, editedAt: new Date().toISOString() };
      return { ...p, ...updates, editHistory: [...(p.editHistory ?? []), edit] };
    }));
  }, []);

  const deletePayment = useCallback((paymentId: string) => {
    const p = allPayments.find(x => x.id === paymentId);
    if (p) addAuditEntry(p.orderId, `Suppression paiement ${fmtF(p.amount)}`, p.adminName);
    setLocalPayments(prev => prev.filter(p => p.id !== paymentId));
  }, [allPayments]);

  /* ── Annulation ── */
  const cancelOrder = useCallback((orderId: string, reason: string, refundType: RefundType, adminName: string) => {
    const paid = getTotalPaid(orderId);
    // 1. Enregistrer l'annulation
    setCancellations(prev => [{ orderId, reason, refundType, paidAmount: paid, cancelledBy: adminName, cancelledAt: new Date().toISOString() }, ...prev]);
    // 2. FORCER le statut à "cancelled" (sort des listes actives, va dans Archive)
    setStatusOverrides(prev => ({ ...prev, [orderId]: "cancelled" }));
    // 3. Audit
    addAuditEntry(orderId, `Annulation — ${reason} — remboursement: ${refundType} — ${fmtF(paid)}`, adminName);
  }, [getTotalPaid]);

  /* ── Pesée ── */
  const addWeighing = useCallback((w: Omit<WeighingRecord, "id" | "timestamp">) => {
    const record: WeighingRecord = { ...w, id: `wgh_${Date.now()}`, timestamp: new Date().toISOString() };
    setWeighings(prev => [record, ...prev]);
    // Stocker le fret calculé dans freightMap pour l'affichage dans les KPI
    setFreightMap(prev => ({ ...prev, [w.orderId]: w.finalFreight }));
    addAuditEntry(w.orderId, `Pesée — ${w.realWeightKg}kg réel, ${w.volumetricWeightKg.toFixed(2)}kg vol, Fret ${fmtF(w.finalFreight)}`, w.weighedBy);
  }, []);

  /* ── Définir le fret manuellement (pour corrections) ── */
  const setFreight = useCallback((orderId: string, amount: number) => {
    setFreightMap(prev => ({ ...prev, [orderId]: amount }));
  }, []);

  /* ── Audit helper ── */
  const addAuditEntry = useCallback((orderId: string, action: string, adminName: string, details?: string) => {
    setLocalAudit(prev => [{ id: `audit_${Date.now()}`, orderId, action, adminName, timestamp: new Date().toISOString(), details }, ...prev]);
  }, []);

  const updateStatus = useCallback((orderId: string, newStatus: string, adminName: string) => {
    // 1. Forcer le statut (comme cancelOrder)
    setStatusOverrides(prev => ({ ...prev, [orderId]: newStatus }));
    // 2. Audit
    addAuditEntry(orderId, `Statut → ${newStatus}`, adminName);
  }, [addAuditEntry]);

  return {
    // Commandes avec statuts overridés (annulations, etc.)
    orders: ordersWithStatus,
    rawOrders: orders,
    isLoading, searchTerm, setSearchTerm, refetch,
    allPayments, getPayments, getTotalPaid,
    addPayment, editPayment, deletePayment,
    getAudit, addAuditEntry, updateStatus,
    cancelOrder, getCancellation, cancellations,
    getWeighings, addWeighing,
    freightMap, setFreight,
  };
}

function fmtF(n: number): string { return n.toLocaleString("fr-FR") + " FCFA"; }
