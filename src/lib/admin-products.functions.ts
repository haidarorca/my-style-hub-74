import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);
  if (error) throw new Error(`Erreur rôle: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Accès refusé : admin requis");
}

/* ============================================================
   Moderation list (pending / approved / rejected)
   ============================================================ */

const ModerationInput = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  q: z.string().trim().max(200).default(""),
  status: z.enum(["all", "pending", "approved", "rejected"]).default("pending"),
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
  totals: { pending: number; approved: number; rejected: number; edits_pending: number };
};

export const listAdminProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => (input ? ModerationInput.parse(input) : ModerationInput.parse({})))
  .handler(async ({ data, context }): Promise<AdminProductsPage> => {
    await assertAdmin(context.userId);

    let q = supabaseAdmin
      .from("products")
      .select(
        "id, name, code, price, status, is_edit, rejection_reason, vendor_id, created_at, updated_at, pending_category_request_id",
        { count: "exact" },
      );

    if (data.status !== "all") q = q.eq("status", data.status);
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
      supabaseAdmin.from("products").select("status, is_edit"),
    ]);

    const vendorMap = new Map((vendorsRes.data ?? []).map((v) => [v.id, v]));
    const firstImg = new Map<string, string>();
    for (const im of imgsRes.data ?? []) {
      if (!firstImg.has(im.product_id)) firstImg.set(im.product_id, im.url);
    }

    const totals = { pending: 0, approved: 0, rejected: 0, edits_pending: 0 };
    for (const p of totalsRes.data ?? []) {
      const s = String(p.status ?? "pending") as keyof typeof totals;
      if (s in totals) totals[s] += 1;
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
    await assertAdmin(context.userId);

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
    await assertAdmin(context.userId);
    const payload: { status: string; rejection_reason?: string | null; is_edit?: boolean } = {
      status: data.status,
    };
    if (data.status === "rejected") payload.rejection_reason = data.rejection_reason || "Non conforme";
    else payload.rejection_reason = null;
    if (data.status === "approved") payload.is_edit = false;
    const { error } = await supabaseAdmin.from("products").update(payload).eq("id", data.product_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setReportStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        report_id: z.string().uuid(),
        status: z.enum(["open", "reviewing", "resolved", "dismissed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("product_reports")
      .update({ status: data.status })
      .eq("id", data.report_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
