import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Resolve the target shop and ensure the calling user has the right to
 * manage it (vendor managing their own shop OR admin managing an admin-shop).
 */
async function assertShopAccess(shopId: string, userId: string) {
  // Owner?
  if (shopId === userId) return { isAdmin: false };

  // Admin / super_admin?
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);
  if (!roles || roles.length === 0) throw new Error("Accès refusé : vous ne gérez pas cette boutique.");

  const { data: shop } = await supabaseAdmin
    .from("profiles")
    .select("id, is_admin_shop")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop || !(shop as any).is_admin_shop) {
    throw new Error("Accès refusé : seuls les boutiques admin sont gérables ici.");
  }
  return { isAdmin: true };
}

export type ShopProductRow = {
  id: string;
  name: string;
  code: string;
  price: number;
  status: "pending" | "approved" | "rejected";
  is_active: boolean;
  rejection_reason: string | null;
  created_at: string;
  category_id: string | null;
  image_url: string | null;
  variant_count: number;
  stock_total: number;
  views_count: number;
  sales_count: number;
  revenue: number;
};

const ListInput = z.object({
  shopId: z.string().uuid(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.enum(["all", "pending", "approved", "rejected"]).default("all"),
  activeFilter: z.enum(["all", "active", "inactive"]).default("all"),
});

export const listShopProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListInput.parse(input))
  .handler(async ({ data, context }): Promise<{ rows: ShopProductRow[]; total: number; page: number; pageSize: number }> => {
    await assertShopAccess(data.shopId, context.userId);

    let q = supabaseAdmin
      .from("products")
      .select("id, name, code, price, status, is_active, rejection_reason, created_at, category_id, views_count", { count: "exact" })
      .eq("vendor_id", data.shopId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.activeFilter === "active") q = q.eq("is_active", true);
    if (data.activeFilter === "inactive") q = q.eq("is_active", false);
    if (data.search && data.search.length > 0) {
      const term = data.search.replace(/[%_]/g, "");
      q = q.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
    }

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: prods, count, error } = await q.range(from, to);
    if (error) throw new Error(error.message);

    const products = (prods ?? []) as Array<Omit<ShopProductRow, "image_url" | "variant_count" | "stock_total" | "sales_count" | "revenue">>;
    const productIds = products.map((p) => p.id);
    if (productIds.length === 0) {
      return { rows: [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
    }

    // Fetch images, variants and stats in parallel
    const [imagesRes, variantsRes, statsRes] = await Promise.all([
      supabaseAdmin
        .from("product_images")
        .select("product_id, url, position")
        .in("product_id", productIds)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("product_variants")
        .select("product_id, stock")
        .in("product_id", productIds),
      supabaseAdmin.rpc("get_shop_product_stats", { _vendor_id: data.shopId }),
    ]);

    const imageMap = new Map<string, string>();
    for (const img of (imagesRes.data ?? []) as { product_id: string; url: string; position: number }[]) {
      if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.url);
    }
    const variantMap = new Map<string, { count: number; stock: number }>();
    for (const v of (variantsRes.data ?? []) as { product_id: string; stock: number }[]) {
      const cur = variantMap.get(v.product_id) ?? { count: 0, stock: 0 };
      cur.count += 1;
      cur.stock += v.stock ?? 0;
      variantMap.set(v.product_id, cur);
    }
    const statsMap = new Map<string, { sales: number; revenue: number }>();
    for (const s of (statsRes.data ?? []) as { product_id: string; sales_count: number; revenue: number }[]) {
      statsMap.set(s.product_id, { sales: Number(s.sales_count ?? 0), revenue: Number(s.revenue ?? 0) });
    }

    const rows: ShopProductRow[] = products.map((p) => {
      const variants = variantMap.get(p.id);
      const stats = statsMap.get(p.id);
      return {
        ...p,
        price: Number(p.price ?? 0),
        image_url: imageMap.get(p.id) ?? null,
        variant_count: variants?.count ?? 0,
        stock_total: variants?.stock ?? 0,
        views_count: Number(p.views_count ?? 0),
        sales_count: stats?.sales ?? 0,
        revenue: stats?.revenue ?? 0,
      };
    });

    return { rows, total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

export const toggleProductActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ productId: z.string().uuid(), isActive: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: prod } = await supabaseAdmin
      .from("products")
      .select("id, vendor_id")
      .eq("id", data.productId)
      .maybeSingle();
    if (!prod) throw new Error("Produit introuvable.");
    await assertShopAccess((prod as any).vendor_id as string, context.userId);

    const { error } = await supabaseAdmin
      .from("products")
      .update({ is_active: data.isActive })
      .eq("id", data.productId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteShopProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ productId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; alreadyDeleted?: boolean; message?: string }> => {
    try {
      if (!data?.productId) {
        return { ok: true, alreadyDeleted: true, message: "Produit déjà supprimé ou introuvable." };
      }
      const { data: prod, error: fetchErr } = await supabaseAdmin
        .from("products")
        .select("id, vendor_id")
        .eq("id", data.productId)
        .maybeSingle();
      if (fetchErr) {
        console.error("[deleteShopProduct] fetch error", fetchErr);
        return { ok: false, message: "Erreur lors de la vérification du produit." };
      }
      if (!prod) {
        return { ok: true, alreadyDeleted: true, message: "Produit déjà supprimé ou introuvable." };
      }
      await assertShopAccess((prod as any).vendor_id as string, context.userId);

      const { error } = await supabaseAdmin.from("products").delete().eq("id", data.productId);
      if (error) {
        console.error("[deleteShopProduct] delete error", error);
        return { ok: false, message: error.message };
      }
      return { ok: true };
    } catch (e: any) {
      console.error("[deleteShopProduct] unexpected", e);
      return { ok: false, message: e?.message ?? "Erreur inattendue lors de la suppression." };
    }
  });

export type ShopOverview = {
  shop_name: string | null;
  shop_logo_url: string | null;
  shop_banner_url: string | null;
  is_admin_shop: boolean;
  total_products: number;
  active_products: number;
  pending_products: number;
  rejected_products: number;
  total_sales_30d: number;
  total_revenue_30d: number;
};

export const getShopOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ shopId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ShopOverview> => {
    await assertShopAccess(data.shopId, context.userId);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("shop_name, shop_logo_url, shop_banner_url, is_admin_shop")
      .eq("id", data.shopId)
      .maybeSingle();

    const [{ count: totalProducts }, { count: activeProducts }, { count: pendingProducts }, { count: rejectedProducts }] = await Promise.all([
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", data.shopId),
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", data.shopId).eq("is_active", true).eq("status", "approved"),
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", data.shopId).eq("status", "pending"),
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", data.shopId).eq("status", "rejected"),
    ]);

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: salesRows } = await supabaseAdmin
      .from("order_items")
      .select("quantity, unit_price")
      .eq("vendor_id", data.shopId)
      .gte("created_at", since);
    const sales = (salesRows ?? []) as { quantity: number; unit_price: number }[];
    const total_sales_30d = sales.reduce((s, r) => s + (r.quantity ?? 0), 0);
    const total_revenue_30d = sales.reduce((s, r) => s + (r.quantity ?? 0) * Number(r.unit_price ?? 0), 0);

    return {
      shop_name: (profile as any)?.shop_name ?? null,
      shop_logo_url: (profile as any)?.shop_logo_url ?? null,
      shop_banner_url: (profile as any)?.shop_banner_url ?? null,
      is_admin_shop: !!(profile as any)?.is_admin_shop,
      total_products: totalProducts ?? 0,
      active_products: activeProducts ?? 0,
      pending_products: pendingProducts ?? 0,
      rejected_products: rejectedProducts ?? 0,
      total_sales_30d,
      total_revenue_30d,
    };
  });

/**
 * Compute the buyer-facing price for a base price (commission included),
 * BEFORE the product exists. Used by the new-product form preview.
 *
 * Reuses the existing pricing logic by looking up the best-matching
 * commission rule for the given vendor / category combination.
 */
export const previewDisplayPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      vendorId: z.string().uuid(),
      basePrice: z.number().min(0),
      categoryId: z.string().uuid().nullable().optional(),
      destinationCountryId: z.string().uuid().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    if (data.basePrice <= 0) {
      return { base_price: 0, final_price: 0, commission_rate: 0, commission_amount: 0 };
    }

    // Vendor in commission mode?
    const { data: vendor } = await supabaseAdmin
      .from("profiles")
      .select("vendor_mode, source_country_id")
      .eq("id", data.vendorId)
      .maybeSingle();
    const mode = (vendor as any)?.vendor_mode as string | undefined;
    if (mode !== "commission") {
      return { base_price: data.basePrice, final_price: data.basePrice, commission_rate: 0, commission_amount: 0 };
    }

    // Find best-matching commission rule. Prefer category-specific over vendor-wide over global.
    const { data: rules } = await supabaseAdmin
      .from("commission_rules")
      .select("id, scope, vendor_id, category_id, destination_country_id, source_country_id, rate_percent, is_enabled")
      .eq("is_enabled", true);

    const source = (vendor as any)?.source_country_id ?? null;
    const dest = data.destinationCountryId ?? null;

    const candidates = ((rules ?? []) as Array<{
      id: string; scope: string; vendor_id: string | null; category_id: string | null;
      destination_country_id: string | null; source_country_id: string | null;
      rate_percent: number; is_enabled: boolean;
    }>).filter((r) => {
      if (r.vendor_id && r.vendor_id !== data.vendorId) return false;
      if (r.category_id && r.category_id !== data.categoryId) return false;
      if (r.source_country_id && r.source_country_id !== source) return false;
      if (r.destination_country_id && r.destination_country_id !== dest) return false;
      return true;
    });

    // Specificity score
    const scored = candidates.map((r) => ({
      r,
      score:
        (r.vendor_id ? 8 : 0) +
        (r.category_id ? 4 : 0) +
        (r.destination_country_id ? 2 : 0) +
        (r.source_country_id ? 1 : 0),
    }));
    scored.sort((a, b) => b.score - a.score);
    const rule = scored[0]?.r;
    const rate = Number(rule?.rate_percent ?? 0);
    const commission_amount = (data.basePrice * rate) / 100;
    return {
      base_price: data.basePrice,
      final_price: data.basePrice + commission_amount,
      commission_rate: rate,
      commission_amount,
    };
  });
