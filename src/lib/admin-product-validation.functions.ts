// Validation produits — liste scalable (curseur), filtres serveur, sélection
// globale par filtre et actions en masse groupées.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission, logAdminAction } from "./admin-auth.core";

export const ValidationFilterSchema = z.object({
  q: z.string().trim().max(200).default(""),
  status: z.enum(["all", "to_review", "approved", "auto", "manual", "rejected", "archived"]).default("to_review"),
  source: z.enum(["all", "cj_import", "manual", "other"]).default("all"),
  kind: z.enum(["all", "new", "edit"]).default("all"),
  vendorId: z.string().uuid().nullable().default(null),
  categoryId: z.string().uuid().nullable().default(null),
  dateFrom: z.string().max(30).nullable().default(null),
  dateTo: z.string().max(30).nullable().default(null),
  quality: z.enum(["all", "issues", "incomplete"]).default("all"),
  sort: z.enum(["created_at", "updated_at"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});
export type ValidationFilter = z.infer<typeof ValidationFilterSchema>;

export type ValidationRow = {
  id: string;
  name: string;
  code: string;
  price: number;
  status: "pending" | "approved" | "rejected";
  is_active: boolean;
  is_edit: boolean | null;
  is_archived: boolean;
  source: "cj_import" | "manual" | "other";
  validation_mode: "auto" | "manual" | null;
  review_reasons: string[];
  rejection_reason: string | null;
  vendor_id: string;
  vendor_name: string | null;
  image_url: string | null;
  created_at: string;
  pending_category_request_id: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, f: ValidationFilter, shopIds: string[]) {
  if (f.status === "archived") q = q.not("archived_at", "is", null);
  else {
    q = q.is("archived_at", null);
    if (f.status === "to_review") q = q.eq("status", "pending");
    else if (f.status === "approved") q = q.eq("status", "approved");
    else if (f.status === "auto") q = q.eq("status", "approved").eq("validation_mode", "auto");
    else if (f.status === "manual") q = q.eq("status", "approved").neq("validation_mode", "auto");
    else if (f.status === "rejected") q = q.eq("status", "rejected");
  }
  if (f.source !== "all") q = q.eq("source", f.source);
  if (f.kind === "new") q = q.eq("is_edit", false);
  if (f.kind === "edit") q = q.eq("is_edit", true);
  if (f.vendorId) q = q.eq("vendor_id", f.vendorId);
  if (f.categoryId) q = q.eq("category_id", f.categoryId);
  if (f.dateFrom) q = q.gte("created_at", f.dateFrom);
  if (f.dateTo) q = q.lte("created_at", `${f.dateTo}T23:59:59.999Z`);
  if (f.quality === "issues") q = q.neq("review_reasons", "{}");
  if (f.quality === "incomplete") q = q.or("category_id.is.null,price.is.null,price.lte.0,cost_price.is.null");
  const search = f.q.trim();
  if (search) {
    const safe = search.replace(/[,()%*\\]/g, " ").trim();
    if (safe) {
      const p = `%${safe}%`;
      const ors = [`name.ilike.${p}`, `designation.ilike.${p}`, `code.ilike.${p}`, `sku.ilike.${p}`, `supplier_ref.ilike.${p}`, `external_product_id.ilike.${p}`];
      if (shopIds.length) ors.push(`vendor_id.in.(${shopIds.join(",")})`);
      q = q.or(ors.join(","));
    }
  }
  return q;
}

async function shopIdsFor(f: ValidationFilter): Promise<string[]> {
  const safe = f.q.trim().replace(/[,()%*\\]/g, " ").trim();
  if (!safe) return [];
  const { data } = await supabaseAdmin.from("profiles").select("id").ilike("shop_name", `%${safe}%`).limit(50);
  return (data ?? []).map((s) => s.id);
}

const ListInput = z.object({
  filter: ValidationFilterSchema,
  cursor: z.object({ v: z.string(), id: z.string().uuid() }).nullable().default(null),
  limit: z.number().int().min(10).max(100).default(40),
  withCount: z.boolean().default(false),
});

export const listValidationProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ListInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "product_validation");
    const f = data.filter;
    const col = f.sort;
    const asc = f.dir === "asc";
    let q = supabaseAdmin
      .from("products")
      .select("id, name, code, price, status, is_active, is_edit, archived_at, source, validation_mode, review_reasons, rejection_reason, vendor_id, created_at, updated_at, pending_category_request_id");
    const shopIds = await shopIdsFor(f);
    q = applyFilters(q, f, shopIds);
    if (data.cursor) {
      const op = asc ? "gt" : "lt";
      q = q.or(`${col}.${op}.${data.cursor.v},and(${col}.eq.${data.cursor.v},id.${op}.${data.cursor.id})`);
    }
    q = q.order(col, { ascending: asc }).order("id", { ascending: asc }).limit(data.limit);

    const countPromise = data.withCount
      ? applyFilters(supabaseAdmin.from("products").select("id", { count: "exact", head: true }), f, shopIds)
      : null;
    const [{ data: prods, error }, countRes] = await Promise.all([q, countPromise]);
    if (error) throw new Error(error.message);
    const list = prods ?? [];

    const vendorIds = [...new Set(list.map((p) => p.vendor_id))];
    const ids = list.map((p) => p.id);
    const [vendorsRes, imgsRes] = await Promise.all([
      vendorIds.length ? supabaseAdmin.from("profiles").select("id, shop_name, full_name").in("id", vendorIds) : Promise.resolve({ data: [] as { id: string; shop_name: string | null; full_name: string | null }[] }),
      ids.length ? supabaseAdmin.from("product_images").select("product_id, url, position").in("product_id", ids).order("position", { ascending: true }) : Promise.resolve({ data: [] as { product_id: string; url: string; position: number }[] }),
    ]);
    const vmap = new Map((vendorsRes.data ?? []).map((v) => [v.id, v.shop_name || v.full_name]));
    const img = new Map<string, string>();
    for (const im of imgsRes.data ?? []) if (!img.has(im.product_id)) img.set(im.product_id, im.url);

    const rows: ValidationRow[] = list.map((p) => ({
      id: p.id, name: p.name, code: p.code, price: Number(p.price ?? 0),
      status: p.status as ValidationRow["status"], is_active: !!p.is_active, is_edit: p.is_edit,
      is_archived: !!p.archived_at, source: (p.source ?? "manual") as ValidationRow["source"],
      validation_mode: (p.validation_mode ?? null) as ValidationRow["validation_mode"],
      review_reasons: (p.review_reasons as string[] | null) ?? [], rejection_reason: p.rejection_reason,
      vendor_id: p.vendor_id, vendor_name: vmap.get(p.vendor_id) ?? null, image_url: img.get(p.id) ?? null,
      created_at: p.created_at, pending_category_request_id: p.pending_category_request_id,
    }));
    const last = list[list.length - 1];
    const nextCursor = list.length === data.limit && last ? { v: String(last[col]), id: last.id } : null;
    let total: number | null = null;
    if (countRes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cr: any = countRes;
      if (cr.error) throw new Error(cr.error.message);
      total = cr.count ?? 0;
    }
    return { rows, nextCursor, total };
  });

/** Compteurs globaux (requêtes de comptage, aucune ligne chargée). */
export const getValidationTotals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context.userId, "product_validation");
    const c = () => supabaseAdmin.from("products").select("id", { count: "exact", head: true });
    const [toReview, auto, approved, rejected, archived, issues] = await Promise.all([
      c().is("archived_at", null).eq("status", "pending"),
      c().is("archived_at", null).eq("status", "approved").eq("validation_mode", "auto"),
      c().is("archived_at", null).eq("status", "approved"),
      c().is("archived_at", null).eq("status", "rejected"),
      c().not("archived_at", "is", null),
      c().is("archived_at", null).eq("status", "pending").neq("review_reasons", "{}" as never),
    ]);
    return {
      to_review: toReview.count ?? 0, auto: auto.count ?? 0, approved: approved.count ?? 0,
      rejected: rejected.count ?? 0, archived: archived.count ?? 0, issues: issues.count ?? 0,
    };
  });

/** Boutiques et catégories pour les filtres. */
export const getValidationFacets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context.userId, "product_validation");
    const [shops, cats] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, shop_name").not("shop_name", "is", null).order("shop_name").limit(2000),
      supabaseAdmin.from("categories").select("id, name, parent_id").limit(5000),
    ]);
    const byId = new Map((cats.data ?? []).map((c) => [c.id, c]));
    const path = (id: string) => {
      const parts: string[] = [];
      let cur = byId.get(id);
      let guard = 0;
      while (cur && guard++ < 6) { parts.unshift(cur.name); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
      return parts.join(" › ");
    };
    return {
      vendors: (shops.data ?? []).filter((s) => s.shop_name?.trim()).map((s) => ({ id: s.id, name: s.shop_name as string })),
      categories: (cats.data ?? []).map((c) => ({ id: c.id, path: path(c.id) })).sort((a, b) => a.path.localeCompare(b.path, "fr")),
    };
  });

/** Tous les identifiants correspondant au filtre (pas seulement les lignes affichées). */
export const resolveValidationSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ filter: ValidationFilterSchema }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "product_validation");
    const ids: string[] = [];
    const shopIds = await shopIdsFor(data.filter);
    const PAGE = 1000;
    for (let from = 0; from < 200_000; from += PAGE) {
      let q = supabaseAdmin.from("products").select("id");
      q = applyFilters(q, data.filter, shopIds);
      const { data: rows, error } = await q.order("id").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) ids.push(r.id);
      if (!rows || rows.length < PAGE) break;
    }
    return { ids };
  });

/** Action groupée sur un lot (≤ 200). Une requête par étape, pas par produit. */
export const bulkValidationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(200),
      action: z.enum(["approve", "reject", "delete"]),
      reason: z.string().trim().max(500).nullable().default(null),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "product_validation");
    const ids = [...new Set(data.ids)];
    const { data: rows, error } = await supabaseAdmin
      .from("products").select("id, name, code, status, vendor_id, archived_at, pending_category_request_id").in("id", ids);
    if (error) throw new Error(error.message);
    const found = new Map((rows ?? []).map((r) => [r.id, r]));
    const errors: Array<{ id: string; name: string | null; reason: string }> = [];
    for (const id of ids) if (!found.has(id)) errors.push({ id, name: null, reason: "Produit introuvable" });

    let okIds: string[] = [];
    let archivedIds: string[] = [];
    const now = new Date().toISOString();

    if (data.action === "approve" || data.action === "reject") {
      for (const r of rows ?? []) {
        if (r.archived_at) { errors.push({ id: r.id, name: r.name, reason: "Produit archivé" }); continue; }
        if (data.action === "approve" && r.pending_category_request_id) { errors.push({ id: r.id, name: r.name, reason: "Catégorie proposée à valider d'abord" }); continue; }
        okIds.push(r.id);
      }
      if (okIds.length) {
        const payload = data.action === "approve"
          ? { status: "approved" as const, rejection_reason: null, is_edit: false, validation_mode: "manual", validated_at: now, review_reasons: [] as string[] }
          : { status: "rejected" as const, rejection_reason: data.reason || "Non conforme", validation_mode: null, validated_at: null };
        const { error: upErr } = await supabaseAdmin.from("products").update(payload).in("id", okIds);
        if (upErr) {
          for (const id of okIds) errors.push({ id, name: found.get(id)?.name ?? null, reason: upErr.message });
          okIds = [];
        }
      }
      // Une notification par boutique et par lot (pas une par produit).
      const perVendor = new Map<string, number>();
      for (const id of okIds) { const v = found.get(id)!.vendor_id; perVendor.set(v, (perVendor.get(v) ?? 0) + 1); }
      if (perVendor.size) {
        await supabaseAdmin.from("notifications").insert([...perVendor].map(([user_id, n]) => ({
          user_id,
          title: data.action === "approve" ? "✅ Produits approuvés" : "❌ Produits rejetés",
          message: data.action === "approve"
            ? `${n} produit(s) ont été approuvés.`
            : `${n} produit(s) ont été rejetés. Motif : ${data.reason || "Non conforme"}`,
          link: "/vendor/products",
        })));
      }
    } else {
      const present = (rows ?? []).map((r) => r.id);
      if (present.length) {
        const { data: sold } = await supabaseAdmin.from("order_items").select("product_id").in("product_id", present);
        const soldSet = new Set((sold ?? []).map((s) => s.product_id as string));
        archivedIds = present.filter((id) => soldSet.has(id));
        const del = present.filter((id) => !soldSet.has(id));
        if (archivedIds.length) {
          const { error: aErr } = await supabaseAdmin.from("products")
            .update({ is_active: false, archived_at: now, rejection_reason: "Archivé par l'administration" }).in("id", archivedIds);
          if (aErr) { for (const id of archivedIds) errors.push({ id, name: found.get(id)?.name ?? null, reason: aErr.message }); archivedIds = []; }
        }
        if (del.length) {
          for (const t of ["product_customizations", "product_images", "product_variants", "product_admin_metadata", "product_reviews", "product_reports", "cart_items"] as const) {
            await supabaseAdmin.from(t).delete().in("product_id", del);
          }
          const { data: fbs } = await supabaseAdmin.from("product_moderation_feedback").select("id").in("product_id", del);
          const fbIds = (fbs ?? []).map((f) => f.id);
          if (fbIds.length) {
            await supabaseAdmin.from("product_moderation_feedback_items").delete().in("feedback_id", fbIds);
            await supabaseAdmin.from("product_moderation_feedback").delete().in("id", fbIds);
          }
          await supabaseAdmin.from("cj_products").update({ product_id: null }).in("product_id", del);
          const { error: dErr } = await supabaseAdmin.from("products").delete().in("id", del);
          if (dErr) for (const id of del) errors.push({ id, name: found.get(id)?.name ?? null, reason: dErr.message });
          else okIds = del;
        }
      }
    }

    logAdminAction({
      action: `product.bulk_${data.action}`,
      targetType: "product",
      targetId: ids[0],
      newValues: { count: okIds.length + archivedIds.length, ids: [...okIds, ...archivedIds], errors: errors.length, reason: data.reason },
    });
    return { done: okIds.length, archived: archivedIds.length, errors };
  });
