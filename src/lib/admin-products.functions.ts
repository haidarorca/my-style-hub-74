import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission, logAdminAction } from "./admin-auth.core";

/* ============================================================
   Moderation list (pending / approved / rejected)
   ============================================================ */

const ModerationInput = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  q: z.string().trim().max(200).default(""),
  status: z.enum(["all", "pending", "approved", "rejected", "archived"]).default("pending"),
  kind: z.enum(["all", "new", "edit"]).default("all"),
  sort: z.enum(["created_at", "updated_at", "price", "name"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export type AdminProductRow = {
  id: string;
  name: string;
  code: string;
  price: number;
  status: "pending" | "approved" | "rejected";
  is_edit: boolean | null;
  is_archived: boolean;
  rejection_reason: string | null;
  vendor_id: string;
  vendor_shop_name: string | null;
  vendor_full_name: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  pending_category_request_id: string | null;
};

export type AdminProductsPage = {
  rows: AdminProductRow[];
  total: number;
  page: number;
  pageSize: number;
  totals: { pending: number; approved: number; rejected: number; edits_pending: number; archived: number };
};

export const listAdminProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => (input ? ModerationInput.parse(input) : ModerationInput.parse({})))
  .handler(async ({ data, context }): Promise<AdminProductsPage> => {
    await assertPermission(context.userId, "product_validation");

    let q = supabaseAdmin
      .from("products")
      .select(
        "id, name, code, price, status, is_edit, rejection_reason, vendor_id, created_at, updated_at, pending_category_request_id, archived_at",
        { count: "exact" },
      );

    if (data.status === "archived") {
      q = q.not("archived_at", "is", null);
    } else {
      // Exclude archived products from all other views (pending/approved/rejected/all)
      q = q.is("archived_at", null);
      if (data.status !== "all") q = q.eq("status", data.status);
    }
    if (data.kind === "new") q = q.eq("is_edit", false);
    if (data.kind === "edit") q = q.eq("is_edit", true);

    const search = data.q.trim();
    if (search.length > 0) {
      const safe = search.replace(/[,()]/g, " ");
      const p = `%${safe}%`;
      q = q.or(`name.ilike.${p},code.ilike.${p},designation.ilike.${p}`);
    }

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    q = q.order(data.sort, { ascending: data.dir === "asc", nullsFirst: false }).range(from, to);

    const { data: prods, error, count } = await q;
    if (error) throw new Error(error.message);

    const vendorIds = Array.from(new Set((prods ?? []).map((p) => p.vendor_id)));
    const productIds = (prods ?? []).map((p) => p.id);

    const [vendorsRes, imgsRes, totalsRes] = await Promise.all([
      vendorIds.length
        ? supabaseAdmin.from("profiles").select("id, shop_name, full_name").in("id", vendorIds)
        : Promise.resolve({ data: [] as { id: string; shop_name: string | null; full_name: string | null }[] }),
      productIds.length
        ? supabaseAdmin.from("product_images").select("product_id, url, position").in("product_id", productIds).order("position", { ascending: true })
        : Promise.resolve({ data: [] as { product_id: string; url: string; position: number }[] }),
      supabaseAdmin.from("products").select("status, is_edit, archived_at"),
    ]);

    const vendorMap = new Map((vendorsRes.data ?? []).map((v) => [v.id, v]));
    const firstImg = new Map<string, string>();
    for (const im of imgsRes.data ?? []) {
      if (!firstImg.has(im.product_id)) firstImg.set(im.product_id, im.url);
    }

    const totals = { pending: 0, approved: 0, rejected: 0, edits_pending: 0, archived: 0 };
    for (const p of totalsRes.data ?? []) {
      if (p.archived_at) {
        totals.archived += 1;
        continue;
      }
      const s = String(p.status ?? "pending") as "pending" | "approved" | "rejected";
      if (s === "pending" || s === "approved" || s === "rejected") totals[s] += 1;
      if (p.status === "pending" && p.is_edit) totals.edits_pending += 1;
    }

    const rows: AdminProductRow[] = (prods ?? []).map((p) => {
      const v = vendorMap.get(p.vendor_id);
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        price: Number(p.price ?? 0),
        status: p.status as AdminProductRow["status"],
        is_edit: p.is_edit,
        is_archived: !!p.archived_at,
        rejection_reason: p.rejection_reason,
        vendor_id: p.vendor_id,
        vendor_shop_name: v?.shop_name ?? null,
        vendor_full_name: v?.full_name ?? null,
        image_url: firstImg.get(p.id) ?? null,
        created_at: p.created_at,
        updated_at: p.updated_at,
        pending_category_request_id: p.pending_category_request_id,
      };
    });

    return { rows, total: count ?? rows.length, page: data.page, pageSize: data.pageSize, totals };
  });

/* ============================================================
   Reported products
   ============================================================ */

const ReportedInput = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  q: z.string().trim().max(200).default(""),
  status: z.enum(["all", "open", "reviewed", "dismissed"]).default("open"),
  reason: z.string().trim().max(100).default("all"),
});

export type AdminReportRow = {
  report_id: string;
  product_id: string | null;
  product_name: string | null;
  product_code: string | null;
  product_image_url: string | null;
  product_status: string | null;
  vendor_id: string | null;
  vendor_shop_name: string | null;
  reason: string;
  reason_category: string | null;
  status: string;
  created_at: string;
  reports_total: number;
};

export type AdminReportsPage = {
  rows: AdminReportRow[];
  total: number;
  page: number;
  pageSize: number;
  totals: { open: number; reviewed: number; dismissed: number };
};

export const listReportedProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => (input ? ReportedInput.parse(input) : ReportedInput.parse({})))
  .handler(async ({ data, context }): Promise<AdminReportsPage> => {
    await assertPermission(context.userId, "support");

    let q = supabaseAdmin
      .from("product_reports")
      .select("id, product_id, vendor_id, reason, reason_category, status, created_at", { count: "exact" })
      .eq("report_type", "product");

    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.reason !== "all" && data.reason.length > 0) q = q.eq("reason_category", data.reason);

    const search = data.q.trim();
    if (search.length > 0) {
      const safe = search.replace(/[,()]/g, " ");
      const p = `%${safe}%`;
      q = q.ilike("reason", p);
    }

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    q = q.order("created_at", { ascending: false }).range(from, to);

    const { data: reps, error, count } = await q;
    if (error) throw new Error(error.message);

    const productIds = Array.from(new Set((reps ?? []).map((r) => r.product_id).filter(Boolean) as string[]));

    const [prodsRes, imgsRes, countsRes, totalsRes] = await Promise.all([
      productIds.length
        ? supabaseAdmin
            .from("products")
            .select("id, name, code, status, vendor_id")
            .in("id", productIds)
        : Promise.resolve({ data: [] as { id: string; name: string; code: string; status: string; vendor_id: string }[] }),
      productIds.length
        ? supabaseAdmin.from("product_images").select("product_id, url, position").in("product_id", productIds).order("position", { ascending: true })
        : Promise.resolve({ data: [] as { product_id: string; url: string; position: number }[] }),
      productIds.length
        ? supabaseAdmin
            .from("product_reports")
            .select("product_id")
            .eq("report_type", "product")
            .in("product_id", productIds)
        : Promise.resolve({ data: [] as { product_id: string }[] }),
      supabaseAdmin.from("product_reports").select("status").eq("report_type", "product"),
    ]);

    const prodMap = new Map((prodsRes.data ?? []).map((p) => [p.id, p]));

    const vendorIds = Array.from(new Set((prodsRes.data ?? []).map((p) => p.vendor_id).filter(Boolean) as string[]));
    const vendorsRes = vendorIds.length
      ? await supabaseAdmin.from("profiles").select("id, shop_name").in("id", vendorIds)
      : { data: [] as { id: string; shop_name: string | null }[] };
    const vendorMap = new Map((vendorsRes.data ?? []).map((v) => [v.id, v]));

    const firstImg = new Map<string, string>();
    for (const im of imgsRes.data ?? []) {
      if (!firstImg.has(im.product_id)) firstImg.set(im.product_id, im.url);
    }

    const countMap = new Map<string, number>();
    for (const c of countsRes.data ?? []) {
      if (!c.product_id) continue;
      countMap.set(c.product_id, (countMap.get(c.product_id) ?? 0) + 1);
    }

    const totals = { open: 0, reviewed: 0, dismissed: 0 };
    for (const r of totalsRes.data ?? []) {
      const s = String(r.status ?? "open") as keyof typeof totals;
      if (s in totals) totals[s] += 1;
    }

    const rows: AdminReportRow[] = (reps ?? []).map((r) => {
      const p = r.product_id ? prodMap.get(r.product_id) : null;
      const v = p?.vendor_id ? vendorMap.get(p.vendor_id) : null;
      return {
        report_id: r.id,
        product_id: r.product_id,
        product_name: p?.name ?? null,
        product_code: p?.code ?? null,
        product_image_url: r.product_id ? firstImg.get(r.product_id) ?? null : null,
        product_status: p?.status ?? null,
        vendor_id: p?.vendor_id ?? r.vendor_id ?? null,
        vendor_shop_name: v?.shop_name ?? null,
        reason: r.reason,
        reason_category: r.reason_category,
        status: r.status,
        created_at: r.created_at,
        reports_total: (r.product_id && countMap.get(r.product_id)) || 1,
      };
    });

    return { rows, total: count ?? rows.length, page: data.page, pageSize: data.pageSize, totals };
  });

/* ============================================================
   Mutations
   ============================================================ */

export const setProductStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        product_id: z.string().uuid(),
        status: z.enum(["approved", "rejected", "pending"]),
        rejection_reason: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "product_validation");

    // Read current state for audit log
    const { data: before } = await supabaseAdmin
      .from("products")
      .select("id, name, code, status, vendor_id")
      .eq("id", data.product_id)
      .maybeSingle();

    if (data.status === "approved") {
      const { data: product, error: productErr } = await supabaseAdmin
        .from("products")
        .select("id, vendor_id, code")
        .eq("id", data.product_id)
        .maybeSingle();
      if (productErr || !product) throw new Error(productErr?.message || "Produit introuvable");

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

    const payload: { status: "approved" | "rejected" | "pending"; rejection_reason?: string | null; is_edit?: boolean } = {
      status: data.status,
    };
    if (data.status === "rejected") payload.rejection_reason = data.rejection_reason || "Non conforme";
    else payload.rejection_reason = null;
    if (data.status === "approved") payload.is_edit = false;
    const { error } = await supabaseAdmin.from("products").update(payload).eq("id", data.product_id);
    if (error) throw new Error(error.message);

    // Audit log
    logAdminAction({
      action: `product.${data.status}`,
      targetType: "product",
      targetId: data.product_id,
      oldValues: before ? { status: before.status, name: before.name, code: before.code } : undefined,
      newValues: { status: data.status, rejection_reason: data.status === "rejected" ? (data.rejection_reason || "Non conforme") : null },
    });

    // Notify vendor about the new status
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("vendor_id, name, code")
      .eq("id", data.product_id)
      .maybeSingle();
    if (product?.vendor_id) {
      const reason = (data.rejection_reason || "").trim();
      const label = product.name || product.code || "votre produit";
      let title = "";
      let message = "";
      if (data.status === "approved") {
        title = "✅ Produit approuvé";
        message = `« ${label} » a été approuvé et publié${reason ? ` — Note admin : ${reason}` : ""}.`;
      } else if (data.status === "rejected") {
        title = "❌ Produit rejeté";
        message = `« ${label} » a été rejeté. Motif : ${reason || "Non conforme"}`;
      } else {
        title = "⏳ Produit remis en attente";
        message = `« ${label} » est de nouveau en attente de validation${reason ? ` — ${reason}` : ""}.`;
      }
      await supabaseAdmin.from("notifications").insert({
        user_id: product.vendor_id,
        title,
        message,
        link: "/vendor/products",
      });
    }

    return { ok: true };
  });

export const deleteOrArchiveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ product_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; mode: "deleted" | "archived"; message: string }> => {
    await assertPermission(context.userId, "product_validation");

    const { data: product, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id, name, code, vendor_id")
      .eq("id", data.product_id)
      .maybeSingle();
    if (prodErr) throw new Error(prodErr.message);
    if (!product) return { ok: true, mode: "deleted", message: "Produit déjà supprimé." };

    // Check sales history
    const { count: salesCount, error: salesErr } = await supabaseAdmin
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", data.product_id);
    if (salesErr) throw new Error(salesErr.message);

    if ((salesCount ?? 0) > 0) {
      // Logical archive — keep history intact
      const { error: archErr } = await supabaseAdmin
        .from("products")
        .update({
          is_active: false,
          archived_at: new Date().toISOString(),
          rejection_reason: "Archivé par l'administration",
        })
        .eq("id", data.product_id);
      if (archErr) throw new Error(archErr.message);
      logAdminAction({
        action: "product.archive",
        targetType: "product",
        targetId: data.product_id,
        oldValues: { name: product.name, code: product.code, status: "approved", vendor_id: product.vendor_id },
        newValues: { archived: true, reason: "Has sales history" },
      });
      return {
        ok: true,
        mode: "archived",
        message: `« ${product.name} » a été archivé (lié à ${salesCount} vente(s)).`,
      };
    }

    // Hard delete — clean children first (no FK cascade)
    await supabaseAdmin.from("product_customizations").delete().eq("product_id", data.product_id);
    await supabaseAdmin.from("product_images").delete().eq("product_id", data.product_id);
    await supabaseAdmin.from("product_variants").delete().eq("product_id", data.product_id);
    await supabaseAdmin.from("product_admin_metadata").delete().eq("product_id", data.product_id);
    await supabaseAdmin.from("product_reviews").delete().eq("product_id", data.product_id);
    await supabaseAdmin.from("product_reports").delete().eq("product_id", data.product_id);
    await supabaseAdmin.from("cart_items").delete().eq("product_id", data.product_id);
    // moderation feedback items via feedback ids
    const { data: feedbacks } = await supabaseAdmin
      .from("product_moderation_feedback")
      .select("id")
      .eq("product_id", data.product_id);
    const fbIds = (feedbacks ?? []).map((f) => f.id);
    if (fbIds.length > 0) {
      await supabaseAdmin.from("product_moderation_feedback_items").delete().in("feedback_id", fbIds);
      await supabaseAdmin.from("product_moderation_feedback").delete().in("id", fbIds);
    }

    const { error: delErr } = await supabaseAdmin.from("products").delete().eq("id", data.product_id);
    if (delErr) throw new Error(delErr.message);

    logAdminAction({
      action: "product.delete",
      targetType: "product",
      targetId: data.product_id,
      oldValues: { name: product.name, code: product.code, vendor_id: product.vendor_id },
    });

    return { ok: true, mode: "deleted", message: `« ${product.name} » a été supprimé définitivement.` };
  });

export const setReportStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        report_id: z.string().uuid(),
        status: z.enum(["open", "reviewed", "dismissed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "support");
    const { error } = await supabaseAdmin
      .from("product_reports")
      .update({ status: data.status })
      .eq("id", data.report_id);
    if (error) throw new Error(error.message);

    logAdminAction({
      action: `report.${data.status === "reviewed" ? "review" : "dismiss"}`,
      targetType: "report",
      targetId: data.report_id,
      newValues: { status: data.status },
    });

    return { ok: true };
  });
