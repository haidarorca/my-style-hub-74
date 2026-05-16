import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ListSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  q: z.string().max(200).default(""),
  status: z.enum(["all", "new", "confirmed", "delivered", "cancelled"]).default("all"),
  country_id: z.string().uuid().nullable().default(null),
  is_commission: z.enum(["all", "yes", "no"]).default("all"),
  date_from: z.string().nullable().default(null),
  date_to: z.string().nullable().default(null),
});

export type AdminOrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  product_image_url: string | null;
  quantity: number;
  unit_price: number;
  size: string | null;
  color: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customization: Record<string, any> | null;
  commission_amount: number;
};

export type AdminOrderRow = {
  id: string;
  status: string;
  total: number;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  city: string | null;
  note: string | null;
  destination_country_id: string | null;
  is_commission: boolean;
  items: AdminOrderItem[];
};

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Accès refusé : admin requis");
}

export const listAdminOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabaseAdmin
      .from("orders")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.country_id) q = q.eq("destination_country_id", data.country_id);
    if (data.is_commission === "yes") q = q.eq("is_commission", true);
    if (data.is_commission === "no") q = q.eq("is_commission", false);
    if (data.date_from) q = q.gte("created_at", data.date_from);
    if (data.date_to) q = q.lte("created_at", data.date_to);

    if (data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(
        `customer_name.ilike.${term},customer_phone.ilike.${term},address.ilike.${term},city.ilike.${term}`,
      );
    }

    const { data: orders, error, count } = await q.range(from, to);
    if (error) throw new Error(error.message);

    const orderIds = (orders ?? []).map((o) => o.id);
    let items: AdminOrderItem[] = [];
    if (orderIds.length) {
      const { data: it } = await supabaseAdmin
        .from("order_items")
        .select(
          "id, order_id, product_id, product_name, product_code, product_image_url, quantity, unit_price, size, color, customization, commission_amount",
        )
        .in("order_id", orderIds);
      items = (it ?? []) as AdminOrderItem[];
    }

    // Aggregate totals (global, not just page) — cheap headcount only
    const { data: agg } = await supabaseAdmin
      .from("orders")
      .select("status, total");
    const totals = {
      revenue: 0,
      new: 0,
      confirmed: 0,
      delivered: 0,
      cancelled: 0,
    };
    for (const o of agg ?? []) {
      totals.revenue += Number(o.total ?? 0);
      const s = String(o.status ?? "new");
      if (s in totals) (totals as any)[s] += 1;
    }

    const rows: AdminOrderRow[] = (orders ?? []).map((o: any) => ({
      ...o,
      items: items.filter((i) => i.order_id === o.id),
    }));

    return { rows, total: count ?? 0, totals };
  });

export const updateAdminOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        order_id: z.string().uuid(),
        status: z.enum(["new", "confirmed", "delivered", "cancelled"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.order_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
