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
    console.log("[getOrderItems] order_id:", data.order_id);

    // 1. Récupérer le total de la commande (fallback principal)
    const { data: orderRow } = await supabaseAdmin
      .from("logistics_orders")
      .select("order_total")
      .eq("order_id", data.order_id)
      .single();
    const orderTotal = orderRow?.order_total ?? 0;

    // 2. Charger les order_items
    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", data.order_id);

    if (!items || items.length === 0) {
      return { items: [], order_total: orderTotal, vendor_summary: [], error: null } as any;
    }

    const productIds = items.map(i => i.product_id).filter(Boolean);
    const totalQty = items.reduce((s, i) => s + (i.quantity ?? 1), 0);

    // 3. ESSAYER TOUTES les combinaisons possibles pour récupérer les produits
    let productMap = new Map<string, { name: string; price: number; description: string | null; commission_rate: number | null; shop_id: string | null }>();

    // Tentative 1: id, name, price, shop_id
    try {
      const { data: prods } = await supabaseAdmin.from("products").select("id, name, price, shop_id, description, commission_rate").in("id", productIds);
      if (prods && prods.length > 0) {
        for (const p of prods) productMap.set(p.id, { name: p.name ?? "Article", price: p.price ?? 0, description: p.description ?? null, commission_rate: p.commission_rate ?? null, shop_id: p.shop_id ?? null });
      }
    } catch (e) {
      // Tentative 2: sans description/commission
      try {
        const { data: prods } = await supabaseAdmin.from("products").select("id, name, price, shop_id").in("id", productIds);
        if (prods) for (const p of prods) productMap.set(p.id, { name: p.name ?? "Article", price: p.price ?? 0, description: null, commission_rate: null, shop_id: p.shop_id ?? null });
      } catch (e2) {
        // Tentative 3: colonnes minimales
        try {
          const { data: prods } = await supabaseAdmin.from("products").select("id, shop_id").in("id", productIds);
          if (prods) for (const p of prods) productMap.set(p.id, { name: "Article", price: 0, description: null, commission_rate: null, shop_id: p.shop_id ?? null });
        } catch (e3) {
          console.error("[getOrderItems] Toutes les tentatives products ont échoué");
        }
      }
    }

    console.log("[getOrderItems] productMap:", productMap.size, "/", productIds.length);

    // 4. Images
    const imageMap = new Map<string, string>();
    const allImagesMap = new Map<string, string[]>();
    try {
      const { data: imgs } = await supabaseAdmin.from("product_images").select("product_id, url").in("product_id", productIds).order("position", { ascending: true });
      for (const img of imgs ?? []) {
        if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.url);
        if (!allImagesMap.has(img.product_id)) allImagesMap.set(img.product_id, []);
        allImagesMap.get(img.product_id)!.push(img.url);
      }
    } catch (e) { /* ignore */ }

    // 5. Shops — ESSAYER plusieurs approches
    const shopIds = Array.from(new Set(Array.from(productMap.values()).map(p => p.shop_id).filter(Boolean)));
    const shopMap = new Map<string, { name: string; owner_name: string; is_admin: boolean }>();

    if (shopIds.length > 0) {
      try {
        const { data: shops } = await supabaseAdmin.from("shops").select("id, name, owner_id").in("id", shopIds);
        if (shops && shops.length > 0) {
          const ownerIds = Array.from(new Set(shops.map(s => s.owner_id).filter(Boolean)));
          const { data: owners } = await supabaseAdmin.from("profiles").select("id, full_name, is_admin_shop").in("id", ownerIds);
          const ownerMap = new Map((owners ?? []).map(o => [o.id, { full_name: o.full_name, is_admin_shop: o.is_admin_shop }]));
          for (const s of shops) {
            const owner = s.owner_id ? ownerMap.get(s.owner_id) : null;
            shopMap.set(s.id, { name: s.name ?? "Boutique", owner_name: owner?.full_name ?? "—", is_admin: owner?.is_admin_shop ?? false });
          }
        }
      } catch (e) { /* ignore */ }
    }

    // 6. Assembler avec FALLBACKS
    const shopGroups = new Map<string, any>();
    const detailedItems = items.map((it, idx) => {
      const prod = productMap.get(it.product_id ?? "");
      const qty = it.quantity ?? 1;
      // PRIX: produit > order_total/qty > 0
      const price = prod?.price && prod.price > 0 ? prod.price : (orderTotal > 0 && totalQty > 0 ? Math.round(orderTotal / totalQty) : 0);
      const lineTotal = qty * price;
      const shop = prod?.shop_id ? shopMap.get(prod.shop_id) : null;

      const sId = prod?.shop_id ?? "unknown";
      const existing = shopGroups.get(sId);
      if (existing) { existing.item_count += qty; existing.total += lineTotal; }
      else {
        shopGroups.set(sId, {
          shop_id: sId, shop_name: shop?.name ?? "Non identifié",
          owner_name: shop?.owner_name ?? "—", item_count: qty, total: lineTotal, is_admin: shop?.is_admin ?? false,
        });
      }

      return {
        product_id: it.product_id ?? "",
        product_name: prod?.name ?? `Article ${idx + 1}`,
        product_description: prod?.description ?? null,
        product_image: imageMap.get(it.product_id ?? "") ?? null,
        all_images: allImagesMap.get(it.product_id ?? "") ?? [],
        quantity: qty,
        unit_price: price,
        line_total: lineTotal,
        shop_id: prod?.shop_id ?? null,
        shop_name: shop?.name ?? null,
        owner_name: shop?.owner_name ?? null,
        is_admin_shop: shop?.is_admin ?? false,
        commission_rate: prod?.commission_rate ?? null,
        variant_info: null,
      };
    });

    const total = detailedItems.reduce((s, i) => s + i.line_total, 0);
    console.log("[getOrderItems] total:", total, "items:", detailedItems.length);

    return {
      items: detailedItems,
      order_total: total > 0 ? total : orderTotal,
      vendor_summary: Array.from(shopGroups.values()).map(g => ({
        vendor_id: g.shop_id, vendor_name: g.owner_name, shop_name: g.shop_name,
        item_count: g.item_count, total: g.total, is_admin: g.is_admin,
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
