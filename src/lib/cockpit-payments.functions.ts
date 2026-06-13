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
  quantity: number;
  unit_price: number;
  line_total: number;
  vendor_id: string | null;
  vendor_name: string | null;
  shop_name: string | null;
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
  .inputValidator((input) => OrderIdSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSupabaseAuth();

    console.log("[getOrderItems] order_id:", data.order_id);

    // 1. Charger les order_items
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .select("product_id, quantity, unit_price")
      .eq("order_id", data.order_id);

    if (itemsErr) {
      console.error("[getOrderItems] order_items error:", itemsErr.message);
      return { items: [], order_total: 0, vendor_summary: [], error: itemsErr.message } as any;
    }

    console.log("[getOrderItems] items found:", items?.length ?? 0);

    if (!items || items.length === 0) {
      return { items: [], order_total: 0, vendor_summary: [], error: null } as any;
    }

    // 2. Charger les produits
    const productIds = items.map(i => i.product_id).filter(Boolean);
    const { data: products, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id, name, vendor_id, price, commission_rate")
      .in("id", productIds);

    if (prodErr) console.error("[getOrderItems] products error:", prodErr.message);

    // 3. Charger les images des produits (première image par produit)
    const { data: productImages } = await supabaseAdmin
      .from("product_images")
      .select("product_id, url")
      .in("product_id", productIds)
      .order("position", { ascending: true });

    const imageMap = new Map<string, string>();
    for (const img of productImages ?? []) {
      if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.url);
    }

    // 4. Charger les vendeurs (profiles)
    const vendorIds = Array.from(new Set((products ?? []).map(p => p.vendor_id).filter(Boolean)));
    const { data: vendors } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, shop_name, is_admin_shop")
      .in("id", vendorIds);

    const vendorMap = new Map<string, { full_name: string; shop_name: string; is_admin_shop: boolean }>();
    for (const v of vendors ?? []) {
      vendorMap.set(v.id, { full_name: v.full_name, shop_name: v.shop_name, is_admin_shop: v.is_admin_shop });
    }

    // 5. Assembler
    const vendorGroups = new Map<string, { vendor_id: string; vendor_name: string; shop_name: string; item_count: number; total: number; is_admin: boolean }>();

    const detailedItems: OrderItemDetail[] = items.map(it => {
      const prod = (products ?? []).find(p => p.id === it.product_id);
      const vendor = prod?.vendor_id ? vendorMap.get(prod.vendor_id) : null;
      const qty = it.quantity ?? 1;
      const price = it.unit_price ?? prod?.price ?? 0;
      const lineTotal = qty * price;

      // Grouper par vendeur
      const vId = prod?.vendor_id ?? "unknown";
      const existing = vendorGroups.get(vId);
      if (existing) {
        existing.item_count += qty;
        existing.total += lineTotal;
      } else {
        vendorGroups.set(vId, {
          vendor_id: vId,
          vendor_name: vendor?.full_name ?? "Inconnu",
          shop_name: vendor?.shop_name ?? "—",
          item_count: qty,
          total: lineTotal,
          is_admin: vendor?.is_admin_shop ?? false,
        });
      }

      return {
        product_id: it.product_id ?? "",
        product_name: prod?.name ?? "Produit inconnu",
        product_image: imageMap.get(it.product_id ?? "") ?? null,
        quantity: qty,
        unit_price: price,
        line_total: lineTotal,
        vendor_id: prod?.vendor_id ?? null,
        vendor_name: vendor?.full_name ?? null,
        shop_name: vendor?.shop_name ?? null,
        is_admin_shop: vendor?.is_admin_shop ?? false,
        commission_rate: prod?.commission_rate ?? null,
      };
    });

    return {
      items: detailedItems,
      order_total: detailedItems.reduce((s, i) => s + i.line_total, 0),
      vendor_summary: Array.from(vendorGroups.values()),
    } as OrderItemsResult;
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
