// ═══════════════════════════════════════════════════════════════
// SUB-ORDER STATES — Persistance serveur du statut par sous-commande.
//
// Chaque sous-commande (clé = vendor_id + line_kind) a son propre
// statut, son propre workflow, son propre historique. Avancer la
// sous-commande A ne doit jamais avancer la sous-commande B.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KeySchema = z.object({
  order_id: z.string().uuid(),
  sub_order_key: z.string().min(1).max(120),
});

export const upsertSubOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => KeySchema.extend({ status: z.string().min(1).max(60) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("sub_order_states")
      .upsert(
        {
          order_id: data.order_id,
          sub_order_key: data.sub_order_key,
          status: data.status,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "order_id,sub_order_key" },
      );
    if (error) throw new Error(`sub_order_states upsert: ${error.message}`);
    return { ok: true };
  });

export const listSubOrderStates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("sub_order_states")
      .select("order_id, sub_order_key, status, updated_at, updated_by")
      .in("order_id", data.order_ids);
    if (error) throw new Error(`sub_order_states list: ${error.message}`);
    return (rows ?? []) as Array<{
      order_id: string;
      sub_order_key: string;
      status: string;
      updated_at: string;
      updated_by: string | null;
    }>;
  });
