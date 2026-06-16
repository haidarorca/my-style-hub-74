// ═══════════════════════════════════════════════════════════════
// COCKPIT EVENTS — Server functions (Phase B)
//
// API minimale append-only. Toutes les fonctions sont réservées
// aux admins (vérification has_role + super_admin) et passent par
// le client supabase authentifié (RLS appliqué).
//
// Aucune mise à jour, aucune suppression. Pour corriger une trace :
// emettre un nouvel événement (kawzone_error) + une décision
// compensatoire + des mouvements opposés.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type {
  OrderEvent,
  OrderDecision,
  FinancialMovement,
  OrderEventType,
  OrderDecisionType,
  FinancialMovementType,
  MovementDirection,
  CostAttribution,
  SubOrderAccounting,
} from "@/cockpit/lib/events";


// ─── Garde admin (utilisée par toutes les fns d'écriture) ──────

async function assertAdmin(supabase: any, userId: string): Promise<void> {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (!isAdmin && !isSuper) throw new Error("Forbidden: admin role required");
}


// ─── recordEvent ────────────────────────────────────────────────

export const recordEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    order_id: string;
    vendor_id?: string | null;
    order_item_id?: string | null;
    event_type: OrderEventType;
    reason?: string | null;
    payload?: Json;
  }) => input)

  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("order_events")
      .insert({
        order_id: data.order_id,
        vendor_id: data.vendor_id ?? null,
        order_item_id: data.order_item_id ?? null,
        event_type: data.event_type,
        reason: data.reason ?? null,
        payload: data.payload ?? {},
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row as OrderEvent;
  });

// ─── recordDecision ─────────────────────────────────────────────

export const recordDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    event_id: string;
    decision_type: OrderDecisionType;
    rationale?: string | null;
    payload?: Json;
    supersedes_decision_id?: string | null;
  }) => input)

  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    // T2 — Validation : les décisions à impact financier exigent un payload.amount > 0
    const FINANCIAL_DECISIONS: OrderDecisionType[] = [
      "issue_refund", "issue_credit_note", "apply_penalty",
      "replace_higher", "replace_lower",
    ];
    if (FINANCIAL_DECISIONS.includes(data.decision_type)) {
      const payload = (data.payload ?? {}) as Record<string, unknown>;
      const raw = payload.amount;
      const amt = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error(
          `Decision ${data.decision_type} requires payload.amount > 0 (received: ${String(raw)})`,
        );
      }
    }
    const { data: row, error } = await context.supabase
      .from("order_decisions")
      .insert({
        event_id: data.event_id,
        decision_type: data.decision_type,
        rationale: data.rationale ?? null,
        payload: data.payload ?? {},
        supersedes_decision_id: data.supersedes_decision_id ?? null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row as OrderDecision;
  });

// ─── recordMovement ─────────────────────────────────────────────

export const recordMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    decision_id: string;
    movement_type: FinancialMovementType;
    direction: MovementDirection;
    amount: number;
    currency?: string;
    cost_attribution?: CostAttribution;
    cost_split?: Json;
    method?: string | null;
    reference?: string | null;
    note?: string | null;
    occurred_at?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (!(data.amount >= 0)) throw new Error("Amount must be >= 0");
    const { data: row, error } = await context.supabase
      .from("financial_movements")
      .insert({
        decision_id: data.decision_id,
        movement_type: data.movement_type,
        direction: data.direction,
        amount: data.amount,
        currency: data.currency ?? "XOF",
        cost_attribution: data.cost_attribution ?? "kawzone",
        cost_split: data.cost_split ?? null,
        method: data.method ?? null,
        reference: data.reference ?? null,
        note: data.note ?? null,
        occurred_at: data.occurred_at ?? new Date().toISOString(),
        recorded_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row as FinancialMovement;
  });

// ─── Lecture historique d'une sous-commande ────────────────────

export const getSubOrderHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { order_id: string; vendor_id?: string | null }) => input)
  .handler(async ({ data, context }) => {
    let eventsQuery = context.supabase
      .from("order_events")
      .select("*")
      .eq("order_id", data.order_id)
      .order("created_at", { ascending: true });
    if (data.vendor_id !== undefined && data.vendor_id !== null) {
      eventsQuery = eventsQuery.eq("vendor_id", data.vendor_id);
    }
    const { data: events, error: e1 } = await eventsQuery;
    if (e1) throw e1;
    const eventIds = (events ?? []).map(e => e.id);

    const decisions = eventIds.length > 0
      ? (await context.supabase
          .from("order_decisions")
          .select("*")
          .in("event_id", eventIds)
          .order("created_at", { ascending: true })).data ?? []
      : [];

    const decisionIds = decisions.map(d => d.id);
    const movements = decisionIds.length > 0
      ? (await context.supabase
          .from("financial_movements")
          .select("*")
          .in("decision_id", decisionIds)
          .order("occurred_at", { ascending: true })).data ?? []
      : [];

    let accounting: SubOrderAccounting | null = null;
    if (data.vendor_id) {
      const { data: acc } = await context.supabase
        .from("v_sub_order_accounting")
        .select("*")
        .eq("order_id", data.order_id)
        .eq("vendor_id", data.vendor_id)
        .maybeSingle();
      accounting = (acc as SubOrderAccounting) ?? null;
    }

    return {
      events: (events ?? []) as OrderEvent[],
      decisions: decisions as OrderDecision[],
      movements: movements as FinancialMovement[],
      accounting,
    };
  });
