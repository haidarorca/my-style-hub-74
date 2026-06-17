// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   HOOK : useAdmin1Actions — Mutations metiers avec vrai state
   ═══════════════════════════════════════════════════════════════ */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { KawzoneOrder, KawzonePackage, OrderStatus } from "@/admin1/types/admin1";
import { FREIGHT_RATE_PER_KG } from "@/admin1/lib/admin1.config";

interface ActionsAPI {
  confirmOrder: (order: KawzoneOrder) => void;
  cancelOrder: (order: KawzoneOrder) => void;
  recordWeight: (order: KawzoneOrder, pkg: KawzonePackage, realWeight: number, volWeight: number) => number;
  recordPayment: (orderId: string, amount: number, method: string, reference?: string) => void;
  shipOrder: (order: KawzoneOrder, tracking: string) => void;
  deliverOrder: (order: KawzoneOrder) => void;
  isPending: boolean;
}

export function useAdmin1Actions(
  updateOrder: (orderId: string, patch: Partial<KawzoneOrder>) => void,
  addPayment: (payment: { order_id: string; amount: number; method: string; reference?: string; recorded_by: string; notes?: string }) => void
): ActionsAPI {
  const [isPending, setIsPending] = useState(false);

  /* ── Confirmer commande (LOCAL ou IMPORT) ── */
  const confirmOrder = useCallback((order: KawzoneOrder) => {
    setIsPending(true);
    try {
      updateOrder(order.id, {
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      });
      toast.success("Commande confirmee", { description: `${order.order_number} · ${order.customer_name}` });
    } catch (e) {
      toast.error("Erreur", { description: e instanceof Error ? e.message : "" });
    } finally {
      setIsPending(false);
    }
  }, [updateOrder]);

  /* ── Annuler commande ── */
  const cancelOrder = useCallback((order: KawzoneOrder) => {
    setIsPending(true);
    try {
      updateOrder(order.id, { status: "cancelled", cancelled_at: new Date().toISOString() });
      toast.success("Commande annulee", { description: `${order.order_number}` });
    } finally {
      setIsPending(false);
    }
  }, [updateOrder]);

  /* ── Enregistrer pesee ── */
  const recordWeight = useCallback((
    order: KawzoneOrder,
    pkg: KawzonePackage,
    realWeight: number,
    volWeight: number
  ): number => {
    const chargeable = Math.max(realWeight, volWeight);
    const freight = Math.round(chargeable * (pkg.freight_rate_per_kg || FREIGHT_RATE_PER_KG));

    updateOrder(order.id, {
      status: "fees_calculated",
      shipping_fees: order.shipping_fees + freight,
      total_due: order.total_product_amount + order.shipping_fees + freight,
      balance: order.total_product_amount + order.shipping_fees + freight - order.total_paid,
    });

    toast.success("Pesee enregistree", {
      description: `${order.order_number} · ${chargeable.toFixed(2)} kg · ${freight.toLocaleString("fr-FR")} FCFA`,
    });
    return freight;
  }, [updateOrder]);

  /* ── Enregistrer paiement ── */
  const recordPayment = useCallback((
    orderId: string,
    amount: number,
    method: string,
    reference?: string
  ) => {
    setIsPending(true);
    try {
      if (amount <= 0) {
        toast.error("Erreur", { description: "Le montant doit etre superieur a 0" });
        return;
      }

      addPayment({
        order_id: orderId,
        amount,
        method,
        reference,
        recorded_by: "Admin",
        notes: `Paiement ${method}${reference ? " " + reference : ""}`,
      });

      toast.success("Paiement enregistre", {
        description: `${amount.toLocaleString("fr-FR")} FCFA · ${method}${reference ? " · " + reference : ""}`,
      });
    } catch (e) {
      toast.error("Erreur", { description: e instanceof Error ? e.message : "" });
    } finally {
      setIsPending(false);
    }
  }, [addPayment]);

  /* ── Expedier ── */
  const shipOrder = useCallback((order: KawzoneOrder, tracking: string) => {
    setIsPending(true);
    try {
      updateOrder(order.id, { status: "shipped" });
      toast.success("Commande expediee", { description: `${order.order_number} · Tracking: ${tracking}` });
    } finally {
      setIsPending(false);
    }
  }, [updateOrder]);

  /* ── Marquer livree ── */
  const deliverOrder = useCallback((order: KawzoneOrder) => {
    setIsPending(true);
    try {
      updateOrder(order.id, { status: "delivered", delivered_at: new Date().toISOString() });
      toast.success("Commande livree", { description: `${order.order_number} · ${order.customer_name}` });
    } finally {
      setIsPending(false);
    }
  }, [updateOrder]);

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
