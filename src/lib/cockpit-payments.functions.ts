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

export interface OrderItemDetail {
  product_id: string;
  product_name: string;
  product_image: string | null;
  product_description: string | null;
  all_images: string[];
  variant_info: string | null; // toutes les images pour le détail
  quantity: number;
  unit_price: number;
  line_total: number;
  shop_id: string | null;
  shop_name: string | null;
  owner_name: string | null;
  is_admin_shop: boolean;
  commission_rate: number | null;
}

export interface OrderItemsResult {
  items: OrderItemDetail[];
  order_total: number;
  vendor_summary: { vendor_id: string; vendor_name: string; shop_name: string; item_count: number; total: number; is_admin: boolean }[];
  error?: string | null;
}

export const getOrderItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => OrderIdSchema.parse(input))
  .handler(async ({ data }) => {
    console.log("[getOrderItems] START order_id:", data.order_id);

    // 1. Charger les order_items
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", data.order_id);

    if (itemsErr) {
      console.error("[getOrderItems] order_items error:", itemsErr.message);
      return { items: [], order_total: 0, vendor_summary: [], error: "order_items: " + itemsErr.message } as any;
    }

    if (!items || items.length === 0) {
      return { items: [], order_total: 0, vendor_summary: [], error: null } as any;
    }

    const productIds = items.map(i => i.product_id).filter(Boolean);
    console.log("[getOrderItems] productIds:", productIds);

    // 2. Charger les produits — COLONNES SÛRES d'abord
    const { data: products, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id, name, price, shop_id")
      .in("id", productIds);

    if (prodErr) {
      console.error("[getOrderItems] products ERROR:", prodErr.message);
      // Fallback: essayer sans name/price
      const { data: productsMinimal } = await supabaseAdmin
        .from("products")
        .select("id, shop_id")
        .in("id", productIds);
      console.log("[getOrderItems] products minimal fallback:", productsMinimal?.length ?? 0);
    }

    console.log("[getOrderItems] products found:", products?.length ?? 0);
    if (products && products.length > 0) {
      console.log("[getOrderItems] first product:", JSON.stringify(products[0]));
    }

    // 3. Charger description et commission séparément (colonnes optionnelles)
    const { data: productsExtra } = await supabaseAdmin
      .from("products")
      .select("id, description, commission_rate")
      .in("id", productIds);

    const extraMap = new Map<string, { description: string | null; commission_rate: number | null }>();
    for (const pe of productsExtra ?? []) {
      extraMap.set(pe.id, { description: pe.description ?? null, commission_rate: pe.commission_rate ?? null });
    }

    // 4. Charger les images
    const { data: productImages } = await supabaseAdmin
      .from("product_images")
      .select("product_id, url")
      .in("product_id", productIds)
      .order("position", { ascending: true });

    const imageMap = new Map<string, string>();
    const allImagesMap = new Map<string, string[]>();
    for (const img of productImages ?? []) {
      if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.url);
      if (!allImagesMap.has(img.product_id)) allImagesMap.set(img.product_id, []);
      allImagesMap.get(img.product_id)!.push(img.url);
    }
    console.log("[getOrderItems] images found:", productImages?.length ?? 0);

    // 5. Charger les shops
    const shopIds = Array.from(new Set(
      (products ?? []).map(p => p.shop_id).filter(Boolean)
    ));
    console.log("[getOrderItems] shopIds:", shopIds);

    const { data: shops, error: shopsErr } = await supabaseAdmin
      .from("shops")
      .select("id, name, owner_id")
      .in("id", shopIds);

    if (shopsErr) console.error("[getOrderItems] shops error:", shopsErr.message);
    console.log("[getOrderItems] shops found:", shops?.length ?? 0);

    // 6. Charger les owners
    const ownerIds = Array.from(new Set((shops ?? []).map(s => s.owner_id).filter(Boolean)));
    const { data: owners } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, is_admin_shop")
      .in("id", ownerIds);

    const ownerMap = new Map<string, { full_name: string; is_admin_shop: boolean }>();
    for (const o of owners ?? []) {
      ownerMap.set(o.id, { full_name: o.full_name, is_admin_shop: o.is_admin_shop });
    }

    // 7. Assembler
    const shopMap = new Map<string, { name: string; owner_name: string; is_admin: boolean }>();
    for (const s of shops ?? []) {
      const owner = s.owner_id ? ownerMap.get(s.owner_id) : null;
      shopMap.set(s.id, {
        name: s.name ?? "Boutique",
        owner_name: owner?.full_name ?? "—",
        is_admin: owner?.is_admin_shop ?? false,
      });
    }

    const shopGroups = new Map<string, { shop_id: string; shop_name: string; owner_name: string; item_count: number; total: number; is_admin: boolean }>();

    const detailedItems = items.map((it, idx) => {
      const prod = (products ?? []).find(p => p.id === it.product_id);
      const extra = prod ? extraMap.get(prod.id) : null;
      const lookupId = prod?.shop_id;
      const shop = lookupId ? shopMap.get(lookupId) : null;
      const qty = it.quantity ?? 1;
      const price = prod?.price ?? 0;
      const lineTotal = qty * price;

      console.log(`[getOrderItems] item ${idx}: name="${prod?.name ?? "NOT FOUND"}", price=${price}, shop=${shop?.name ?? "—"}`);

      const sId = lookupId ?? "unknown";
      const existing = shopGroups.get(sId);
      if (existing) {
        existing.item_count += qty;
        existing.total += lineTotal;
      } else {
        shopGroups.set(sId, {
          shop_id: sId,
          shop_name: shop?.name ?? (sId === "unknown" ? "Source inconnue" : "Boutique"),
          owner_name: shop?.owner_name ?? "—",
          item_count: qty,
          total: lineTotal,
          is_admin: shop?.is_admin ?? false,
        });
      }

      return {
        product_id: it.product_id ?? "",
        product_name: prod?.name ?? "Produit inconnu",
        product_description: extra?.description ?? null,
        all_images: allImagesMap.get(it.product_id ?? "") ?? [],
        product_image: imageMap.get(it.product_id ?? "") ?? null,
        quantity: qty,
        unit_price: price,
        line_total: lineTotal,
        shop_id: lookupId ?? null,
        shop_name: shop?.name ?? null,
        owner_name: shop?.owner_name ?? null,
        is_admin_shop: shop?.is_admin ?? false,
        commission_rate: extra?.commission_rate ?? null,
      };
    });

    return {
      items: detailedItems,
      order_total: detailedItems.reduce((s, i) => s + i.line_total, 0),
      vendor_summary: Array.from(shopGroups.values()).map(g => ({
        vendor_id: g.shop_id,
        vendor_name: g.owner_name,
        shop_name: g.shop_name,
        item_count: g.item_count,
        total: g.total,
        is_admin: g.is_admin,
      })),
      error: null,
    } as any;
  });
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
