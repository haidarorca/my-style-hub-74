import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission } from "./admin-auth.core";

const STEPS = [
  "name", "code", "designation", "description", "category", "subcategory",
  "images", "price", "stock", "variants", "countries", "global",
] as const;
export type ModerationStep = (typeof STEPS)[number];

export const STEP_LABELS: Record<ModerationStep, string> = {
  name: "Nom du produit",
  code: "Code produit",
  designation: "Désignation",
  description: "Description",
  category: "Catégorie",
  subcategory: "Sous-catégorie",
  images: "Images",
  price: "Prix",
  stock: "Stock",
  variants: "Variantes",
  countries: "Pays de livraison",
  global: "Message global",
};


export type ReasonTemplate = {
  id: string;
  step: ModerationStep;
  label: string;
  video_url: string | null;
  is_default: boolean;
  position: number;
};

export const listReasonTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ step: z.enum(STEPS) }).parse(input))
  .handler(async ({ data, context }): Promise<ReasonTemplate[]> => {
    await assertPermission(context.userId, "support");
    const { data: rows, error } = await supabaseAdmin
      .from("moderation_reason_templates")
      .select("id, step, label, video_url, is_default, position")
      .eq("step", data.step)
      .eq("is_enabled", true)
      .order("is_default", { ascending: false })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ReasonTemplate[];
  });

export const createReasonTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      step: z.enum(STEPS),
      label: z.string().trim().min(3).max(500),
      video_url: z.string().trim().url().max(500).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ReasonTemplate> => {
    await assertPermission(context.userId, "support");
    const { data: row, error } = await supabaseAdmin
      .from("moderation_reason_templates")
      .insert({
        step: data.step,
        label: data.label,
        video_url: data.video_url || null,
        is_default: false,
        created_by: context.userId,
      })
      .select("id, step, label, video_url, is_default, position")
      .single();
    if (error) throw new Error(error.message);
    return row as ReasonTemplate;
  });

export const deleteReasonTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "support");
    const { error } = await supabaseAdmin
      .from("moderation_reason_templates")
      .delete()
      .eq("id", data.id)
      .eq("is_default", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const FeedbackItemSchema = z.object({
  step: z.enum(STEPS),
  reason_text: z.string().trim().min(1).max(1000),
  video_url: z.string().trim().url().max(500).optional().nullable(),
});

export const submitModerationDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      product_id: z.string().uuid(),
      decision: z.enum(["approved", "rejected", "changes_requested"]),
      global_message: z.string().trim().max(2000).optional().nullable(),
      items: z.array(FeedbackItemSchema).max(60).default([]),
      send_notification: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "support");

    const { data: product, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id, name, code, vendor_id")
      .eq("id", data.product_id)
      .single();
    if (prodErr || !product) throw new Error(prodErr?.message || "Produit introuvable");

    if (data.decision === "approved") {
      const { data: duplicate, error: duplicateErr } = await supabaseAdmin
        .from("products")
        .select("id")
        .eq("vendor_id", product.vendor_id)
        .eq("code", product.code)
        .neq("id", product.id)
        .maybeSingle();
      if (duplicateErr) throw new Error(duplicateErr.message);
      if (duplicate) throw new Error("Ce code produit existe déjà dans cette boutique.");
    }

    // Status mapping
    const nextStatus = data.decision === "approved" ? "approved" : data.decision === "rejected" ? "rejected" : "pending";
    const shortReason =
      data.decision === "approved"
        ? null
        : (data.items.map((i) => `• ${i.reason_text}`).join("\n") + (data.global_message ? `\n\n${data.global_message}` : "")).slice(0, 500) || "Modification demandée";

    const updatePayload: { status: "approved" | "rejected" | "pending"; rejection_reason: string | null; is_edit?: boolean } = {
      status: nextStatus,
      rejection_reason: shortReason,
    };
    if (data.decision === "approved") updatePayload.is_edit = false;

    const { error: updErr } = await supabaseAdmin.from("products").update(updatePayload).eq("id", data.product_id);
    if (updErr) throw new Error(updErr.message);

    // Insert feedback record
    const { data: fb, error: fbErr } = await supabaseAdmin
      .from("product_moderation_feedback")
      .insert({
        product_id: data.product_id,
        vendor_id: product.vendor_id,
        admin_id: context.userId,
        decision: data.decision,
        global_message: data.global_message || null,
      })
      .select("id")
      .single();
    if (fbErr || !fb) throw new Error(fbErr?.message || "Échec enregistrement feedback");

    if (data.items.length > 0) {
      const { error: itemsErr } = await supabaseAdmin
        .from("product_moderation_feedback_items")
        .insert(
          data.items.map((it, i) => ({
            feedback_id: fb.id,
            step: it.step,
            reason_text: it.reason_text,
            video_url: it.video_url || null,
            position: i,
          })),
        );
      if (itemsErr) throw new Error(itemsErr.message);
    }

    // Notification
    if (data.send_notification) {
      const title =
        data.decision === "approved"
          ? "✅ Produit approuvé"
          : data.decision === "rejected"
            ? "❌ Produit rejeté"
            : "✏️ Modification demandée";

      const grouped = new Map<ModerationStep, typeof data.items>();
      for (const it of data.items) {
        const arr = grouped.get(it.step) ?? [];
        arr.push(it);
        grouped.set(it.step, arr);
      }
      const lines: string[] = [`Produit : ${product.name}`, ""];
      let i = 1;
      for (const step of STEPS) {
        const arr = grouped.get(step);
        if (!arr || arr.length === 0) continue;
        if (step === "global") continue;
        lines.push(`${i}. ${STEP_LABELS[step]}`);
        for (const r of arr) {
          lines.push(`  - ${r.reason_text}`);
          if (r.video_url) lines.push(`    🎥 ${r.video_url}`);
        }
        lines.push("");
        i++;
      }
      const globals = grouped.get("global");
      if (globals && globals.length > 0) {
        lines.push("Message global :");
        for (const r of globals) {
          lines.push(`  - ${r.reason_text}`);
          if (r.video_url) lines.push(`    🎥 ${r.video_url}`);
        }
        lines.push("");
      }
      if (data.global_message) {
        lines.push(data.global_message);
      }

      const message = lines.join("\n").trim() || (data.decision === "approved" ? "Votre produit a été approuvé." : "Décision admin enregistrée.");

      await supabaseAdmin.from("notifications").insert({
        user_id: product.vendor_id,
        title,
        message,
        link: `/vendor/products/${data.product_id}/edit`,
      });
    }

    return { ok: true, feedback_id: fb.id };
  });

export const getVendorContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ vendor_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "support");
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .select("phone, shop_whatsapp, full_name, shop_name, email")
      .eq("id", data.vendor_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
