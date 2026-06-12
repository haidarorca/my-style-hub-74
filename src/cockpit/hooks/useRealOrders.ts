// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   HOOK : useRealOrders — Donnees Supabase + paiements + audit
   
   Strategie hybride :
   - Les paiements sont D'ABORD persistes dans Supabase
   - localStorage sert de cache offline / fallback
   - Les deux sources sont fusionnees pour l'affichage
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listLogisticsOrders } from "@/lib/admin-logistics.functions";
import { createOrderPayment, listAllOrderPayments, listPaymentAudit } from "@/lib/cockpit-payments.functions";
import { preloadOrderNumbers } from "@/cockpit/lib/orderNumbers";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { OrderPayment, PaymentAudit } from "@/lib/cockpit-payments.functions";

/* ── Types ── */

export interface PaymentRecord {
  id: string;
  orderId: string;
  amount: number;
  method: string;
  reference: string;
  adminName: string;
  timestamp: string;
}

export interface AuditEntry {
  id: string;
  orderId: string;
  action: string;
  adminName: string;
  timestamp: string;
  details?: string;
}

/* ── localStorage keys (fallback / cache offline) ── */
const STORAGE_KEY_PAYMENTS = "kawzone_payments_v1";
const STORAGE_KEY_AUDIT = "kawzone_audit_v1";

function loadFromStorage<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function saveToStorage(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
}

/* ── Convertisseurs Supabase → local ── */

function supabaseToLocalPayment(p: OrderPayment): PaymentRecord {
  return {
    id: p.id,
    orderId: p.order_id,
    amount: Number(p.amount),
    method: p.method,
    reference: p.reference ?? "",
    adminName: p.admin_name,
    timestamp: p.created_at,
  };
}

function supabaseToLocalAudit(a: PaymentAudit): AuditEntry {
  return {
    id: a.id,
    orderId: a.order_id,
    action: a.action,
    adminName: a.admin_name,
    timestamp: a.created_at,
    details: a.details ?? undefined,
  };
}

/* ═══════════════════════════════════════════════════════════════ */

export function useRealOrders() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

  /* ── Cache localStorage (fallback offline) ── */
  const [localPayments, setLocalPayments] = useState<PaymentRecord[]>(() =>
    loadFromStorage(STORAGE_KEY_PAYMENTS, [])
  );
  const [localAudit, setLocalAudit] = useState<AuditEntry[]>(() =>
    loadFromStorage(STORAGE_KEY_AUDIT, [])
  );

  useEffect(() => { saveToStorage(STORAGE_KEY_PAYMENTS, localPayments); }, [localPayments]);
  useEffect(() => { saveToStorage(STORAGE_KEY_AUDIT, localAudit); }, [localAudit]);

  /* ── Requete : commandes ── */
  const { data: ordersData, isLoading, error, refetch: refetchOrders } = useQuery({
    queryKey: ["cockpit-orders"],
    queryFn: async () => {
      const result = await listLogisticsOrders({ data: { page: 1, pageSize: 100 } });
      return result.rows ?? [];
    },
    refetchInterval: 30000,
  });

  const orders: LogisticsOrderRow[] = ordersData ?? [];

  /* ── Precharger les numeros KZ pour toutes les commandes ── */
  useEffect(() => {
    if (orders.length > 0) {
      preloadOrderNumbers(orders.map(o => o.order_id ?? "").filter(Boolean));
    }
  }, [orders]);

  /* ── Requete : paiements Supabase ── */
  const { data: supabasePayments } = useQuery({
    queryKey: ["cockpit-payments"],
    queryFn: async () => {
      try {
        const result = await listAllOrderPayments({ data: undefined });
        return (result ?? []).map(supabaseToLocalPayment);
      } catch (e) {
        console.warn("[useRealOrders] Fallback localStorage pour les paiements");
        return [] as PaymentRecord[];
      }
    },
    refetchInterval: 15000,
    retry: 2,
  });

  /* ── Requete : audit Supabase ── */
  const { data: supabaseAudit } = useQuery({
    queryKey: ["cockpit-audit"],
    queryFn: async () => {
      try {
        // Recuperer l'audit pour toutes les commandes chargees
        const allAudit: AuditEntry[] = [];
        for (const o of orders.slice(0, 20)) {
          if (!o.order_id) continue;
          try {
            const audit = await listPaymentAudit({ data: { order_id: o.order_id } });
            allAudit.push(...(audit ?? []).map(supabaseToLocalAudit));
          } catch { /* ignorer par commande */ }
        }
        return allAudit;
      } catch (e) {
        console.warn("[useRealOrders] Fallback localStorage pour l'audit");
        return [] as AuditEntry[];
      }
    },
    enabled: orders.length > 0,
    refetchInterval: 30000,
    retry: 1,
  });

  /* ── Fusion : Supabase + localStorage ── */
  const allPayments = useMemo(() => {
    const fromSupabase = supabasePayments ?? [];
    const merged = [...fromSupabase];
    // Ajouter les paiements locaux qui ne sont pas encore dans Supabase
    for (const lp of localPayments) {
      if (!merged.some(p => p.id === lp.id)) {
        merged.push(lp);
      }
    }
    return merged;
  }, [supabasePayments, localPayments]);

  const allAudit = useMemo(() => {
    const fromSupabase = supabaseAudit ?? [];
    const merged = [...fromSupabase];
    for (const la of localAudit) {
      if (!merged.some(a => a.id === la.id)) {
        merged.push(la);
      }
    }
    return merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [supabaseAudit, localAudit]);

  /* ── LOCAL vs IMPORT ── */
  const localOrders = useMemo(() => orders.filter(o => !o.shipping_service_id && o.order_type !== "import"), [orders]);
  const importOrders = useMemo(() => orders.filter(o => o.shipping_service_id || o.order_type === "import"), [orders]);

  /* ── Recherche ── */
  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;
    const q = searchTerm.toLowerCase().trim();
    return orders.filter(o =>
      (o.order_id ?? "").toLowerCase().includes(q) ||
      (o.customer_name ?? "").toLowerCase().includes(q) ||
      (o.customer_phone ?? "").toLowerCase().includes(q) ||
      (o.tracking_number ?? "").toLowerCase().includes(q)
    );
  }, [orders, searchTerm]);

  /* ── Paiements d'une commande ── */
  const getPayments = useCallback((orderId: string): PaymentRecord[] => {
    return allPayments
      .filter(p => p.orderId === orderId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [allPayments]);

  /* ── Total paye pour une commande ── */
  const getTotalPaid = useCallback((orderId: string): number => {
    return allPayments
      .filter(p => p.orderId === orderId)
      .reduce((sum, p) => sum + p.amount, 0);
  }, [allPayments]);

  /* ── Mutation : ajouter un paiement ── */
  const paymentMutation = useMutation({
    mutationFn: async (params: { orderId: string; amount: number; method: string; reference: string; adminName: string }) => {
      try {
        // Essayer d'abord Supabase
        await createOrderPayment({
          data: {
            order_id: params.orderId,
            amount: params.amount,
            method: params.method,
            reference: params.reference,
            admin_name: params.adminName,
          }
        });
        return { success: true, source: "supabase" };
      } catch (e) {
        console.warn("[addPayment] Fallback localStorage:", e);
        return { success: true, source: "local" };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cockpit-payments"] });
    },
  });

  /* ── Ajouter un paiement ── */
  const addPayment = useCallback((orderId: string, amount: number, method: string, reference: string, adminName: string = "Admin") => {
    const payment: PaymentRecord = {
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orderId,
      amount,
      method,
      reference,
      adminName,
      timestamp: new Date().toISOString(),
    };

    // 1. Toujours ajouter en local (reactif instantane)
    setLocalPayments(prev => [payment, ...prev]);

    // 2. Essayer Supabase en arriere-plan
    paymentMutation.mutate({ orderId, amount, method, reference, adminName });

    // 3. Audit local
    addAudit(orderId, `Paiement de ${fmtF(amount)} via ${method}`, adminName, reference);
  }, [paymentMutation]);

  /* ── Modifier un paiement ── */
  const editPayment = useCallback((paymentId: string, updates: Partial<Pick<PaymentRecord, "amount" | "method" | "reference">>) => {
    setLocalPayments(prev => {
      const old = prev.find(p => p.id === paymentId);
      if (!old) return prev;
      const updated = { ...old, ...updates };
      const newPayments = prev.map(p => p.id === paymentId ? updated : p);
      // Audit
      addAudit(old.orderId, "Paiement modifie", old.adminName, `${fmtF(old.amount)} → ${fmtF(updated.amount)} (${updated.method})`);
      return newPayments;
    });
  }, [addAudit]);

  /* ── Supprimer un paiement ── */
  const deletePayment = useCallback((paymentId: string) => {
    setLocalPayments(prev => {
      const payment = prev.find(p => p.id === paymentId);
      if (!payment) return prev;
      // Audit
      addAudit(payment.orderId, "Paiement supprime", payment.adminName, `${fmtF(payment.amount)} via ${payment.method}`);
      return prev.filter(p => p.id !== paymentId);
    });
  }, [addAudit]);

  /* ── Ajouter audit ── */
  const addAudit = useCallback((orderId: string, action: string, adminName: string = "Admin", details?: string) => {
    const entry: AuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orderId,
      action,
      adminName,
      timestamp: new Date().toISOString(),
      details,
    };
    setLocalAudit(prev => [entry, ...prev]);
  }, []);

  /* ── Audit d'une commande ── */
  const getAudit = useCallback((orderId: string): AuditEntry[] => {
    return allAudit.filter(a => a.orderId === orderId);
  }, [allAudit]);

  /* ── Changer statut ── */
  const updateStatus = useCallback((orderId: string, newStatus: string, adminName: string = "Admin") => {
    addAudit(orderId, `Statut: ${newStatus}`, adminName);
  }, [addAudit]);

  return {
    orders,
    localOrders,
    importOrders,
    filteredOrders,
    searchTerm,
    setSearchTerm,
    isLoading,
    error,
    refetch: refetchOrders,
    // Paiements
    payments: allPayments,
    getPayments,
    getTotalPaid,
    addPayment,
    editPayment,
    deletePayment,
    // Audit
    auditLog: allAudit,
    getAudit,
    addAudit,
    updateStatus,
  };
}

function fmtF(n: number): string {
  return n.toLocaleString("fr-FR") + " FCFA";
}
