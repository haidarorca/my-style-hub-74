// Relecture périodique des commandes CJ ouvertes (0 point) : statut, suivi.
// Ne touche jamais au statut KawZone ni au transport Chine → Sénégal.
import { cjGet } from "./client.server";

const CLOSED = ["DELIVERED", "CANCELLED"];

export async function syncOpenCjOrders(limit = 5) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 2 * 3600_000).toISOString();
  const { data: orders } = await (supabaseAdmin as any)
    .from("orders")
    .select("id, cj_order_id, cj_order_number, cj_order_code, cj_logistic_name, cj_shipped_at, cj_order_status")
    .not("cj_order_id", "is", null)
    .or(`cj_synced_at.is.null,cj_synced_at.lt.${since}`)
    .limit(limit * 3);
  let synced = 0;
  for (const o of (orders ?? []).filter((x: any) => !CLOSED.includes(x.cj_order_status)).slice(0, limit)) {
    try {
      const d = await cjGet<any>(`/shopping/order/getOrderDetail?orderId=${encodeURIComponent(o.cj_order_id)}`, []);
      const status: string | null = d?.orderStatus ?? null;
      const patch: Record<string, unknown> = {
        cj_order_status: status ?? o.cj_order_status,
        cj_order_number: d?.orderNum ?? o.cj_order_number,
        cj_order_code: d?.cjOrderCode ?? o.cj_order_code,
        cj_logistic_name: d?.logisticName ?? o.cj_logistic_name,
        cj_tracking_number: d?.trackNumber ?? null,
        cj_tracking_provider: d?.trackingProvider ?? null,
        cj_tracking_url: d?.trackingUrl ?? null,
        cj_synced_at: new Date().toISOString(),
        cj_last_error: null,
      };
      if (status) patch["cj_payment_status"] = ["CREATED", "IN_CART", "UNPAID"].includes(status) ? "UNPAID" : "PAID";
      if (status === "SHIPPED" || status === "DELIVERED") patch["cj_shipped_at"] = o.cj_shipped_at ?? new Date().toISOString();
      await (supabaseAdmin as any).from("orders").update(patch).eq("id", o.id);
      synced += 1;
    } catch (e) {
      await (supabaseAdmin as any).from("orders").update({
        cj_last_error: e instanceof Error ? e.message : "erreur", cj_synced_at: new Date().toISOString(),
      }).eq("id", o.id);
    }
  }
  return synced;
}
