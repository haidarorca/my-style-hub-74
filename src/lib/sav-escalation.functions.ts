// ═══════════════════════════════════════════════════════════════
// SAV ESCALATION — Pont métier Cockpit → SAV
//
// Fonction unique qui matérialise la chaîne :
//   Événement → Décision → Dossier SAV (+ mouvement optionnel)
//
// C'est le point d'entrée pour transformer un problème détecté
// dans le Cockpit en dossier suivi dans le Centre SAV, sans
// dupliquer la saisie.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  OrderEventType, OrderDecisionType, FinancialMovementType,
  MovementDirection, CostAttribution,
} from "@/cockpit/lib/events";
import type { SavOwnerParty, SavProblemType } from "@/lib/sav.functions";

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (!isAdmin && !isSuper) throw new Error("Forbidden");
}

/**
 * Escalade un problème en un dossier SAV unique, en créant en cascade :
 *  1. order_events  (trace l'observation)
 *  2. order_decisions (trace la décision : escalade SAV)
 *  3. sav_cases (dossier suivi avec propriétaire + impact)
 *  4. financial_movements (optionnel, si impact monétaire connu)
 *
 * Toutes les écritures sont liées par leurs IDs : on peut remonter
 * d'un dossier SAV vers l'événement déclencheur et inversement.
 */
export const escalateToSav = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    order_id: string;
    vendor_id?: string | null;
    order_item_id?: string | null;
    // Événement source
    event_type: OrderEventType;
    event_reason?: string | null;
    // Dossier SAV
    problem_type: SavProblemType;
    owner_party: SavOwnerParty;
    title: string;
    description?: string | null;
    financial_impact_amount?: number;
    financial_impact_currency?: string;
    // Mouvement financier optionnel (si la décision a un impact immédiat)
    movement?: {
      type: FinancialMovementType;
      direction: MovementDirection;
      amount: number;
      currency?: string;
      cost_attribution?: CostAttribution;
      note?: string | null;
    } | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    // 1. Event
    const { data: evt, error: e1 } = await sb
      .from("order_events")
      .insert({
        order_id: data.order_id,
        vendor_id: data.vendor_id ?? null,
        order_item_id: data.order_item_id ?? null,
        event_type: data.event_type,
        reason: data.event_reason ?? data.title,
        payload: { escalated_to_sav: true },
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (e1) throw e1;

    // 2. Decision
    const decisionType: OrderDecisionType = "escalate_sav" as OrderDecisionType;
    const { data: dec, error: e2 } = await sb
      .from("order_decisions")
      .insert({
        event_id: (evt as any).id,
        decision_type: decisionType,
        rationale: data.title,
        payload: { owner_party: data.owner_party, problem_type: data.problem_type },
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (e2) throw e2;

    // 3. SAV case (référence l'event_id et decision_id dans la description structurée)
    const { data: sav, error: e3 } = await sb
      .from("sav_cases")
      .insert({
        order_id: data.order_id,
        vendor_id: data.vendor_id ?? null,
        order_item_id: data.order_item_id ?? null,
        problem_type: data.problem_type,
        owner_party: data.owner_party,
        status: "open",
        title: data.title,
        description: data.description ?? null,
        financial_impact_amount: data.financial_impact_amount ?? 0,
        financial_impact_currency: data.financial_impact_currency ?? "XOF",
        source_event_id: (evt as any).id,
        source_decision_id: (dec as any).id,
        created_by: context.userId,
        last_activity_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (e3) throw e3;

    // 4. Movement (facultatif)
    let movementId: string | null = null;
    if (data.movement && data.movement.amount > 0) {
      const { data: mv, error: e4 } = await sb
        .from("financial_movements")
        .insert({
          decision_id: (dec as any).id,
          movement_type: data.movement.type,
          direction: data.movement.direction,
          amount: data.movement.amount,
          currency: data.movement.currency ?? "XOF",
          cost_attribution: data.movement.cost_attribution ?? "kawzone",
          note: data.movement.note ?? data.title,
          occurred_at: new Date().toISOString(),
          recorded_by: context.userId,
        })
        .select("id")
        .single();
      if (e4) throw e4;
      movementId = (mv as any).id;
    }

    return {
      event_id: (evt as any).id,
      decision_id: (dec as any).id,
      sav_case: sav,
      movement_id: movementId,
    };
  });
