import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission } from "./admin-auth.core";

const InputSchema = z.object({
  order_ids: z.array(z.string().uuid()).min(1).max(100),
});

const INCLUDED_STATUSES = ["new", "confirmed"] as const;

export type PrepCustomization = {
  order_id: string;
  order_short: string;
  customer_name: string | null;
  customer_phone: string | null;
  quantity: number;
  text: string | null;
  font: string | null;
  color: string | null;
  image_url: string | null;
};

export type PrepVariant = {
  key: string;
  size: string | null;
  color: string | null;
  variant_id: string | null;
  quantity: number;
  orders: { order_id: string; order_short: string; quantity: number }[];
};

export type PrepGroup = {
  key: string;
  product_id: string;
  product_name: string;
  product_code: string;
  product_image_url: string | null;
  vendor_id: string | null;
  vendor_shop_name: string | null;
  total_quantity: number;
  variants: PrepVariant[];
  customizations: PrepCustomization[];
  order_ids: string[];
};

export type PrepOrderInfo = {
  id: string;
  status: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  city: string | null;
  total: number;
  is_commission: boolean;
};

export type PrepResult = {
  mode: "vendor" | "admin";
  groups: PrepGroup[];
  orders: PrepOrderInfo[];
  skipped_orders: number;
};

type ItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  product_image_url: string | null;
  vendor_id: string;
  variant_id: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  customization: Record<string, any> | null;
};

function buildGroups(
  items: ItemRow[],
  orderMap: Map<string, PrepOrderInfo>,
  vendorMap: Map<string, string | null>,
  mode: "vendor" | "admin",
): PrepGroup[] {
  const groupsMap = new Map<string, PrepGroup>();

  for (const it of items) {
    const groupKey = mode === "admin" ? `${it.vendor_id}::${it.product_id}` : it.product_id;
    let g = groupsMap.get(groupKey);
    if (!g) {
      g = {
        key: groupKey,
        product_id: it.product_id,
        product_name: it.product_name,
        product_code: it.product_code,
        product_image_url: it.product_image_url,
        vendor_id: mode === "admin" ? it.vendor_id : null,
        vendor_shop_name: mode === "admin" ? vendorMap.get(it.vendor_id) ?? null : null,
        total_quantity: 0,
        variants: [],
        customizations: [],
        order_ids: [],
      };
      groupsMap.set(groupKey, g);
    }

    const order = orderMap.get(it.order_id);
    const orderShort = it.order_id.slice(0, 8);
    g.total_quantity += it.quantity;
    if (!g.order_ids.includes(it.order_id)) g.order_ids.push(it.order_id);

    const c = it.customization ?? {};
    const hasCustom = !!(c.text || c.image_url);

    if (hasCustom) {
      g.customizations.push({
        order_id: it.order_id,
        order_short: orderShort,
        customer_name: order?.customer_name ?? null,
        customer_phone: order?.customer_phone ?? null,
        quantity: it.quantity,
        text: c.text ?? null,
        font: c.font ?? null,
        color: c.color ?? null,
        image_url: c.image_url ?? null,
      });
    } else {
      const variantKey = it.variant_id ?? `${it.size ?? "-"}::${it.color ?? "-"}`;
      let v = g.variants.find((x) => x.key === variantKey);
      if (!v) {
        v = {
          key: variantKey,
          size: it.size,
          color: it.color,
          variant_id: it.variant_id,
          quantity: 0,
          orders: [],
        };
        g.variants.push(v);
      }
      v.quantity += it.quantity;
      v.orders.push({ order_id: it.order_id, order_short: orderShort, quantity: it.quantity });
    }
  }

  // Sort: groups by name, variants by size/color, customizations by order
  const groups = Array.from(groupsMap.values());
  groups.sort((a, b) => a.product_name.localeCompare(b.product_name));
  for (const g of groups) {
    g.variants.sort((a, b) =>
      `${a.size ?? ""}${a.color ?? ""}`.localeCompare(`${b.size ?? ""}${b.color ?? ""}`),
    );
  }
  return groups;
}


export const getVendorPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PrepResult> => {
    const userId = context.userId;

    const { data: orders, error: e1 } = await supabaseAdmin
      .from("orders")
      .select("id, status, created_at, customer_name, customer_phone, address, city, total, is_commission")
      .in("id", data.order_ids)
      .in("status", INCLUDED_STATUSES as unknown as string[]);
    if (e1) throw new Error(e1.message);

    const orderMap = new Map<string, PrepOrderInfo>();
    for (const o of orders ?? []) orderMap.set(o.id, o as PrepOrderInfo);

    const validIds = Array.from(orderMap.keys());
    if (validIds.length === 0) {
      return { mode: "vendor", groups: [], orders: [], skipped_orders: data.order_ids.length };
    }

    const { data: items, error: e2 } = await supabaseAdmin
      .from("order_items")
      .select(
        "id, order_id, product_id, product_name, product_code, product_image_url, vendor_id, variant_id, size, color, quantity, customization",
      )
      .in("order_id", validIds)
      .eq("vendor_id", userId);
    if (e2) throw new Error(e2.message);

    const groups = buildGroups((items ?? []) as ItemRow[], orderMap, new Map(), "vendor");

    // Only return orders that contain at least one item belonging to this vendor.
    const vendorOrderIds = new Set<string>((items ?? []).map((i) => i.order_id));
    const filteredOrders = Array.from(orderMap.values()).filter((o) => vendorOrderIds.has(o.id));

    return {
      mode: "vendor",
      groups,
      orders: filteredOrders,
      skipped_orders: data.order_ids.length - vendorOrderIds.size,
    };
  });

export const getAdminPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PrepResult> => {
    await assertPermission(context.userId, "orders");

    const { data: orders, error: e1 } = await supabaseAdmin
      .from("orders")
      .select("id, status, created_at, customer_name, customer_phone, address, city, total, is_commission")
      .in("id", data.order_ids)
      .in("status", INCLUDED_STATUSES as unknown as string[]);
    if (e1) throw new Error(e1.message);

    const orderMap = new Map<string, PrepOrderInfo>();
    for (const o of orders ?? []) orderMap.set(o.id, o as PrepOrderInfo);

    const validIds = Array.from(orderMap.keys());
    if (validIds.length === 0) {
      return { mode: "admin", groups: [], orders: [], skipped_orders: data.order_ids.length };
    }

    const { data: items, error: e2 } = await supabaseAdmin
      .from("order_items")
      .select(
        "id, order_id, product_id, product_name, product_code, product_image_url, vendor_id, variant_id, size, color, quantity, customization",
      )
      .in("order_id", validIds);
    if (e2) throw new Error(e2.message);

    const vendorIds = Array.from(new Set((items ?? []).map((i: any) => i.vendor_id)));
    const vendorMap = new Map<string, string | null>();
    if (vendorIds.length > 0) {
      const { data: vendors } = await supabaseAdmin
        .from("profiles")
        .select("id, shop_name, full_name")
        .in("id", vendorIds);
      for (const v of vendors ?? []) {
        vendorMap.set(v.id, v.shop_name ?? v.full_name ?? null);
      }
    }

    const groups = buildGroups((items ?? []) as ItemRow[], orderMap, vendorMap, "admin");

    return {
      mode: "admin",
      groups,
      orders: Array.from(orderMap.values()),
      skipped_orders: data.order_ids.length - validIds.length,
    };
  });

export const markOrdersInPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        order_ids: z.array(z.string().uuid()).min(1).max(100),
        mode: z.enum(["vendor", "admin"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.mode === "admin") {
      await assertPermission(context.userId, "orders");
      const { error } = await supabaseAdmin
        .from("orders")
        .update({ status: "confirmed" })
        .in("id", data.order_ids)
        .eq("status", "new");
      if (error) throw new Error(error.message);
    } else {
      // Vendor: ensure they own at least one item on each order, then update via their session
      const { data: rows } = await supabaseAdmin
        .from("order_items")
        .select("order_id")
        .in("order_id", data.order_ids)
        .eq("vendor_id", context.userId);
      const allowed = Array.from(new Set((rows ?? []).map((r: any) => r.order_id)));
      if (allowed.length === 0) return { ok: true, updated: 0 };
      const { error } = await supabaseAdmin
        .from("orders")
        .update({ status: "confirmed" })
        .in("id", allowed)
        .eq("status", "new");
      if (error) throw new Error(error.message);
      return { ok: true, updated: allowed.length };
    }
    return { ok: true, updated: data.order_ids.length };
  });
