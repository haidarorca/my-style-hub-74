import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  updateShipmentAssessment,
  confirmShipmentPayment,
  recordShipmentPayment,
} from "@/lib/admin-logistics.functions";
import type { WorkflowRow } from "@/types/workflow";

/* ═══════════════════════════════════════════════════════════════
   USE WORKFLOW ACTIONS — Mutations métiers avec feedback
   Toutes les actions retournent une promesse avec toast intégré
   ═══════════════════════════════════════════════════════════════ */

export function useWorkflowActions() {
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["workflow-orders"] });
  }, [qc]);

  /** Confirmer une commande LOCAL (new → confirmed) */
  const confirmOrder = useCallback(async (row: WorkflowRow) => {
    try {
      const assessmentId = row.assessment_id;
      if (!assessmentId) {
        // Commande sans assessment → créer puis confirmer
        const { getOrCreateShipmentAssessment } = await import("@/lib/shipment-assessments.functions");
        const assessment = await getOrCreateShipmentAssessment({ data: { order_id: row.order_id } });
        await updateShipmentAssessment({
          data: {
            assessment_id: assessment.id,
            status: "confirmed",
          },
        });
      } else {
        await updateShipmentAssessment({
          data: { assessment_id: assessmentId, status: "confirmed" },
        });
      }
      invalidate();
      toast.success("Commande confirmée", { description: `#${row.order_id?.slice(-4)} · ${row.customer_name}` });
    } catch (e) {
      toast.error("Erreur", { description: e instanceof Error ? e.message : "Impossible de confirmer" });
      throw e;
    }
  }, [invalidate]);

  /** Marquer une commande LOCAL comme livrée (confirmed → delivered) */
  const markDelivered = useCallback(async (row: WorkflowRow) => {
    try {
      if (!row.assessment_id) throw new Error("Pas d'évaluation logistique");
      await updateShipmentAssessment({
        data: { assessment_id: row.assessment_id, status: "delivered" },
      });
      invalidate();
      toast.success("Commande livrée", { description: `#${row.order_id?.slice(-4)} · ${row.customer_name}` });
    } catch (e) {
      toast.error("Erreur", { description: e instanceof Error ? e.message : "Impossible de livrer" });
      throw e;
    }
  }, [invalidate]);

  /** Valider la pesée d'un IMPORT (awaiting_weighing → fees_calculated) */
  const validateWeighing = useCallback(async (
    row: WorkflowRow,
    data: { real_weight_kg: number; volumetric_weight_kg: number; length_cm?: number; width_cm?: number; height_cm?: number; air_freight_fee: number; service_fee: number; shipping_service_id?: string }
  ) => {
    try {
      const assessmentId = row.assessment_id;
      if (!assessmentId) throw new Error("Pas d'évaluation logistique");
      await updateShipmentAssessment({
        data: {
          assessment_id: assessmentId,
          ...data,
          status: "fees_calculated",
        },
      });
      invalidate();
      toast.success("Pesée validée", { description: `#${row.order_id?.slice(-4)} · ${data.real_weight_kg} kg` });
    } catch (e) {
      toast.error("Erreur pesée", { description: e instanceof Error ? e.message : "Échec" });
      throw e;
    }
  }, [invalidate]);

  /** Envoyer les frais au client (fees_calculated → awaiting_client_validation) */
  const sendFeesToClient = useCallback(async (row: WorkflowRow) => {
    try {
      if (!row.assessment_id) throw new Error("Pas d'évaluation logistique");
      await updateShipmentAssessment({
        data: { assessment_id: row.assessment_id, status: "awaiting_client_validation" },
      });
      invalidate();
      toast.success("Frais envoyés au client", { description: `WhatsApp → ${row.customer_name}` });
    } catch (e) {
      toast.error("Erreur", { description: e instanceof Error ? e.message : "Échec" });
      throw e;
    }
  }, [invalidate]);

  /** Valider un paiement (validated → ready_to_ship) */
  const validatePayment = useCallback(async (row: WorkflowRow) => {
    try {
      if (!row.assessment_id) throw new Error("Pas d'évaluation logistique");
      await confirmShipmentPayment({
        data: { order_id: row.order_id, assessment_id: row.assessment_id },
      });
      await updateShipmentAssessment({
        data: { assessment_id: row.assessment_id, status: "ready_to_ship" },
      });
      invalidate();
      toast.success("Paiement confirmé", { description: `#${row.order_id?.slice(-4)} · ${row.customer_name}` });
    } catch (e) {
      toast.error("Erreur", { description: e instanceof Error ? e.message : "Échec" });
      throw e;
    }
  }, [invalidate]);

  /** Enregistrer un paiement partiel */
  const addPayment = useCallback(async (
    row: WorkflowRow,
    data: { amount: number; payment_method: string; payment_reference: string }
  ) => {
    try {
      await recordShipmentPayment({
        data: { order_id: row.order_id, ...data },
      });
      invalidate();
      toast.success("Paiement enregistré", {
        description: `${data.amount.toLocaleString("fr-FR")} FCFA · ${data.payment_method}`,
      });
    } catch (e) {
      toast.error("Erreur", { description: e instanceof Error ? e.message : "Échec" });
      throw e;
    }
  }, [invalidate]);

  /** Expédier (ready_to_ship → shipped) */
  const shipOrder = useCallback(async (row: WorkflowRow, trackingNumber: string) => {
    try {
      if (!row.assessment_id) throw new Error("Pas d'évaluation logistique");
      const { updateShipmentTracking } = await import("@/lib/admin-logistics.functions");
      await updateShipmentTracking({
        data: {
          order_id: row.order_id,
          assessment_id: row.assessment_id,
          tracking_number: trackingNumber,
          carrier_name: row.shipping_service_name ?? "Transporteur",
          status: "shipped",
        },
      });
      invalidate();
      toast.success("Commande expédiée", { description: `Tracking: ${trackingNumber}` });
    } catch (e) {
      toast.error("Erreur", { description: e instanceof Error ? e.message : "Échec" });
      throw e;
    }
  }, [invalidate]);

  /** Rejeter une commande */
  const rejectOrder = useCallback(async (row: WorkflowRow, reason?: string) => {
    try {
      if (!row.assessment_id) throw new Error("Pas d'évaluation logistique");
      await updateShipmentAssessment({
        data: {
          assessment_id: row.assessment_id,
          status: "rejected",
          admin_comment: reason ?? "Rejeté par l'administrateur",
        },
      });
      invalidate();
      toast.success("Commande rejetée", { description: `#${row.order_id?.slice(-4)}` });
    } catch (e) {
      toast.error("Erreur", { description: e instanceof Error ? e.message : "Échec" });
      throw e;
    }
  }, [invalidate]);

  return {
    confirmOrder,
    markDelivered,
    validateWeighing,
    sendFeesToClient,
    validatePayment,
    addPayment,
    shipOrder,
    rejectOrder,
  };
}
