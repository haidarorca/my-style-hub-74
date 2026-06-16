// ═══════════════════════════════════════════════════════════════
// ARCHIVE — Server functions (lecture seule)
//
// Une sous-commande est considérée archivable quand :
//   - son statut est terminal (delivered, cancelled)
//   - ET elle n'a aucun dossier SAV ouvert
//   - ET elle n'a plus d'engagement financier en cours
//     (outstanding_to_refund_client / credit_to_issue / commission_to_remit_vendor = 0)
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (!isAdmin && !isSuper) throw new Error("Forbidden: admin role required");
}

export interface ArchiveRow {
  order_id: string;
  vendor_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  status: string | null;
  total: number;
  closed_at: string;
  shop_name: string | null;
  gross_value: number;
  net_value: number;
  loss_value: number;
  refunded_value: number;
}

// ─── listArchive ───────────────────────────────────────────────
export const listArchive = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    from?: string | null;
    to?: string | null;
    status?: "delivered" | "cancelled" | "all";
    search?: string | null;
    limit?: number;
  } = {}) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    // 1) Orders terminales
    let oq = context.supabase
      .from("orders")
      .select("id, status, total, customer_name, customer_phone, created_at")
      .in("status", data.status === "delivered" ? ["delivered"]
                  : data.status === "cancelled" ? ["cancelled"]
                  : ["delivered", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 500, 2000));
    if (data.from) oq = oq.gte("created_at", data.from);
    if (data.to) oq = oq.lte("created_at", data.to);
    if (data.search) {
      const s = `%${data.search}%`;
      oq = oq.or(`customer_name.ilike.${s},customer_phone.ilike.${s}`);
    }
    const { data: orders, error: e1 } = await oq;
    if (e1) throw e1;
    if (!orders?.length) return [] as ArchiveRow[];
    const orderIds = orders.map((o: any) => o.id);

    // 2) Dossiers SAV ouverts → exclus
    const { data: openSav } = await context.supabase
      .from("sav_cases")
      .select("order_id")
      .in("order_id", orderIds)
      .neq("status", "closed");
    const blocked = new Set((openSav ?? []).map((s: any) => s.order_id));

    // 3) Vue agrégée pour engagements + valeurs
    const { data: acc } = await context.supabase
      .from("v_sub_order_accounting")
      .select("*")
      .in("order_id", orderIds);
    const accBy = new Map<string, any>();
    for (const a of acc ?? []) accBy.set(`${a.order_id}::${a.vendor_id}`, a);

    // 4) Shops par vendor
    const vendorIds = Array.from(new Set((acc ?? []).map((a: any) => a.vendor_id))).filter(Boolean);
    const { data: profiles } = vendorIds.length
      ? await context.supabase.from("profiles").select("id, shop_name").in("id", vendorIds)
      : { data: [] as any[] };
    const shopBy = new Map((profiles ?? []).map((p: any) => [p.id, p.shop_name]));

    const rows: ArchiveRow[] = [];
    for (const o of orders) {
      if (blocked.has(o.id)) continue;
      // Sous-commandes pour cette order
      const subs = (acc ?? []).filter((a: any) => a.order_id === o.id);
      if (subs.length === 0) {
        rows.push({
          order_id: o.id, vendor_id: "—", customer_name: o.customer_name,
          customer_phone: o.customer_phone, status: o.status, total: Number(o.total ?? 0),
          closed_at: o.created_at, shop_name: null,
          gross_value: Number(o.total ?? 0), net_value: 0, loss_value: 0, refunded_value: 0,
        });
        continue;
      }
      for (const s of subs) {
        const hasPending =
          Number(s.outstanding_to_refund_client ?? 0) > 0 ||
          Number(s.outstanding_credit_to_issue ?? 0) > 0 ||
          Number(s.commission_to_remit_vendor ?? 0) > 0;
        if (hasPending) continue;
        rows.push({
          order_id: o.id,
          vendor_id: s.vendor_id,
          customer_name: o.customer_name,
          customer_phone: o.customer_phone,
          status: o.status,
          total: Number(o.total ?? 0),
          closed_at: o.created_at,
          shop_name: shopBy.get(s.vendor_id) ?? null,
          gross_value: Number(s.gross_value ?? 0),
          net_value: Number(s.net_value ?? 0),
          loss_value: Number(s.loss_value ?? 0),
          refunded_value: Number(s.refunded_value ?? 0),
        });
      }
    }
    return rows;
  });
