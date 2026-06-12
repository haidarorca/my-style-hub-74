// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   Cockpit Payments — Persistance Supabase des paiements
   ═══════════════════════════════════════════════════════════════ */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
  .validator(z.object({
    order_id: z.string().min(1),
    amount: z.number().positive(),
    method: z.string().min(1),
    reference: z.string().optional(),
    admin_name: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const auth = await requireSupabaseAuth();
    const adminId = auth.user?.id ?? null;
    const adminName = data.admin_name || auth.user?.email || "Admin";

    // Inserer dans order_payments
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
      throw new Error(`Impossible d'enregistrer le paiement: ${error.message}`);
    }

    // Mettre a jour order_payment_summary
    await recalcOrderPayment(data.order_id);

    // Audit
    await createPaymentAudit({
      order_id: data.order_id,
      action: "Paiement enregistre",
      admin_name: adminName,
      admin_id: adminId,
      details: `${data.amount} FCFA via ${data.method}${data.reference ? " (Ref: " + data.reference + ")" : ""}`,
    });

    return payment as OrderPayment;
  });

/* ── 2. Lister les paiements d'une commande ── */

export const listOrderPayments = createServerFn({ method: "GET" })
  .validator(z.object({ order_id: z.string().min(1) }))
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

export const listAllOrderPayments = createServerFn({ method: "GET" })
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
  .validator(z.object({
    order_id: z.string().min(1),
    action: z.string().min(1),
    admin_name: z.string().optional(),
    admin_id: z.string().nullable().optional(),
    details: z.string().nullable().optional(),
  }))
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

export const listPaymentAudit = createServerFn({ method: "GET" })
  .validator(z.object({ order_id: z.string().min(1) }))
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
    // Recuperer tous les paiements
    const { data: payments } = await supabaseAdmin
      .from("order_payments")
      .select("amount")
      .eq("order_id", orderId);

    const totalPaid = (payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);

    // Upsert dans order_payment_summary
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

/* ── 7. Recuperer le resume de paiement d'une commande ── */

export const getOrderPaymentSummary = createServerFn({ method: "GET" })
  .validator(z.object({ order_id: z.string().min(1) }))
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
