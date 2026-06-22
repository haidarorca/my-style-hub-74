// ═══════════════════════════════════════════════════════════════
// SAV Workflow — server functions complètes
//
// Toutes les actions Client / Vendeur / Admin sur les dossiers SAV.
// Le client soumet, le vendeur propose, l'administration décide.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ───── Types partagés ─────
export type SavCaseType =
  | "cancellation" | "return" | "exchange" | "warranty"
  | "dispute" | "refund" | "credit_note" | "admin_exception" | "other";

export type SavStatus =
  | "open" | "in_progress" | "waiting" | "resolved" | "closed"
  | "draft" | "in_review" | "vendor_responded" | "in_arbitration"
  | "accepted" | "refused" | "partially_accepted" | "in_execution"
  | "waiting_client" | "waiting_vendor" | "escalated" | "reopened";

export type SavResolution =
  | "refund" | "exchange" | "repair" | "credit"
  | "replacement" | "partial_refund" | "none";

export type SavVendorRecommendation =
  | "accept" | "refuse" | "propose_refund" | "propose_exchange" | "propose_other" | "none";

export type SavAdminDecision =
  | "pending" | "accepted" | "refused" | "partially_accepted" | "escalated" | "overridden";

export type SavParty = "client" | "vendor" | "admin" | "system";

export interface SavCaseRow {
  id: string;
  order_id: string;
  order_item_id: string | null;
  vendor_id: string | null;
  case_type: SavCaseType;
  problem_type: string;
  status: SavStatus;
  scope: "item" | "order";
  title: string;
  description: string | null;
  requested_resolution: SavResolution;
  decided_resolution: SavResolution | null;
  requested_by_party: SavParty;
  vendor_recommendation: SavVendorRecommendation;
  vendor_recommendation_note: string | null;
  vendor_responded_at: string | null;
  admin_decision: SavAdminDecision;
  admin_decision_reason: string | null;
  admin_decided_at: string | null;
  admin_decided_by: string | null;
  sla_deadline_at: string | null;
  client_visible: boolean;
  evidence_count: number;
  financial_impact_amount: number;
  financial_impact_currency: string;
  opened_at: string;
  closed_at: string | null;
  resolved_at: string | null;
  last_activity_at: string;
  assigned_to: string | null;
  created_by: string | null;
  on_behalf_of_user_id: string | null;
  rules_snapshot: any;
}

// ───── Helpers ─────
async function assertAdmin(sb: any, uid: string) {
  const { data: isAdmin } = await sb.rpc("has_role", { _user_id: uid, _role: "admin" });
  const { data: isSuper } = await sb.rpc("is_super_admin", { _user_id: uid });
  if (!isAdmin && !isSuper) throw new Error("Forbidden: admin requis");
  return Boolean(isSuper);
}

async function assertAdminPerm(sb: any, uid: string, perm: string) {
  const { data: ok } = await sb.rpc("has_admin_permission", { _user_id: uid, _perm: perm });
  if (!ok) throw new Error(`Permission requise : ${perm}`);
}

async function logAction(sb: any, params: {
  case_id: string;
  actor_id: string;
  actor_role: SavParty;
  action_type: string;
  from_state?: unknown;
  to_state?: unknown;
  note?: string | null;
}) {
  await sb.from("sav_actions").insert({
    case_id: params.case_id,
    actor_id: params.actor_id,
    actor_role: params.actor_role,
    action_type: params.action_type,
    from_state: params.from_state ?? null,
    to_state: params.to_state ?? null,
    note: params.note ?? null,
  });
  await sb.from("sav_cases").update({ last_activity_at: new Date().toISOString() }).eq("id", params.case_id);
}

async function resolveRules(sb: any, productId: string | null, countryId: string | null, shopId: string | null) {
  const { data } = await sb.rpc("resolve_sav_rules", {
    _product_id: productId,
    _destination_country_id: countryId,
    _shop_id: shopId,
  });
  // returns array of { rule_key, value, source_scope }
  const map: Record<string, any> = {};
  for (const r of (data ?? []) as any[]) {
    map[r.rule_key] = r.value;
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════

export const openSavCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    order_id: string;
    order_item_id?: string | null;
    case_type: SavCaseType;
    requested_resolution: SavResolution;
    title: string;
    description?: string | null;
    problem_type?: string;
    on_behalf_of_user_id?: string | null; // admin only
  }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const isOnBehalf = Boolean(data.on_behalf_of_user_id);

    // Si on_behalf → vérifier admin
    if (isOnBehalf) {
      await assertAdmin(sb, context.userId);
    }

    // Vérifier que l'order appartient bien à l'auteur (sauf admin on_behalf)
    const { data: order, error: oErr } = await sb
      .from("orders")
      .select("id, buyer_id, destination_country_id")
      .eq("id", data.order_id)
      .single();
    if (oErr || !order) throw new Error("Commande introuvable");

    if (!isOnBehalf && (order as any).buyer_id !== context.userId) {
      const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      if (!isAdmin) throw new Error("Cette commande ne vous appartient pas");
    }

    let vendorId: string | null = null;
    let productId: string | null = null;
    if (data.order_item_id) {
      const { data: oi } = await sb
        .from("order_items")
        .select("vendor_id, product_id")
        .eq("id", data.order_item_id)
        .single();
      if (oi) {
        vendorId = (oi as any).vendor_id ?? null;
        productId = (oi as any).product_id ?? null;
      }
    }

    const rules = await resolveRules(sb, productId, (order as any).destination_country_id ?? null, vendorId);

    if (data.case_type === "return" && rules.returns_enabled === false) {
      throw new Error("Les retours ne sont pas autorisés pour ce produit");
    }
    if (data.case_type === "exchange" && rules.exchanges_enabled === false) {
      throw new Error("Les échanges ne sont pas autorisés pour ce produit");
    }
    if (data.case_type === "warranty" && rules.warranty_enabled === false) {
      throw new Error("Aucune garantie sur ce produit");
    }

    const sla = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

    const insert: any = {
      order_id: data.order_id,
      order_item_id: data.order_item_id ?? null,
      vendor_id: vendorId,
      case_type: data.case_type,
      problem_type: data.problem_type ?? "other",
      status: "open",
      scope: data.order_item_id ? "item" : "order",
      owner_party: "vendor",
      title: data.title,
      description: data.description ?? null,
      requested_resolution: data.requested_resolution,
      requested_by_party: isOnBehalf ? "admin" : "client",
      vendor_recommendation: "none",
      admin_decision: "pending",
      client_visible: true,
      sla_deadline_at: sla,
      rules_snapshot: rules,
      created_by: context.userId,
      on_behalf_of_user_id: data.on_behalf_of_user_id ?? null,
      last_activity_at: new Date().toISOString(),
    };

    const { data: row, error } = await sb.from("sav_cases").insert(insert).select("*").single();
    if (error) throw error;

    await logAction(sb, {
      case_id: (row as any).id,
      actor_id: context.userId,
      actor_role: isOnBehalf ? "admin" : "client",
      action_type: isOnBehalf ? "open" : "open",
      to_state: { status: "open", case_type: data.case_type },
      note: isOnBehalf ? "Dossier ouvert par l'administration pour le client" : null,
    });

    return row as SavCaseRow;
  });

export const listMyCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sav_cases")
      .select("*")
      .or(`on_behalf_of_user_id.eq.${context.userId},order_id.in.(select id from orders where buyer_id = '${context.userId}')`)
      .order("opened_at", { ascending: false })
      .limit(500);
    // Fallback: do two queries since the embedded subquery syntax above may not work
    if (error) {
      const { data: byBuyer } = await context.supabase
        .from("orders").select("id").eq("buyer_id", context.userId);
      const orderIds = (byBuyer ?? []).map((o: any) => o.id);
      const { data: rows } = await context.supabase
        .from("sav_cases")
        .select("*")
        .or(`order_id.in.(${orderIds.join(",") || "00000000-0000-0000-0000-000000000000"}),on_behalf_of_user_id.eq.${context.userId}`)
        .order("opened_at", { ascending: false });
      return (rows ?? []) as SavCaseRow[];
    }
    return (data ?? []) as SavCaseRow[];
  });

// ═══════════════════════════════════════════════════════════════
// VENDEUR
// ═══════════════════════════════════════════════════════════════

export const listMyShopCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sav_cases")
      .select("*")
      .eq("vendor_id", context.userId)
      .order("opened_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as SavCaseRow[];
  });

export const vendorRecommend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    case_id: string;
    recommendation: SavVendorRecommendation;
    note?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: c, error } = await sb.from("sav_cases").select("*").eq("id", data.case_id).single();
    if (error || !c) throw new Error("Dossier introuvable");
    if ((c as any).vendor_id !== context.userId) throw new Error("Forbidden");

    const { error: uErr } = await sb.from("sav_cases").update({
      vendor_recommendation: data.recommendation,
      vendor_recommendation_note: data.note ?? null,
      vendor_responded_at: new Date().toISOString(),
      status: "vendor_responded" as SavStatus,
    }).eq("id", data.case_id);
    if (uErr) throw uErr;

    await logAction(sb, {
      case_id: data.case_id,
      actor_id: context.userId,
      actor_role: "vendor",
      action_type: "vendor_recommend",
      from_state: { vendor_recommendation: (c as any).vendor_recommendation },
      to_state: { vendor_recommendation: data.recommendation },
      note: data.note ?? null,
    });
    return { ok: true };
  });

// ═══════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════

export const listAllCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    status?: SavStatus[] | null;
    case_type?: SavCaseType[] | null;
    vendor_id?: string | null;
    search?: string | null;
    include_closed?: boolean;
    from_date?: string | null;
    to_date?: string | null;
  } = {}) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase.from("sav_cases").select("*").order("opened_at", { ascending: false }).limit(2000);
    if (data.status?.length) q = q.in("status", data.status);
    else if (!data.include_closed) q = q.not("status", "in", "(closed)");
    if (data.case_type?.length) q = q.in("case_type", data.case_type);
    if (data.vendor_id) q = q.eq("vendor_id", data.vendor_id);
    if (data.from_date) q = q.gte("opened_at", data.from_date);
    if (data.to_date) q = q.lte("opened_at", data.to_date);
    if (data.search) q = q.or(`title.ilike.%${data.search}%,description.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as SavCaseRow[];
  });

export const adminDecide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    case_id: string;
    decision: SavAdminDecision;
    decided_resolution?: SavResolution | null;
    reason?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertAdminPerm(sb, context.userId, "sav_decide");
    const { data: c, error } = await sb.from("sav_cases").select("*").eq("id", data.case_id).single();
    if (error || !c) throw new Error("Dossier introuvable");

    const nextStatus: SavStatus = data.decision === "accepted" ? "accepted"
      : data.decision === "refused" ? "refused"
      : data.decision === "partially_accepted" ? "partially_accepted"
      : data.decision === "escalated" ? "escalated"
      : "in_arbitration";

    const { error: uErr } = await sb.from("sav_cases").update({
      admin_decision: data.decision,
      decided_resolution: data.decided_resolution ?? null,
      admin_decision_reason: data.reason ?? null,
      admin_decided_at: new Date().toISOString(),
      admin_decided_by: context.userId,
      status: nextStatus,
    }).eq("id", data.case_id);
    if (uErr) throw uErr;

    await logAction(sb, {
      case_id: data.case_id,
      actor_id: context.userId,
      actor_role: "admin",
      action_type: "admin_decide",
      from_state: { admin_decision: (c as any).admin_decision, status: (c as any).status },
      to_state: { admin_decision: data.decision, status: nextStatus, decided_resolution: data.decided_resolution },
      note: data.reason ?? null,
    });

    // Audit admin global
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("log_admin_action", {
      _action: "sav.decide",
      _target_type: "sav_case",
      _target_id: data.case_id,
      _details: { decision: data.decision, resolution: data.decided_resolution },
    });
    return { ok: true };
  });

export const adminOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    case_id: string;
    decision: SavAdminDecision;
    decided_resolution?: SavResolution | null;
    reason: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertAdminPerm(sb, context.userId, "sav_override");
    const { data: c } = await sb.from("sav_cases").select("*").eq("id", data.case_id).single();
    if (!c) throw new Error("Dossier introuvable");

    await sb.from("sav_cases").update({
      admin_decision: "overridden",
      decided_resolution: data.decided_resolution ?? null,
      admin_decision_reason: data.reason,
      admin_decided_at: new Date().toISOString(),
      admin_decided_by: context.userId,
      status: data.decision === "accepted" ? "accepted" : data.decision === "refused" ? "refused" : "in_arbitration",
    }).eq("id", data.case_id);

    await logAction(sb, {
      case_id: data.case_id,
      actor_id: context.userId,
      actor_role: "admin",
      action_type: "admin_override",
      from_state: { admin_decision: (c as any).admin_decision, vendor_recommendation: (c as any).vendor_recommendation },
      to_state: { admin_decision: "overridden", forced: data.decision },
      note: data.reason,
    });
    return { ok: true };
  });

export const adminUpdateCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    case_id: string;
    status?: SavStatus;
    assigned_to?: string | null;
    title?: string;
    description?: string | null;
    financial_impact_amount?: number;
  }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertAdmin(sb, context.userId);
    const patch: any = { last_activity_at: new Date().toISOString() };
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "closed" || data.status === "resolved") {
        patch.closed_at = new Date().toISOString();
        if (data.status === "resolved") patch.resolved_at = new Date().toISOString();
      }
    }
    if (data.assigned_to !== undefined) patch.assigned_to = data.assigned_to;
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.financial_impact_amount !== undefined) patch.financial_impact_amount = data.financial_impact_amount;
    const { error } = await sb.from("sav_cases").update(patch).eq("id", data.case_id);
    if (error) throw error;
    await logAction(sb, {
      case_id: data.case_id,
      actor_id: context.userId,
      actor_role: "admin",
      action_type: "status_changed",
      to_state: patch,
    });
    return { ok: true };
  });

export const adminIssueRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    case_id: string;
    amount: number;
    currency?: string;
    method: "wave" | "orange_money" | "cash" | "bank_transfer" | "credit_note" | "other";
    direction?: "to_client" | "from_vendor" | "from_kawzone";
    reference?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertAdminPerm(sb, context.userId, "sav_refund_issue");
    const { data: refund, error } = await sb.from("sav_refunds").insert({
      case_id: data.case_id,
      amount: data.amount,
      currency: data.currency ?? "XOF",
      method: data.method,
      direction: data.direction ?? "to_client",
      status: "issued",
      reference: data.reference ?? null,
      issued_by: context.userId,
      issued_at: new Date().toISOString(),
    }).select("*").single();
    if (error) throw error;

    await logAction(sb, {
      case_id: data.case_id,
      actor_id: context.userId,
      actor_role: "admin",
      action_type: "refund_issued",
      to_state: { amount: data.amount, method: data.method, refund_id: (refund as any).id },
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("log_admin_action", {
      _action: "sav.refund_issue",
      _target_type: "sav_case",
      _target_id: data.case_id,
      _details: { amount: data.amount, method: data.method },
    });
    return refund;
  });

export const adminCreateExchange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    case_id: string;
    original_item_id: string;
    replacement_product_id: string;
    replacement_variant_id?: string | null;
    replacement_quantity?: number;
    delta_amount?: number;
    note?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertAdmin(sb, context.userId);
    const { data: ex, error } = await sb.from("sav_exchanges").insert({
      case_id: data.case_id,
      original_item_id: data.original_item_id,
      replacement_product_id: data.replacement_product_id,
      replacement_variant_id: data.replacement_variant_id ?? null,
      replacement_quantity: data.replacement_quantity ?? 1,
      delta_amount: data.delta_amount ?? 0,
      delta_currency: "XOF",
      status: "proposed",
      note: data.note ?? null,
      created_by: context.userId,
    }).select("*").single();
    if (error) throw error;

    await logAction(sb, {
      case_id: data.case_id,
      actor_id: context.userId,
      actor_role: "admin",
      action_type: "exchange_proposed",
      to_state: ex,
    });
    return ex;
  });

// ═══════════════════════════════════════════════════════════════
// MESSAGES (Client / Vendeur / Admin)
// ═══════════════════════════════════════════════════════════════

export const addSavMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    case_id: string;
    body: string;
    is_internal_note?: boolean;
  }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: c } = await sb.from("sav_cases").select("vendor_id, on_behalf_of_user_id, order_id").eq("id", data.case_id).single();
    if (!c) throw new Error("Dossier introuvable");

    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const role: SavParty = isAdmin
      ? "admin"
      : (c as any).vendor_id === context.userId
      ? "vendor"
      : "client";

    if (data.is_internal_note && role === "client") {
      throw new Error("Le client ne peut pas écrire de note interne");
    }

    const { error } = await sb.from("sav_messages").insert({
      case_id: data.case_id,
      sender_id: context.userId,
      sender_role: role,
      body: data.body,
      is_internal_note: Boolean(data.is_internal_note),
    });
    if (error) throw error;

    await logAction(sb, {
      case_id: data.case_id,
      actor_id: context.userId,
      actor_role: role,
      action_type: "message_added",
      note: data.body.slice(0, 200),
    });
    return { ok: true };
  });

export const listSavMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { case_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("sav_messages")
      .select("*")
      .eq("case_id", data.case_id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const listSavActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { case_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("sav_actions")
      .select("*")
      .eq("case_id", data.case_id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const listSavAttachments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { case_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("sav_attachments")
      .select("*")
      .eq("case_id", data.case_id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    // sign urls for the previews
    const out: any[] = [];
    for (const r of rows ?? []) {
      const { data: signed } = await context.supabase.storage
        .from("sav-evidence")
        .createSignedUrl((r as any).storage_path, 3600);
      out.push({ ...r, signed_url: signed?.signedUrl ?? null });
    }
    return out;
  });

export const registerSavAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    case_id: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
    caption?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: c } = await sb.from("sav_cases").select("vendor_id, on_behalf_of_user_id, order_id, evidence_count").eq("id", data.case_id).single();
    if (!c) throw new Error("Dossier introuvable");

    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const role: SavParty = isAdmin
      ? "admin"
      : (c as any).vendor_id === context.userId
      ? "vendor"
      : "client";

    const { error } = await sb.from("sav_attachments").insert({
      case_id: data.case_id,
      uploader_id: context.userId,
      uploader_role: role,
      storage_path: data.storage_path,
      mime_type: data.mime_type,
      size_bytes: data.size_bytes,
      caption: data.caption ?? null,
    });
    if (error) throw error;

    await sb.from("sav_cases").update({
      evidence_count: ((c as any).evidence_count ?? 0) + 1,
      last_activity_at: new Date().toISOString(),
    }).eq("id", data.case_id);

    await logAction(sb, {
      case_id: data.case_id,
      actor_id: context.userId,
      actor_role: role,
      action_type: "attachment_added",
      note: data.caption ?? null,
    });
    return { ok: true };
  });

// ═══════════════════════════════════════════════════════════════
// RULES (admin only)
// ═══════════════════════════════════════════════════════════════

export const listSavRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("sav_rules")
      .select("*")
      .order("scope", { ascending: true })
      .order("priority", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const upsertSavRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string | null;
    scope: "global" | "country" | "category" | "shop" | "product";
    scope_id?: string | null;
    rule_key: string;
    value: unknown;
    priority?: number;
    is_active?: boolean;
    note?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertAdminPerm(sb, context.userId, "sav_rules_manage");
    const payload: any = {
      scope: data.scope,
      scope_id: data.scope_id ?? null,
      rule_key: data.rule_key,
      value: data.value,
      priority: data.priority ?? 0,
      is_active: data.is_active ?? true,
      note: data.note ?? null,
      created_by: context.userId,
    };
    let row;
    if (data.id) {
      const { data: r, error } = await sb.from("sav_rules").update(payload).eq("id", data.id).select("*").single();
      if (error) throw error;
      row = r;
    } else {
      const { data: r, error } = await sb.from("sav_rules").insert(payload).select("*").single();
      if (error) throw error;
      row = r;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("log_admin_action", {
      _action: data.id ? "sav.rule_update" : "sav.rule_create",
      _target_type: "sav_rule",
      _target_id: (row as any).id,
      _details: payload as any,
    });
    return row;
  });

export const deleteSavRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdminPerm(context.supabase, context.userId, "sav_rules_manage");
    const { error } = await context.supabase.from("sav_rules").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const previewSavRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    product_id?: string | null;
    destination_country_id?: string | null;
    shop_id?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    return await resolveRules(
      context.supabase,
      data.product_id ?? null,
      data.destination_country_id ?? null,
      data.shop_id ?? null,
    );
  });
