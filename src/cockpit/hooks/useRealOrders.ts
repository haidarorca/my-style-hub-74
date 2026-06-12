// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   HOOK : useRealOrders — Donnees reelles + paiements + audit
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { listLogisticsOrders } from "@/lib/admin-logistics.functions";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

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

/* ── localStorage keys ── */
const STORAGE_KEY_PAYMENTS = "kawzone_payments_v1";
const STORAGE_KEY_AUDIT = "kawzone_audit_v1";

/* ── Load from localStorage ── */
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveToStorage(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
}

export function useRealOrders() {
  const [searchTerm, setSearchTerm] = useState("");

  /* ── Paiements ── */
  const [payments, setPayments] = useState<PaymentRecord[]>(() =>
    loadFromStorage(STORAGE_KEY_PAYMENTS, [])
  );

  /* ── Journal d'audit ── */
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(() =>
    loadFromStorage(STORAGE_KEY_AUDIT, [])
  );

  /* ── Persist ── */
  useEffect(() => { saveToStorage(STORAGE_KEY_PAYMENTS, payments); }, [payments]);
  useEffect(() => { saveToStorage(STORAGE_KEY_AUDIT, auditLog); }, [auditLog]);

  /* ── Requete Supabase ── */
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cockpit-orders"],
    queryFn: async () => {
      const result = await listLogisticsOrders({ data: { page: 1, pageSize: 100 } });
      return result.rows ?? [];
    },
    refetchInterval: 30000,
  });

  const orders: LogisticsOrderRow[] = data ?? [];

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
    return payments
      .filter(p => p.orderId === orderId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [payments]);

  /* ── Total paye pour une commande ── */
  const getTotalPaid = useCallback((orderId: string): number => {
    return payments
      .filter(p => p.orderId === orderId)
      .reduce((sum, p) => sum + p.amount, 0);
  }, [payments]);

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
    setPayments(prev => [...prev, payment]);
    // Audit
    addAudit(orderId, "Paiement ajoute", adminName, `${fmtF(amount)} via ${method}${reference ? " (Ref: " + reference + ")" : ""}`);
  }, []);

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
    setAuditLog(prev => [entry, ...prev]);
  }, []);

  /* ── Audit d'une commande ── */
  const getAudit = useCallback((orderId: string): AuditEntry[] => {
    return auditLog
      .filter(a => a.orderId === orderId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [auditLog]);

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
    refetch,
    // Paiements
    payments,
    getPayments,
    getTotalPaid,
    addPayment,
    // Audit
    auditLog,
    getAudit,
    addAudit,
    updateStatus,
  };
}

function fmtF(n: number): string {
  return n.toLocaleString("fr-FR") + " FCFA";
}
