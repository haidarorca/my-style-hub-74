// ═══════════════════════════════════════════════════════════════
// RETURNS — Centre Retours & Annulations
//
// Module unique pour la gestion des dossiers Retour / Annulation.
// Philosophie : extrêmement simple. L'humain décide toujours, le
// système calcule, stocke et affiche.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type ReturnKind = Database["public"]["Enums"]["return_case_kind"];
export type ReturnStatus = Database["public"]["Enums"]["return_case_status"];
export type ReturnDecision = Database["public"]["Enums"]["return_case_decision"];

export type ReturnCaseRow = Database["public"]["Tables"]["return_cases"]["Row"];
export type ReturnCaseItem = Database["public"]["Tables"]["return_case_items"]["Row"];
export type ReturnCaseFee = Database["public"]["Tables"]["return_case_fees"]["Row"];

async function assertAdmin(sb: any, userId: string) {
  const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isSuper } = await sb.rpc("is_super_admin", { _user_id: userId });
  if (!isAdmin && !isSuper) throw new Error("Forbidden");
}

// ── Liste des dossiers ─────────────────────────────────────────
export const listReturnCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: ReturnStatus | "all"; kind?: ReturnKind | "all"; search?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("return_cases")
      .select("id, code, kind, status, decision, order_id, refund_suggested_xof, refund_final_xof, created_at, updated_at, closed_at, reason_code")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.kind && data.kind !== "all") q = q.eq("kind", data.kind);
    if (data.search) q = q.ilike("code", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ── Ouverture d'un dossier (atomique, 1 article par dossier) ──
// L'article est résolu côté serveur à partir de (order_id, product_id,
// variant_id) afin d'éviter les erreurs d'identifiant côté client.
export const openReturnCaseForArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    order_id: string;
    product_id: string;
    variant_id?: string | null;
    kind: ReturnKind;
    reason_note?: string | null;
    reason_code?: string | null;
  }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    // Résolution stricte du order_item correspondant à l'article cliqué.
    let q = sb
      .from("order_items")
      .select("id, quantity, unit_price")
      .eq("order_id", data.order_id)
      .eq("product_id", data.product_id);
    q = data.variant_id ? q.eq("variant_id", data.variant_id) : q.is("variant_id", null);
    const { data: oi, error: oiErr } = await q.maybeSingle();
    if (oiErr) throw oiErr;
    if (!oi) throw new Error("Article introuvable sur cette commande");

    // RPC atomique : crée le dossier + sa ligne en une seule transaction.
    const { data: caseId, error } = await sb.rpc("open_return_case_for_item", {
      _order_id: data.order_id,
      _order_item_id: (oi as any).id,
      _kind: data.kind,
      _quantity: (oi as any).quantity ?? 1,
      _unit_price_xof: Number((oi as any).unit_price ?? 0),
      _reason_note: data.reason_note ?? undefined,
      _reason_code: data.reason_code ?? undefined,
    });
    if (error) throw error;
    return { id: caseId as unknown as string };
  });

// ── Lecture détail d'un dossier (+ contexte commande) ─────────
export const getReturnCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    const { data: caseRow, error: cErr } = await sb
      .from("return_cases")
      .select("*")
      .eq("id", data.id)
      .single();
    if (cErr) throw cErr;

    const { data: items } = await sb
      .from("return_case_items")
      .select("*, order_item:order_items(id, product_id, product_name, quantity, unit_price, vendor_id)")
      .eq("case_id", data.id);

    const { data: fees } = await sb
      .from("return_case_fees")
      .select("*")
      .eq("case_id", data.id)
      .order("created_at", { ascending: true });

    const { data: order } = await sb
      .from("orders")
      .select("id, status, total, customer_name, customer_phone, address, created_at, buyer_id")
      .eq("id", caseRow.order_id)
      .single();

    const { data: orderItems } = await sb
      .from("order_items")
      .select("id, product_id, product_name, quantity, unit_price, vendor_id")
      .eq("order_id", caseRow.order_id);

    const { data: payments } = await sb
      .from("order_payments")
      .select("id, amount, method, reference, admin_name, created_at")
      .eq("order_id", caseRow.order_id)
      .order("created_at", { ascending: false });

    const { data: paymentSummary } = await sb
      .from("order_payment_summary")
      .select("total_paid, updated_at")
      .eq("order_id", caseRow.order_id)
      .maybeSingle();

    const { data: orderEvents } = await sb
      .from("order_events")
      .select("id, event_type, reason, payload, created_at, vendor_id, order_item_id")
      .eq("order_id", caseRow.order_id)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: statusHistory } = await sb
      .from("order_status_history")
      .select("id, from_status, to_status, created_at")
      .eq("order_id", caseRow.order_id)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: actions } = await sb
      .from("return_case_actions")
      .select("id, action, payload, actor_email, created_at")
      .eq("case_id", data.id)
      .order("created_at", { ascending: false })
      .limit(200);

    return {
      case: caseRow,
      items: items ?? [],
      fees: fees ?? [],
      order,
      order_items: orderItems ?? [],
      payments: payments ?? [],
      payment_summary: paymentSummary ?? null,
      order_events: orderEvents ?? [],
      status_history: statusHistory ?? [],
      actions: actions ?? [],
    };
  });


// ── Articles : ajout / suppression ────────────────────────────
export const addCaseItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { case_id: string; order_item_id: string; quantity: number; unit_price_xof: number }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("return_case_items").insert({
      case_id: data.case_id,
      order_item_id: data.order_item_id,
      quantity: data.quantity,
      unit_price_xof: data.unit_price_xof,
    });
    if (error) throw error;
    return { ok: true };
  });

export const removeCaseItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("return_case_items").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ── Frais : ajout / suppression ───────────────────────────────
export const addCaseFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { case_id: string; label: string; amount_xof: number }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.amount_xof < 0) throw new Error("Le montant doit être ≥ 0");
    const { error } = await context.supabase.from("return_case_fees").insert({
      case_id: data.case_id,
      label: data.label.trim(),
      amount_xof: data.amount_xof,
      created_by: context.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

export const removeCaseFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("return_case_fees").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ── Notes internes ────────────────────────────────────────────
export const updateCaseNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; internal_notes: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("return_cases")
      .update({ internal_notes: data.internal_notes })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ── Décision (l'humain garde la main) ─────────────────────────
export const decideReturnCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    decision: ReturnDecision;
    refund_final_xof: number;
    refund_method?: string | null;
  }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.refund_final_xof < 0) throw new Error("Le montant doit être ≥ 0");
    const { error } = await context.supabase
      .from("return_cases")
      .update({
        decision: data.decision,
        refund_final_xof: data.refund_final_xof,
        refund_method: data.refund_method ?? null,
        status: "decided",
        decided_at: new Date().toISOString(),
        decided_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ── Clôture / annulation du dossier ──────────────────────────
export const closeReturnCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("return_cases")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const cancelReturnCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("return_cases")
      .update({
        status: "cancelled",
        closed_at: new Date().toISOString(),
        closed_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
