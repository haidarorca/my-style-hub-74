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
  all_images: string[]; // toutes les images pour le détail
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

    // ═══════════════════════════════════════════════════════════════
    // ÉTAPE 0 : Récupérer la commande pour fallback
    // ═══════════════════════════════════════════════════════════════
    const { data: orderRow } = await supabaseAdmin
      .from("orders")
      .select("id, total, product_id, product_name, designation, description, vendor_id, quantity, unit_price, commission_rate, status")
      .eq("id", data.order_id)
      .maybeSingle();

    console.log("[getOrderItems] orderRow:", orderRow ? "found" : "not found", "total:", orderRow?.total);

    // ═══════════════════════════════════════════════════════════════
    // ÉTAPE 1 : Charger les order_items
    // ═══════════════════════════════════════════════════════════════
    let items: Array<{ product_id: string | null; quantity: number | null; unit_price?: number | null }> = [];

    const { data: orderItems, error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .select("product_id, quantity, unit_price")
      .eq("order_id", data.order_id);

    if (itemsErr) {
      console.error("[getOrderItems] order_items error:", itemsErr.message);
    } else if (orderItems && orderItems.length > 0) {
      items = orderItems;
      console.log("[getOrderItems] order_items found:", items.length);
    }

    // ═══════════════════════════════════════════════════════════════
    // FALLBACK 1 : Si order_items vide mais product_id sur orders
    // ═══════════════════════════════════════════════════════════════
    if (items.length === 0 && orderRow?.product_id) {
      console.log("[getOrderItems] Fallback: using product_id from orders table");
      items = [{
        product_id: orderRow.product_id as string,
        quantity: (orderRow.quantity as number) ?? 1,
        unit_price: (orderRow.unit_price as number) ?? null,
      }];
    }

    // ═══════════════════════════════════════════════════════════════
    // FALLBACK 2 : Aucun article du tout → créer un item synthétique
    // ═══════════════════════════════════════════════════════════════
    if (items.length === 0 && orderRow) {
      console.log("[getOrderItems] Fallback: creating synthetic item from order total");
      const syntheticName = (orderRow.product_name as string)
        || (orderRow.designation as string)
        || "Commande " + data.order_id;
      return {
        items: [{
          product_id: orderRow.id as string,
          product_name: syntheticName,
          product_image: null,
          all_images: [],
          quantity: (orderRow.quantity as number) ?? 1,
          unit_price: (orderRow.unit_price as number) ?? (orderRow.total as number) ?? 0,
          line_total: (orderRow.total as number) ?? 0,
          shop_id: (orderRow.vendor_id as string) ?? null,
          shop_name: null,
          owner_name: null,
          is_admin_shop: false,
          commission_rate: (orderRow.commission_rate as number) ?? null,
        }],
        order_total: (orderRow.total as number) ?? 0,
        vendor_summary: [],
        error: null,
      } as any;
    }

    if (items.length === 0) {
      return { items: [], order_total: 0, vendor_summary: [], error: null } as any;
    }

    // ═══════════════════════════════════════════════════════════════
    // ÉTAPE 2 : Charger les produits (avec vendor_id pour jointure)
    // ═══════════════════════════════════════════════════════════════
    const productIds = items.map(i => i.product_id).filter(Boolean) as string[];
    const { data: products, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id, name, designation, description, vendor_id, price, commission_rate")
      .in("id", productIds);

    if (prodErr) console.error("[getOrderItems] products error:", prodErr.message);
    console.log("[getOrderItems] products found:", products?.length ?? 0);

    // ═══════════════════════════════════════════════════════════════
    // ÉTAPE 3 : Charger les images des produits
    // ═══════════════════════════════════════════════════════════════
    let imageMap = new Map<string, string>();
    let allImagesMap = new Map<string, string[]>();
    try {
      const { data: productImages } = await supabaseAdmin
        .from("product_images")
        .select("product_id, url")
        .in("product_id", productIds)
        .order("position", { ascending: true });

      for (const img of productImages ?? []) {
        if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.url);
        if (!allImagesMap.has(img.product_id)) allImagesMap.set(img.product_id, []);
        allImagesMap.get(img.product_id)!.push(img.url);
      }
    } catch { /* ignorer */ }

    // ═══════════════════════════════════════════════════════════════
    // ÉTAPE 4 : Charger les vendors (profiles) directement
    // ═══════════════════════════════════════════════════════════════
    const vendorIds = Array.from(new Set((products ?? []).map(p => p.vendor_id).filter(Boolean))) as string[];
    console.log("[getOrderItems] vendorIds:", vendorIds);

    let vendorMap = new Map<string, { name: string; full_name: string; is_admin: boolean }>();
    if (vendorIds.length > 0) {
      try {
        const { data: vendors } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, is_admin_shop, shop_name")
          .in("id", vendorIds);

        for (const v of vendors ?? []) {
          vendorMap.set(v.id, {
            name: v.shop_name ?? v.full_name ?? "Vendeur",
            full_name: v.full_name ?? "—",
            is_admin: v.is_admin_shop ?? false,
          });
        }
        console.log("[getOrderItems] vendors found:", vendors?.length ?? 0);
      } catch (e) {
        console.error("[getOrderItems] vendors error:", (e as Error).message);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ÉTAPE 5 : Assembler le résultat
    // ═══════════════════════════════════════════════════════════════
    const vendorGroups = new Map<string, { vendor_id: string; vendor_name: string; shop_name: string; item_count: number; total: number; is_admin: boolean }>();

    const detailedItems: OrderItemDetail[] = items.map((it, idx) => {
      const prod = (products ?? []).find(p => p.id === it.product_id);
      const vendor = prod?.vendor_id ? vendorMap.get(prod.vendor_id) : null;
      const qty = it.quantity ?? 1;
      // Prix : unit_price sur order_items > price sur products > 0
      const price = it.unit_price ?? prod?.price ?? 0;
      const lineTotal = qty * price;

      // Nom produit : name > designation > description > "Produit inconnu"
      const prodName = prod?.name
        || (prod as any)?.designation
        || (prod as any)?.description
        || (orderRow?.product_name as string)
        || (orderRow?.designation as string)
        || "Produit " + (idx + 1);

      // Grouper par vendor
      const vId = prod?.vendor_id ?? "unknown";
      const existing = vendorGroups.get(vId);
      if (existing) {
        existing.item_count += qty;
        existing.total += lineTotal;
      } else {
        vendorGroups.set(vId, {
          vendor_id: vId,
          vendor_name: vendor?.full_name ?? "—",
          shop_name: vendor?.name ?? "Source inconnue",
          item_count: qty,
          total: lineTotal,
          is_admin: vendor?.is_admin ?? false,
        });
      }

      return {
        product_id: it.product_id ?? "",
        product_name: prodName,
        product_image: imageMap.get(it.product_id ?? "") ?? null,
        all_images: allImagesMap.get(it.product_id ?? "") ?? [],
        quantity: qty,
        unit_price: price,
        line_total: lineTotal,
        shop_id: prod?.vendor_id ?? null,
        shop_name: vendor?.name ?? null,
        owner_name: vendor?.full_name ?? null,
        is_admin_shop: vendor?.is_admin ?? false,
        commission_rate: (prod as any)?.commission_rate ?? null,
      };
    });

    const total = detailedItems.reduce((s, i) => s + i.line_total, 0);

    return {
      items: detailedItems,
      order_total: total > 0 ? total : (orderRow?.total as number) ?? 0,
      vendor_summary: Array.from(vendorGroups.values()).map(g => ({
        vendor_id: g.vendor_id,
        vendor_name: g.vendor_name,
        shop_name: g.shop_name,
        item_count: g.item_count,
        total: g.total,
        is_admin: g.is_admin,
      })),
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
