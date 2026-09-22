// ═══════════════════════════════════════════════════════════════
// Module « Importer depuis CJ » — fonctions serveur (administrateurs).
//
// Endpoints officiels utilisés (doc CJ API 2.0) :
//  • GET /product/listV2      → recherche catalogue (50 points/appel)
//  • GET /product/query       → fiche produit + variantes + stocks (10 points)
//  • GET /product/getCategory → arborescence des catégories CJ (mise en cache 24 h)
// product/list est marqué « Deprecated » par CJ : on ne l'utilise pas.
// ═══════════════════════════════════════════════════════════════
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CjCallTrace } from "@/lib/cj/client.server";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Accès réservé aux administrateurs.");
}

export interface CjSearchHit {
  pid: string;
  name: string | null;
  sku: string | null;
  image: string | null;
  cost: number | null;
  currency: string;
  categoryPath: string | null;
  alreadyImported: boolean;
  productId: string | null;
}

export interface CjSearchResult {
  ok: boolean;
  error: string | null;
  endpoint: string;
  hits: CjSearchHit[];
  total: number;
  apiCalls: number;
  pointsRemaining: number | null;
}

const isPid = (q: string) => /^\d{12,}$/.test(q);

/**
 * Recherche un produit CJ par identifiant, SKU ou mots-clés.
 * Un identifiant ou un SKU passe par product/query (10 points) au lieu de
 * la recherche catalogue (50 points) : c'est cinq fois moins cher.
 */
export const searchCjProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string; page?: number }) => ({
    query: String(input?.query ?? "").trim(),
    page: Math.max(1, Math.min(50, Number(input?.page ?? 1) || 1)),
  }))
  .handler(async ({ context, data }): Promise<CjSearchResult> => {
    await assertAdmin(context);
    const { cjGet } = await import("@/lib/cj/client.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const traces: CjCallTrace[] = [];

    const out: CjSearchResult = {
      ok: false,
      error: null,
      endpoint: "",
      hits: [],
      total: 0,
      apiCalls: 0,
      pointsRemaining: null,
    };
    if (!data.query) return { ...out, error: "Indiquez un identifiant, un SKU ou des mots-clés." };

    try {
      let hits: CjSearchHit[] = [];

      if (isPid(data.query) || /^CJ[A-Z0-9]+$/i.test(data.query)) {
        // Accès direct : identifiant CJ ou SKU produit.
        out.endpoint = "/product/query";
        const param = isPid(data.query) ? "pid" : "productSku";
        const p = await cjGet<any>(
          `/product/query?${param}=${encodeURIComponent(data.query)}`,
          traces,
        );
        if (p?.pid) {
          const costs = (Array.isArray(p.variants) ? p.variants : [])
            .map((v: any) => Number(v?.variantSellPrice))
            .filter((n: number) => Number.isFinite(n));
          hits = [
            {
              pid: String(p.pid),
              name: p.productNameEn ?? p.productName ?? null,
              sku: p.productSku ?? null,
              image: p.productImage ?? p.bigImage ?? null,
              cost: costs.length ? Math.min(...costs) : null,
              currency: "USD",
              categoryPath: p.categoryName ?? null,
              alreadyImported: false,
              productId: null,
            },
          ];
        }
      } else {
        // Recherche par mots-clés : endpoint officiel listV2.
        out.endpoint = "/product/listV2";
        const r = await cjGet<any>(
          `/product/listV2?keyWord=${encodeURIComponent(data.query)}&page=${data.page}&size=20`,
          traces,
        );
        const content: any[] = Array.isArray(r?.content) ? r.content : [];
        const list: any[] = content.flatMap((c) =>
          Array.isArray(c?.productList) ? c.productList : [],
        );
        out.total = Number(r?.totalRecords ?? list.length) || list.length;
        hits = list.map((item) => ({
          // listV2 nomme l'identifiant produit « id » (et non « pid »).
          pid: String(item?.id ?? item?.pid ?? ""),
          name: item?.nameEn ?? null,
          sku: item?.sku ?? null,
          image: item?.bigImage ?? null,
          cost: Number.isFinite(Number(item?.sellPrice)) ? Number(item.sellPrice) : null,
          currency: "USD",
          categoryPath:
            [item?.oneCategoryName, item?.twoCategoryName, item?.threeCategoryName]
              .filter(Boolean)
              .join(" > ") || null,
          alreadyImported: false,
          productId: null,
        }));
      }

      // Marquage des produits déjà importés (aucun appel API).
      const pids = hits.map((h) => h.pid).filter(Boolean);
      if (pids.length) {
        const { data: known } = await admin
          .from("cj_products")
          .select("cj_product_id, product_id")
          .in("cj_product_id", pids);
        const byPid = new Map<string, string | null>(
          (known ?? []).map((r: any) => [String(r.cj_product_id), (r.product_id as string) ?? null]),
        );
        hits = hits.map((h) =>
          byPid.has(h.pid)
            ? { ...h, alreadyImported: true, productId: byPid.get(h.pid) ?? null }
            : h,
        );
      }

      out.ok = true;
      out.hits = hits;
      if (!out.total) out.total = hits.length;
      out.apiCalls = traces.length;
      out.pointsRemaining =
        [...traces].reverse().find((t) => t.pointsRemaining !== null)?.pointsRemaining ?? null;
      return out;
    } catch (e) {
      return {
        ...out,
        error: e instanceof Error ? e.message : "Erreur inconnue",
        apiCalls: traces.length,
      };
    }
  });

export interface CjCategoryRow {
  cj_category_id: string;
  cj_category_name: string | null;
  cj_category_path: string | null;
  kawzone_category_id: string | null;
  status: string;
}

export interface KzCategoryRow {
  id: string;
  name: string;
  level: number;
  path: string;
}

/** Correspondances de catégories déjà rencontrées + arbre KawZone. */
export const getCjCategoryMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ mappings: CjCategoryRow[]; kawzone: KzCategoryRow[] }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: mappings } = await admin
      .from("cj_category_map")
      .select("cj_category_id, cj_category_name, cj_category_path, kawzone_category_id, status")
      .order("status", { ascending: true })
      .order("cj_category_name", { ascending: true });

    const { data: cats } = await admin
      .from("categories")
      .select("id, name, parent_id, level")
      .order("level", { ascending: true })
      .order("name", { ascending: true });

    const byId = new Map((cats ?? []).map((c: any) => [c.id, c]));
    const pathOf = (c: any): string => {
      const parts = [c.name];
      let cur = c;
      for (let i = 0; i < 4 && cur?.parent_id; i += 1) {
        cur = byId.get(cur.parent_id);
        if (!cur) break;
        parts.unshift(cur.name);
      }
      return parts.join(" › ");
    };

    return {
      mappings: (mappings ?? []) as CjCategoryRow[],
      kawzone: (cats ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        level: c.level ?? 1,
        path: pathOf(c),
      })),
    };
  });

/** Associe une catégorie CJ à une catégorie KawZone (mémorisé pour les imports suivants). */
export const setCjCategoryMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cjCategoryId: string; kawzoneCategoryId: string | null; applyToProducts?: boolean }) => ({
    cjCategoryId: String(input?.cjCategoryId ?? "").trim(),
    kawzoneCategoryId: input?.kawzoneCategoryId ? String(input.kawzoneCategoryId) : null,
    applyToProducts: input?.applyToProducts !== false,
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (!data.cjCategoryId) throw new Error("Catégorie CJ manquante.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    await admin
      .from("cj_category_map")
      .update({
        kawzone_category_id: data.kawzoneCategoryId,
        status: data.kawzoneCategoryId ? "mapped" : "pending",
        created_by: context.userId,
      })
      .eq("cj_category_id", data.cjCategoryId);

    let updatedProducts = 0;
    if (data.applyToProducts && data.kawzoneCategoryId) {
      const { data: rows } = await admin
        .from("cj_products")
        .select("product_id")
        .eq("cj_category_id", data.cjCategoryId);
      const ids = (rows ?? []).map((r: any) => r.product_id).filter(Boolean);
      if (ids.length) {
        await admin.from("products").update({ category_id: data.kawzoneCategoryId }).in("id", ids);
        await admin
          .from("cj_products")
          .update({ kawzone_category_id: data.kawzoneCategoryId, category_mapping_status: "mapped" })
          .eq("cj_category_id", data.cjCategoryId);
        updatedProducts = ids.length;
      }
    }
    return { ok: true, updatedProducts };
  });

/** Derniers imports CJ (page de contrôle). */
export const getCjImportedProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data } = await admin
      .from("cj_products")
      .select(
        "cj_product_id, product_id, cj_sku, name_en, cj_category_name, cj_category_path, category_mapping_status, last_imported_at, description_images_extracted",
      )
      .order("last_imported_at", { ascending: false })
      .limit(50);
    return { rows: data ?? [] };
  });
