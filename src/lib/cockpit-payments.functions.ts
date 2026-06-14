// @ts-nocheck
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
  .inputValidator((input) => CreatePaymentSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await requireSupabaseAuth();
    const adminId = auth.user?.id ?? null;
    const adminName = data.admin_name || auth.user?.email || "Admin";

    const { data: payment, error } = await supabaseAdmin
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

    // Audit direct (pas d'appel a une autre serverFn)
    await supabaseAdmin.from("payment_audit").insert({
      order_id: data.order_id,
      action: "Paiement enregistre",
      admin_name: adminName,
      admin_id: adminId,
      details: `${data.amount} FCFA via ${data.method}${data.reference ? " (Ref: " + data.reference + ")" : ""}`,
    });

    return payment as OrderPayment;
  });

/* ── 2. Lister les paiements d'une commande ── */

export const listOrderPayments = createServerFn({ method: "POST" })
  .inputValidator((input) => OrderIdSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSupabaseAuth();

    const { data: payments, error } = await supabaseAdmin
      .from("order_payments")
      .select("*")
      .eq("order_id", data.order_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[listOrderPayments] Erreur:", error.message);
      return [] as OrderPayment[];
    }

    return (payments ?? []) as OrderPayment[];
  });

/* ── 3. Lister les paiements de toutes les commandes ── */

export const listAllOrderPayments = createServerFn({ method: "POST" })
  .handler(async () => {
    await requireSupabaseAuth();

    const { data: payments, error } = await supabaseAdmin
      .from("order_payments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[listAllOrderPayments] Erreur:", error.message);
      return [] as OrderPayment[];
    }

    return (payments ?? []) as OrderPayment[];
  });

/* ── 4. Audit — journal des actions ── */

export const createPaymentAudit = createServerFn({ method: "POST" })
  .inputValidator((input) => AuditSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await requireSupabaseAuth();
    const adminId = data.admin_id ?? auth.user?.id ?? null;
    const adminName = data.admin_name || auth.user?.email || "Admin";

    const { error } = await supabaseAdmin
      .from("payment_audit")
      .insert({
        order_id: data.order_id,
        action: data.action,
        admin_name: adminName,
        admin_id: adminId,
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
    await requireSupabaseAuth();

    const { data: audit, error } = await supabaseAdmin
      .from("payment_audit")
      .select("*")
      .eq("order_id", data.order_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[listPaymentAudit] Erreur:", error.message);
      return [] as PaymentAudit[];
    }

    return (audit ?? []) as PaymentAudit[];
  });

/* ── 6. Recalculer le total paye d'une commande ── */

async function recalcOrderPayment(orderId: string) {
  try {
    const { data: payments } = await supabaseAdmin
      .from("order_payments")
      .select("amount")
      .eq("order_id", orderId);

    const totalPaid = (payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);

    await supabaseAdmin
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

/* ── 7. Recuperer les articles d'une commande (avec produits et vendeur) ── */

// ─── Infos complètes du vendeur (pour la fiche cliquable) ───
export interface VendorFullInfo {
  vendor_id: string;
  shop_name: string | null;
  owner_name: string | null;
  is_admin_shop: boolean;
  shop_type_label: string;           // "Boutique Officielle" | "Boutique Vendeur"
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
  // ─── Variante choisie ───
  variant_id: string | null;
  variant_label: string | null;
  size: string | null;
  color: string | null;
  color_hex: string | null;
  // ─── Source / Boutique ───
  shop_id: string | null;
  shop_name: string | null;
  owner_name: string | null;
  is_admin_shop: boolean;
  shop_type_label: string | null;
  commission_rate: number | null;
  commission_amount: number | null;
  // ─── Infos vendeur complètes ───
  vendor: VendorFullInfo | null;
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

    // ═══════════════════════════════════════════════════════════════
    // ÉTAPE 0 : Récupérer la commande (pour le total et fallback)
    // ═══════════════════════════════════════════════════════════════
    const { data: orderRow } = await supabaseAdmin
      .from("orders")
      .select("id, total, status")
      .eq("id", data.order_id)
      .maybeSingle();

    console.log("[getOrderItems] order total:", orderRow?.total);

    // ═══════════════════════════════════════════════════════════════
    // ÉTAPE 1 : Charger les order_items (SOURCE DE VÉRITÉ)
    //  Structure: product_id, product_name, product_code, product_image_url,
    //              variant_id, size, color, unit_price, quantity,
    //              vendor_id, commission_rate, commission_amount, customization
    // ═══════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════
    // ÉTAPE 2 : Collecter les IDs pour les requêtes annexes
    // ═══════════════════════════════════════════════════════════════
    const productIds = orderItemsRaw.map(i => i.product_id).filter(Boolean) as string[];
    const variantIds = orderItemsRaw.map(i => i.variant_id).filter(Boolean) as string[];
    const vendorIds = orderItemsRaw.map(i => i.vendor_id).filter(Boolean) as string[];

    // ═══════════════════════════════════════════════════════════════
    // ÉTAPE 3 : Charger produits + variantes + vendors + images (PARALLÈLE)
    // ═══════════════════════════════════════════════════════════════
    const [productsResult, variantsResult, vendorsResult, imagesResult] = await Promise.allSettled([
      // 3a. Produits (designation, description)
      productIds.length > 0
        ? supabaseAdmin.from("products").select("id, name, designation, description, vendor_id, price, commission_rate").in("id", productIds)
        : Promise.resolve({ data: [] }),

      // 3b. Variantes (image de la variante choisie)
      variantIds.length > 0
        ? supabaseAdmin.from("product_variants").select("id, product_id, size, color, color_hex, image_url").in("id", variantIds)
        : Promise.resolve({ data: [] }),

      // 3c. Vendors (profiles)
      vendorIds.length > 0
        ? supabaseAdmin.from("profiles").select(
            "id, full_name, is_admin_shop, shop_name, phone, email, address, shop_description, shop_hours, shop_logo_url, is_verified, vendor_mode"
          ).in("id", vendorIds)
        : Promise.resolve({ data: [] }),

      // 3d. Images des produits
      productIds.length > 0
        ? supabaseAdmin.from("product_images").select("product_id, url").in("product_id", productIds).order("position", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    const products = (productsResult.status === "fulfilled" ? productsResult.value.data : []) ?? [];
    const variants = (variantsResult.status === "fulfilled" ? variantsResult.value.data : []) ?? [];
    const vendors = (vendorsResult.status === "fulfilled" ? vendorsResult.value.data : []) ?? [];
    const productImages = (imagesResult.status === "fulfilled" ? imagesResult.value.data : []) ?? [];

    // Maps pour lookup rapide
    const productMap = new Map(products.map(p => [p.id, p]));
    const variantMap = new Map(variants.map(v => [v.id, v]));
    const vendorMap = new Map(vendors.map(v => [v.id, v]));

    // Images par produit
    const imageMap = new Map<string, string>();
    const allImagesMap = new Map<string, string[]>();
    for (const img of productImages) {
      if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.url);
      if (!allImagesMap.has(img.product_id)) allImagesMap.set(img.product_id, []);
      allImagesMap.get(img.product_id)!.push(img.url);
    }

    console.log("[getOrderItems] products:", products.length, "variants:", variants.length, "vendors:", vendors.length);

    // ═══════════════════════════════════════════════════════════════
    // ÉTAPE 4 : Assembler les items détaillés
    // ═══════════════════════════════════════════════════════════════
    const vendorGroups = new Map<string, {
      vendor_id: string; vendor_name: string; shop_name: string;
      shop_type_label: string | null; item_count: number; total: number; is_admin: boolean;
    }>();

    const detailedItems: OrderItemDetail[] = orderItemsRaw.map((it, idx) => {
      const prod = it.product_id ? productMap.get(it.product_id) : null;
      const variant = it.variant_id ? variantMap.get(it.variant_id) : null;
      const vendor = it.vendor_id ? vendorMap.get(it.vendor_id) : null;
      const qty = it.quantity ?? 1;
      const price = it.unit_price ?? prod?.price ?? 0;
      const lineTotal = qty * price;

      // ─── Nom produit : order_items > products > fallback ───
      const prodName = it.product_name
        ?? prod?.name
        ?? (prod as any)?.designation
        ?? it.product_code
        ?? "Produit " + (idx + 1);

      // ─── Image : variante choisie > image produit > null ───
      const variantImage = variant?.image_url ?? null;
      const productImage = it.product_image_url
        ?? imageMap.get(it.product_id ?? "")
        ?? null;
      const mainImage = variantImage ?? productImage;

      // ─── Toutes les images : variante en premier, puis produit ───
      const allImgs: string[] = [];
      if (variantImage) allImgs.push(variantImage);
      const prodImgs = allImagesMap.get(it.product_id ?? "") ?? [];
      for (const img of prodImgs) if (!allImgs.includes(img)) allImgs.push(img);

      // ─── Label variante : ex: "Rouge - M" ───
      const size = it.size ?? variant?.size ?? null;
      const color = it.color ?? variant?.color ?? null;
      const colorHex = variant?.color_hex ?? null;
      const variantLabel = size && color
        ? `${color} - ${size}`
        : color ?? size ?? null;

      // ─── Type de boutique ───
      const isAdmin = vendor?.is_admin_shop ?? false;
      const shopTypeLabel = isAdmin ? "Boutique Officielle" : "Boutique Vendeur";
      const shopName = vendor?.shop_name ?? vendor?.full_name ?? "Source inconnue";

      // ─── Grouper par vendor ───
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
        // ─── Infos vendeur complètes pour la fiche ───
        vendor: it.vendor_id && vendor ? {
          vendor_id: it.vendor_id,
          shop_name: vendor.shop_name ?? null,
          owner_name: vendor.full_name ?? null,
          is_admin_shop: vendor.is_admin_shop ?? false,
          shop_type_label: (vendor.is_admin_shop ?? false) ? "Boutique Officielle" : "Boutique Vendeur",
          phone: vendor.phone ?? null,
          email: vendor.email ?? null,
          address: vendor.address ?? null,
          whatsapp: vendor.phone ?? null, // phone = whatsapp par défaut
          shop_description: (vendor as any)?.shop_description ?? null,
          shop_hours: (vendor as any)?.shop_hours ?? null,
          shop_logo_url: (vendor as any)?.shop_logo_url ?? null,
          is_verified: (vendor as any)?.is_verified ?? false,
          vendor_mode: (vendor as any)?.vendor_mode ?? null,
        } : null,
      };
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
    await requireSupabaseAuth();

    const { data: summary, error } = await supabaseAdmin
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

    // Étape 1: Charger order_items
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .select("order_id, product_id")
      .in("order_id", data.order_ids);

    if (itemsErr || !items || items.length === 0) {
      // Fallback: utiliser shipping_service_id
      const { data: orders } = await supabaseAdmin
        .from("orders")
        .select("id, shipping_service_id")
        .in("id", data.order_ids);
      const result: Record<string, "local" | "import" | "mixte"> = {};
      for (const o of orders ?? []) {
        result[o.id] = o.shipping_service_id ? "import" : "local";
      }
      return result as any;
    }

    // Étape 2: Charger les produits correspondants
    const productIds = Array.from(new Set(items.map(it => it.product_id).filter(Boolean)));
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, vendor_id")
      .in("id", productIds);

    // Étape 3: Charger les vendors (profiles)
    const vendorIds = Array.from(new Set((products ?? []).map(p => p.vendor_id).filter(Boolean)));
    const { data: vendors } = await supabaseAdmin
      .from("profiles")
      .select("id, is_admin_shop")
      .in("id", vendorIds);

    const vendorMap = new Map<string, boolean>();
    for (const v of vendors ?? []) {
      vendorMap.set(v.id, v.is_admin_shop ?? false);
    }
    const productMap = new Map<string, string | null>();
    for (const p of products ?? []) {
      productMap.set(p.id, p.vendor_id);
    }

    // Grouper par order_id et déterminer le type
    const orderItems = new Map<string, { is_admin: boolean }[]>();
    for (const it of items) {
      const orderId = it.order_id;
      const vid = productMap.get(it.product_id ?? "");
      if (!vid) continue;
      if (!orderItems.has(orderId)) orderItems.set(orderId, []);
      orderItems.get(orderId)!.push({ is_admin: vendorMap.get(vid) ?? false });
    }

    const result: Record<string, "local" | "import" | "mixte"> = {};
    for (const [orderId, types] of orderItems) {
      const hasLocal = types.some(t => t.is_admin);
      const hasImport = types.some(t => !t.is_admin);
      if (hasLocal && hasImport) result[orderId] = "mixte";
      else if (hasImport) result[orderId] = "import";
      else result[orderId] = "local";
    }

    // Pour les commandes sans items, fallback sur shipping_service_id
    for (const oid of data.order_ids) {
      if (!result[oid]) {
        const { data: orderRow } = await supabaseAdmin
          .from("orders")
          .select("shipping_service_id")
          .eq("id", oid)
          .maybeSingle();
        result[oid] = orderRow?.shipping_service_id ? "import" : "local";
      }
    }

    return result as any;
  });
