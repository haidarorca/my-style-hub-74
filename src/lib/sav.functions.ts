// ═══════════════════════════════════════════════════════════════
// CENTRE SAV — Server functions
//
// CRUD admin uniquement sur la table `sav_cases`.
// Trois indicateurs clés exploités côté UI :
//   - owner_party  : qui doit agir (kawzone / vendor / supplier / client)
//   - opened_at    : ancienneté du dossier
//   - financial_impact_amount : montant impacté
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadKawzoneScope, inScope } from "./kawzone-scope";

export type SavStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";
export type SavOwnerParty = "kawzone" | "vendor" | "supplier" | "client";
export type SavProblemType =
  | "stock_break"
  | "product_deleted"
  | "shop_deleted"
  | "dispute"
  | "payment_blocked"
  | "delivery_blocked"
  | "supplier_unavailable"
  | "other";

export interface SavCase {
  id: string;
  order_id: string;
  vendor_id: string | null;
  order_item_id: string | null;
  problem_type: SavProblemType;
  status: SavStatus;
  owner_party: SavOwnerParty;
  title: string;
  description: string | null;
  financial_impact_amount: number;
  financial_impact_currency: string;
  opened_at: string;
  closed_at: string | null;
  last_activity_at: string;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (!isAdmin && !isSuper) throw new Error("Forbidden: admin role required");
}

// ─── List SAV cases ─────────────────────────────────────────────
export const listSavCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    status?: SavStatus[] | null;
    owner_party?: SavOwnerParty[] | null;
    problem_type?: SavProblemType[] | null;
    include_closed?: boolean;
  } = {}) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const scope = await loadKawzoneScope(context.supabase);
    let q = context.supabase
      .from("sav_cases")
      .select("*")
      .order("opened_at", { ascending: false })
      .limit(2000);
    if (!data.include_closed) {
      q = q.in("status", data.status?.length ? data.status : ["open", "in_progress", "waiting", "resolved"]);
    } else if (data.status?.length) {
      q = q.in("status", data.status);
    }
    if (data.owner_party?.length) q = q.in("owner_party", data.owner_party);
    if (data.problem_type?.length) q = q.in("problem_type", data.problem_type);
    const { data: rows, error } = await q;
    if (error) throw error;
    // Périmètre Kawzone : Admin + Commission uniquement
    return inScope((rows ?? []) as SavCase[], scope, /* keepNull */ true);
  });

// ─── Create SAV case ───────────────────────────────────────────
export const createSavCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    order_id: string;
    vendor_id?: string | null;
    order_item_id?: string | null;
    problem_type: SavProblemType;
    owner_party: SavOwnerParty;
    title: string;
    description?: string | null;
    financial_impact_amount?: number;
    financial_impact_currency?: string;
    assigned_to?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("sav_cases")
      .insert({
        order_id: data.order_id,
        vendor_id: data.vendor_id ?? null,
        order_item_id: data.order_item_id ?? null,
        problem_type: data.problem_type,
        owner_party: data.owner_party,
        title: data.title,
        description: data.description ?? null,
        financial_impact_amount: data.financial_impact_amount ?? 0,
        financial_impact_currency: data.financial_impact_currency ?? "XOF",
        assigned_to: data.assigned_to ?? null,
        created_by: context.userId,
        last_activity_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;
    return row as SavCase;
  });

// ─── Update SAV case ───────────────────────────────────────────
export const updateSavCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    status?: SavStatus;
    owner_party?: SavOwnerParty;
    title?: string;
    description?: string | null;
    financial_impact_amount?: number;
    financial_impact_currency?: string;
    assigned_to?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const patch: Partial<SavCase> = {
      last_activity_at: new Date().toISOString(),
    };
    if (data.status !== undefined) {
      patch.status = data.status;
      patch.closed_at = (data.status === "closed" || data.status === "resolved")
        ? new Date().toISOString()
        : null;
    }
    if (data.owner_party !== undefined) patch.owner_party = data.owner_party;
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.financial_impact_amount !== undefined) patch.financial_impact_amount = data.financial_impact_amount;
    if (data.financial_impact_currency !== undefined) patch.financial_impact_currency = data.financial_impact_currency;
    if (data.assigned_to !== undefined) patch.assigned_to = data.assigned_to;
    const { data: row, error } = await context.supabase
      .from("sav_cases")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row as SavCase;
  });

