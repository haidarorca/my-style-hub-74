// ═══════════════════════════════════════════════════════════════
// weight-anomalies.functions.ts
//
// Résolution d'une anomalie de poids détectée à la pesée.
// Actions :
//   - accept_loss     : on accepte la perte, expédition reprise
//   - contact_client  : contact interne, aucun effet automatique
//   - cancel_order    : commande annulée
//   - modify_fees     : ajustement des frais transport + reprise expédition
// ═══════════════════════════════════════════════════════════════
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "./admin-auth.core";

const ResolveSchema = z.object({
  assessment_id: z.string().uuid(),
  order_id: z.string().uuid(),
  action: z.enum(["accept_loss", "contact_client", "cancel_order", "modify_fees"]),
  note: z.string().trim().max(1000).optional().nullable(),
  air_freight_fee: z.number().min(0).optional().nullable(),
  service_fee: z.number().min(0).optional().nullable(),
});

export const resolveWeightAnomaly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ResolveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Trace la décision sur l'évaluation
    const tracePatch: Record<string, unknown> = {
      anomaly_resolution: data.action,
      anomaly_resolved_by: context.userId,
      anomaly_resolved_at: new Date().toISOString(),
      anomaly_note: data.note ?? null,
    };
    if (data.action === "modify_fees") {
      if (data.air_freight_fee != null) tracePatch.air_freight_fee = data.air_freight_fee;
      if (data.service_fee != null) tracePatch.service_fee = data.service_fee;
    }
    const { error: updErr } = await (supabaseAdmin as any)
      .from("order_shipment_assessments")
      .update(tracePatch)
      .eq("id", data.assessment_id);
    if (updErr) throw new Error(`Sauvegarde décision : ${updErr.message}`);

    // 2. Effets de bord selon l'action
    if (data.action === "accept_loss" || data.action === "modify_fees") {
      // Reprise du circuit : direct ready_to_ship.
      await (supabaseAdmin as any)
        .from("order_shipment_assessments")
        .update({ status: "ready_to_ship" })
        .eq("id", data.assessment_id);
    } else if (data.action === "cancel_order") {
      await (supabaseAdmin as any)
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", data.order_id);
    }
    // contact_client : aucun effet automatique.

    return { ok: true };
  });
