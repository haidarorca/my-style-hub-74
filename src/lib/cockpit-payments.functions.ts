/* ═══════════════════════════════════════════════════════════════
   Cockpit Payments — Persistance Supabase des paiements
   ═══════════════════════════════════════════════════════════════ */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* ── Schemas Zod ── */

const CreatePaymentSchema = z.object({
  order_id: z.string().min(1),
  amount: z.number().positive(),
  method: z.string().min(1),
  reference: z.string().optional(),
  admin_name: z.string().optional(),
});

const OrderIdSchema = z.object({ order_id: z.string().min(1) });

const AuditSchema = z.object({
  order_id: z.string().min(1),
  action: z.string().min(1),
  admin_name: z.string().optional(),
  admin_id: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
});

/* ── Types ── */

export interface OrderPayment {
  id: string;
  order_id: string;
  amount: number;
  method: string;
  reference: string | null;
  admin_name: string;
  admin_id: string | null;
  created_at: string;
}

export interface PaymentAudit {
  id: string;
  order_id: string;
  action: string;
  admin_name: string;
  admin_id: string | null;
  details: string | null;
  created_at: string;
}

/* ── 1. Enregistrer un paiement ── */

export const createOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreatePaymentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const adminId = (context as any).userId ?? null;
    const adminName = data.admin_name || (context as any).claims?.email || "Admin";

    const { data: payment, error } = await (context.supabase as any)
      .from("order_payments")
      .insert({
        order_id: data.order_id,
        amount: data.amount,
        method: data.method,
        reference: data.reference || null,
        admin_name: adminName,
        admin_id: adminId,
      })
      .select()
      .single();

    if (error) {
      console.error("[createOrderPayment] Erreur:", error.message);
      throw new Error("Impossible d'enregistrer le paiement: " + error.message);
    }

    // Recalculer le total
    await recalcOrderPayment(data.order_id);

    // Audit direct
    await (context.supabase as any).from("payment_audit").insert({
      order_id: data.order_id,
      action: "Paiement enregistre",
      admin_name: adminName,
      admin_id: adminId,
      details: `${data.amount} FCFA via ${data.method}${data.reference ? " (Ref: " + data.reference + ")" : ""}`,
    });

    return payment as unknown as OrderPayment;
  });

/* ── 2. Lister les paiements d'une commande ── */

export const listOrderPayments = createServerFn({ method: "POST" })
  .inputValidator((input) => OrderIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: payments, error } = await (supabaseAdmin as any)
      .from("order_payments")
      .select("*")
      .eq("order_id", data.order_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[listOrderPayments] Erreur:", error.message);
      return [] as OrderPayment[];
    }

    return (payments ?? []) as unknown as OrderPayment[];
  });

/* ── 3. Lister les paiements de toutes les commandes ── */

export const listAllOrderPayments = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data: payments, error } = await (supabaseAdmin as any)
      .from("order_payments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[listAllOrderPayments] Erreur:", error.message);
      return [] as OrderPayment[];
    }

    return (payments ?? []) as unknown as OrderPayment[];
  });

/* ── 4. Audit — journal des actions ── */

export const createPaymentAudit = createServerFn({ method: "POST" })
  .inputValidator((input) => AuditSchema.parse(input))
  .handler(async ({ data }) => {
    const { error } = await (supabaseAdmin as any)
      .from("payment_audit")
      .insert({
        order_id: data.order_id,
        action: data.action,
        admin_name: data.admin_name || "Admin",
        admin_id: data.admin_id || null,
        details: data.details || null,
      });

    if (error) {
      console.error("[createPaymentAudit] Erreur:", error.message);
    }

    return { success: !error };
  });

/* ── 5. Lister l'audit d'une commande ── */

export const listPaymentAudit = createServerFn({ method: "POST" })
  .inputValidator((input) => OrderIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: audit, error } = await (supabaseAdmin as any)
      .from("payment_audit")
      .select("*")
      .eq("order_id", data.order_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[listPaymentAudit] Erreur:", error.message);
      return [] as PaymentAudit[];
    }

    return (audit ?? []) as unknown as PaymentAudit[];
  });

/* ── 6. Recalculer le total paye d'une commande ── */

async function recalcOrderPayment(orderId: string) {
  try {
    const { data: payments } = await (supabaseAdmin as any)
      .from("order_payments")
      .select("amount")
      .eq("order_id", orderId);

    const totalPaid = ((payments ?? []) as Array<{ amount: number | null }>).reduce((s, p) => s + (p.amount ?? 0), 0);

    await (supabaseAdmin as any)
      .from("order_payment_summary")
      .upsert({
        order_id: orderId,
        total_paid: totalPaid,
        updated_at: new Date().toISOString(),
      }, { onConflict: "order_id" });
  } catch (e) {
    console.error("[recalcOrderPayment] Erreur:", e);
  }
}

/* ── 7. Recuperer les articles d'une commande ── */

export interface VendorFullInfo {
  vendor_id: string;
  shop_name: string | null;
  owner_name: string | null;
  is_admin_shop: boolean;
  shop_type_label: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  whatsapp: string | null;
  shop_description: string | null;
  shop_hours: string | null;
  shop_logo_url: string | null;
  is_verified: boolean;
  vendor_mode: string | null;
}

export interface OrderItemDetail {
  product_id: string;
  product_name: string;
  designation: string | null;
  description: string | null;
  product_image: string | null;
  variant_image: string | null;
  all_images: string[];
  quantity: number;
  unit_price: number;
  line_total: number;
  variant_id: string | null;
  variant_label: string | null;
  size: string | null;
  color: string | null;
  color_hex: string | null;
  shop_id: string | null;
  shop_name: string | null;
  owner_name: string | null;
  is_admin_shop: boolean;
  shop_type_label: string | null;
  commission_rate: number | null;
  commission_amount: number | null;
  vendor: VendorFullInfo | null;
  origin_country: string | null;
  origin_country_flag: string | null;
}

export interface OrderItemsResult {
  items: OrderItemDetail[];
  order_total: number;
  vendor_summary: {
    vendor_id: string;
    vendor_name: string;
    shop_name: string;
    shop_type_label: string | null;
    item_count: number;
    total: number;
    is_admin: boolean;
  }[];
  error?: string | null;
}

export const getOrderItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => OrderIdSchema.parse(input))
  .handler(async ({ data }) => {
    console.log("[getOrderItems] order_id:", data.order_id);

    const { data: orderRow } = await supabaseAdmin
      .from("orders")
      .select("id, total, status, shipping_service_id, destination_country_id")
      .eq("id", data.order_id)
      .maybeSingle();

    const orderCountry: string | null = null;
    console.log("[getOrderItems] order total:", orderRow?.total, "destination_country_id:", orderRow?.destination_country_id);

    let orderItemsRaw: any[] = [];

    const { data: itemsFromDb, error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .select("product_id, product_name, product_code, product_image_url, variant_id, size, color, unit_price, quantity, vendor_id, commission_rate, commission_amount, customization")
      .eq("order_id", data.order_id);

    if (itemsErr) {
      console.error("[getOrderItems] order_items error:", itemsErr.message);
    } else if (itemsFromDb && itemsFromDb.length > 0) {
      orderItemsRaw = itemsFromDb;
      console.log("[getOrderItems] order_items found:", orderItemsRaw.length);
    }

    const productIds = orderItemsRaw.map(i => i.product_id).filter(Boolean) as string[];
    const variantIds = orderItemsRaw.map(i => i.variant_id).filter(Boolean) as string[];
    const vendorIds = orderItemsRaw.map(i => i.vendor_id).filter(Boolean) as string[];

    const [productsResult, variantsResult, vendorsResult, imagesResult] = await Promise.allSettled([
      productIds.length > 0
        ? supabaseAdmin.from("products").select("id, name, designation, description, vendor_id, price, weight_kg").in("id", productIds)
        : Promise.resolve({ data: [] }),
      variantIds.length > 0
        ? supabaseAdmin.from("product_variants").select("id, product_id, size, color, color_hex, image_url").in("id", variantIds)
        : Promise.resolve({ data: [] }),
      vendorIds.length > 0
        ? supabaseAdmin.from("profiles").select(
            "id, full_name, is_admin_shop, shop_name, phone, email, address, shop_description, shop_hours, shop_logo_url, is_verified, vendor_mode, source_country_id"
          ).in("id", vendorIds)
        : Promise.resolve({ data: [] }),
      productIds.length > 0
        ? supabaseAdmin.from("product_images").select("product_id, url").in("product_id", productIds).order("position", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    const products = (productsResult.status === "fulfilled" ? productsResult.value.data : []) ?? [];
    const variants = (variantsResult.status === "fulfilled" ? variantsResult.value.data : []) ?? [];
    const vendors = (vendorsResult.status === "fulfilled" ? vendorsResult.value.data : []) ?? [];
    const productImages = (imagesResult.status === "fulfilled" ? imagesResult.value.data : []) ?? [];

    // RÈGLE UNIQUE LOCAL vs IMPORT :
    //   import = destination_country_id ≠ vendor.source_country_id
    //   local  = même pays OU source vendeur inconnue
    const vendorById = new Map(vendors.map((v: any) => [v.id, v]));
    const orderDestId = (orderRow as any)?.destination_country_id ?? null;
    const importProductIds = new Set<string>();
    for (const p of products) {
      const v = vendorById.get((p as any).vendor_id);
      const src = (v as any)?.source_country_id ?? null;
      if (orderDestId && src && src !== orderDestId) {
        importProductIds.add((p as any).id);
      }
    }

    // Pays d'origine : récupéré via le vendeur du produit (profiles.source_country_id)
    const sourceCountryIds = Array.from(new Set(
      vendors.map((v: any) => v?.source_country_id).filter(Boolean)
    ));
    let countriesData: any[] = [];
    if (sourceCountryIds.length > 0) {
      const { data: cs } = await supabaseAdmin.from("countries").select("id, name, flag_emoji").in("id", sourceCountryIds);
      countriesData = cs ?? [];
    }
    const countryByIdMap = new Map(countriesData.map((c: any) => [c.id, { name: c.name, flag: c.flag_emoji ?? "" }]));
    const countryMap = new Map<string, { name: string; flag: string }>();
    for (const p of products) {
      if (!importProductIds.has((p as any).id)) continue;
      const v = vendorById.get((p as any).vendor_id);
      const cid = (v as any)?.source_country_id;
      const c = cid ? countryByIdMap.get(cid) : null;
      if (c) countryMap.set((p as any).id, c);
    }

    const productMap = new Map(products.map(p => [p.id, p]));
    const variantMap = new Map(variants.map(v => [v.id, v]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));

    const imageMap = new Map<string, string>();
    const allImagesMap = new Map<string, string[]>();
    for (const img of productImages) {
      if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.url);
      if (!allImagesMap.has(img.product_id)) allImagesMap.set(img.product_id, []);
      allImagesMap.get(img.product_id)!.push(img.url);
    }

    console.log("[getOrderItems] products:", products.length, "variants:", variants.length, "vendors:", vendors.length);

    const vendorGroups = new Map<string, {
      vendor_id: string; vendor_name: string; shop_name: string;
      shop_type_label: string | null; item_count: number; total: number; is_admin: boolean;
    }>();

    const detailedItems: OrderItemDetail[] = orderItemsRaw.map((it, idx) => {
      const prod = it.product_id ? productMap.get(it.product_id) : null;
      const variant = it.variant_id ? variantMap.get(it.variant_id) : null;
      const vid = it.vendor_id ?? prod?.vendor_id ?? null;
      const vendor = vid ? vendorMap.get(vid) : null;
      const qty = it.quantity ?? 1;
      const price = it.unit_price ?? prod?.price ?? 0;
      const lineTotal = qty * price;

      const prodName = it.product_name ?? prod?.name ?? (prod as any)?.designation ?? it.product_code ?? "Produit " + (idx + 1);

      const variantImage = variant?.image_url ?? null;
      const productImage = it.product_image_url ?? imageMap.get(it.product_id ?? "") ?? null;
      const mainImage = variantImage ?? productImage;

      const allImgs: string[] = [];
      if (variantImage) allImgs.push(variantImage);
      const prodImgs = allImagesMap.get(it.product_id ?? "") ?? [];
      for (const img of prodImgs) if (!allImgs.includes(img)) allImgs.push(img);

      const size = it.size ?? variant?.size ?? null;
      const color = it.color ?? variant?.color ?? null;
      const colorHex = variant?.color_hex ?? null;
      const variantLabel = size && color ? `${color} - ${size}` : color ?? size ?? null;

      const isAdmin = vendor?.is_admin_shop ?? false;
      const shopTypeLabel = isAdmin ? "Boutique Officielle" : "Boutique Vendeur";
      const shopName = vendor?.shop_name ?? vendor?.full_name ?? "Source inconnue";

      const vId = it.vendor_id ?? "unknown";
      const existing = vendorGroups.get(vId);
      if (existing) {
        existing.item_count += qty;
        existing.total += lineTotal;
      } else {
        vendorGroups.set(vId, {
          vendor_id: vId,
          vendor_name: vendor?.full_name ?? "—",
          shop_name: shopName,
          shop_type_label: shopTypeLabel,
          item_count: qty,
          total: lineTotal,
          is_admin: isAdmin,
        });
      }

      const productOriginCountry = countryMap.get(it.product_id ?? "");

      // TYPE DU PRODUIT : déterminé par la présence dans import_products
      // Produit dans import_products    → IMPORT (circuit international)
      // Produit PAS dans import_products → LOCAL (circuit local)
      const isImportProduct = importProductIds.has(it.product_id ?? "");
      const isLocalProduct = !isImportProduct;

      return {
        product_id: it.product_id ?? "",
        product_name: prodName,
        designation: (prod as any)?.designation ?? null,
        description: (prod as any)?.description ?? null,
        product_image: mainImage,
        variant_image: variantImage,
        all_images: allImgs,
        quantity: qty,
        unit_price: price,
        line_total: lineTotal,
        variant_id: it.variant_id ?? null,
        variant_label: variantLabel,
        size,
        color,
        color_hex: colorHex,
        shop_id: it.vendor_id ?? null,
        shop_name: shopName,
        owner_name: vendor?.full_name ?? null,
        is_admin_shop: isAdmin,
        shop_type_label: shopTypeLabel,
        commission_rate: it.commission_rate ?? (prod as any)?.commission_rate ?? null,
        commission_amount: it.commission_amount ?? null,
        is_import: isImportProduct,
        is_local: isLocalProduct,
        origin_country: productOriginCountry?.name ?? (isImportProduct ? orderCountry : null),
        origin_country_flag: productOriginCountry?.flag ?? null,
        vendor: it.vendor_id && vendor ? {
          vendor_id: it.vendor_id,
          shop_name: vendor.shop_name ?? null,
          owner_name: vendor.full_name ?? null,
          is_admin_shop: vendor.is_admin_shop ?? false,
          shop_type_label: (vendor.is_admin_shop ?? false) ? "Boutique Officielle" : "Boutique Vendeur",
          email: vendor.email ?? null,
          address: vendor.address ?? null,
          whatsapp: vendor.phone ?? null,
          shop_description: (vendor as any)?.shop_description ?? null,
          shop_hours: (vendor as any)?.shop_hours ?? null,
          shop_logo_url: (vendor as any)?.shop_logo_url ?? null,
          is_verified: (vendor as any)?.is_verified ?? false,
          vendor_mode: (vendor as any)?.vendor_mode ?? null,
        } : null,
      } as any;
    });

    const itemsTotal = detailedItems.reduce((s, i) => s + i.line_total, 0);

    return {
      items: detailedItems,
      order_total: itemsTotal > 0 ? itemsTotal : (orderRow?.total as number) ?? 0,
      vendor_summary: Array.from(vendorGroups.values()),
      error: null,
    } as any;
  });

/* ── 8. Recuperer le resume de paiement d'une commande ── */

export const getOrderPaymentSummary = createServerFn({ method: "POST" })
  .inputValidator((input) => OrderIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: summary, error } = await (supabaseAdmin as any)
      .from("order_payment_summary")
      .select("*")
      .eq("order_id", data.order_id)
      .maybeSingle();

    if (error) {
      console.error("[getOrderPaymentSummary] Erreur:", error.message);
      return { total_paid: 0 };
    }

    return summary ?? { total_paid: 0 };
  });

/* ═══════════════════════════════════════════════════════════════
   BATCH: Détermine le type (local/import/mixte) pour plusieurs
   commandes en analysant leurs articles
   ═══════════════════════════════════════════════════════════════ */

const OrderIdsBatchSchema = z.object({ order_ids: z.array(z.string().min(1)).max(100) });

export const getOrderTypesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => OrderIdsBatchSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.order_ids.length === 0) return {} as Record<string, "local" | "import" | "mixte">;

    // Étape 1: Charger order_items avec product_id ET les commandes pour destination
    const [{ data: itemsRaw }, { data: ordersRaw }] = await Promise.all([
      supabaseAdmin
        .from("order_items")
        .select("order_id, product_id, vendor_id")
        .in("order_id", data.order_ids),
      supabaseAdmin
        .from("orders")
        .select("id, destination_country_id")
        .in("id", data.order_ids),
    ]);

    const items = itemsRaw ?? [];
    const destByOrder = new Map<string, string | null>(
      (ordersRaw ?? []).map((o: any) => [o.id, o.destination_country_id ?? null])
    );

    // Étape 2: Charger les vendeurs pour leur source_country_id.
    const vendorIds = Array.from(new Set(items.map((it: any) => it.vendor_id).filter(Boolean))) as string[];
    const vendorSrcMap = new Map<string, string | null>();
    if (vendorIds.length > 0) {
      const { data: vs } = await supabaseAdmin
        .from("profiles")
        .select("id, source_country_id")
        .in("id", vendorIds);
      for (const v of vs ?? []) vendorSrcMap.set((v as any).id, (v as any).source_country_id ?? null);
    }

    // Étape 3: RÈGLE UNIQUE — import si destination_country_id ≠ vendor.source_country_id
    const orderItems = new Map<string, { is_import: boolean }[]>();
    for (const it of items) {
      const orderId = it.order_id as string;
      const dest = destByOrder.get(orderId) ?? null;
      const src = vendorSrcMap.get((it as any).vendor_id) ?? null;
      const isImport = !!(dest && src && dest !== src);
      if (!orderItems.has(orderId)) orderItems.set(orderId, []);
      orderItems.get(orderId)!.push({ is_import: isImport });
    }

    const result: Record<string, "local" | "import" | "mixte"> = {};
    for (const [orderId, types] of orderItems) {
      const hasImport = types.some(t => t.is_import);
      const hasLocal = types.some(t => !t.is_import);
      if (hasImport && hasLocal) result[orderId] = "mixte";
      else if (hasImport) result[orderId] = "import";
      else result[orderId] = "local";
    }

    // Commandes sans items détectables → "local" par défaut (le plus sûr,
    // n'enclenche pas le circuit IMPORT/MIXTE qui exigerait pesée et fret)
    for (const oid of data.order_ids) {
      if (!result[oid]) result[oid] = "local";
    }

    return result as any;
  });
