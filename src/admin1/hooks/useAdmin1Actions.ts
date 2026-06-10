// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   HOOK : useAdmin1Actions — Mutations metiers
   ═══════════════════════════════════════════════════════════════ */

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { KawzoneOrder, KawzonePackage, PaymentLog, OrderStatus } from "@/admin1/types/admin1";
import { FREIGHT_RATE_PER_KG } from "@/admin1/lib/admin1.config";

export function useAdmin1Actions() {
  const qc = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["admin1-orders"] });
  }, [qc]);

  /* ── Confirmer commande ── */
  const confirmOrder = useCallback(async (order: KawzoneOrder) => {
    setIsPending(true);
    try {
      /* TODO: Supabase update */
      await new Promise((r) => setTimeout(r, 300));
      toast.success("Commande confirmee", { description: `${order.order_number} · ${order.customer_name}` });
      invalidate();
    } catch (e) {
      toast.error("Erreur", { description: e instanceof Error ? e.message : "" });
    } finally {
      setIsPending(false);
    }
  }, [invalidate]);

  /* ── Annuler commande ── */
  const cancelOrder = useCallback(async (order: KawzoneOrder) => {
    setIsPending(true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      toast.success("Commande annulee", { description: `${order.order_number}` });
      invalidate();
    } finally {
      setIsPending(false);
    }
  }, [invalidate]);

  /* ── Enregistrer pesee ── */
  const recordWeight = useCallback(async (
    order: KawzoneOrder,
    pkg: KawzonePackage,
    realWeight: number,
    volWeight: number
  ) => {
    setIsPending(true);
    try {
      const chargeable = Math.max(realWeight, volWeight);
      const freight = Math.round(chargeable * (pkg.freight_rate_per_kg || FREIGHT_RATE_PER_KG));
      await new Promise((r) => setTimeout(r, 300));
      toast.success("Pesee enregistree", {
        description: `${order.order_number} · ${chargeable.toFixed(2)} kg · ${freight.toLocaleString("fr-FR")} FCFA`,
      });
      invalidate();
      return freight;
    } finally {
      setIsPending(false);
    }
  }, [invalidate]);

  /* ── Enregistrer paiement ── */
  const recordPayment = useCallback(async (
    order: KawzoneOrder,
    amount: number,
    method: string,
    reference?: string
  ) => {
    setIsPending(true);
    try {
      if (amount <= 0) throw new Error("Montant invalide");
      await new Promise((r) => setTimeout(r, 300));
      toast.success("Paiement enregistre", {
        description: `${amount.toLocaleString("fr-FR")} FCFA · ${method}${reference ? " · " + reference : ""}`,
      });
      invalidate();
    } catch (e) {
      toast.error("Erreur", { description: e instanceof Error ? e.message : "" });
    } finally {
      setIsPending(false);
    }
  }, [invalidate]);

  /* ── Expedier ── */
  const shipOrder = useCallback(async (order: KawzoneOrder, tracking: string) => {
    setIsPending(true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      toast.success("Commande expediee", { description: `${order.order_number} · Tracking: ${tracking}` });
      invalidate();
    } finally {
      setIsPending(false);
    }
  }, [invalidate]);

  /* ── Marquer livree ── */
  const deliverOrder = useCallback(async (order: KawzoneOrder) => {
    setIsPending(true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      toast.success("Commande livree", { description: `${order.order_number} · ${order.customer_name}` });
      invalidate();
    } finally {
      setIsPending(false);
    }
  }, [invalidate]);

  return {
    confirmOrder,
    cancelOrder,
    recordWeight,
    recordPayment,
    shipOrder,
    deliverOrder,
    isPending,
  };
}
