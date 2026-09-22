// ═══════════════════════════════════════════════════════════════
// Import CJdropshipping — UN produit à la fois (test).
//
// Règles :
//  • Le produit est créé en BROUILLON (status pending, is_active false).
//  • Aucun prix de vente inventé : prix = 0, seul le coût CJ est enregistré.
//  • Le stock CJ n'est PAS versé dans le stock local (stock local = 0).
//  • Aucune catégorie devinée : mapping CJ → KawZone laissé « en attente ».
//  • Idempotent : un même CJ Product ID ne crée jamais un second produit.
// ═══════════════════════════════════════════════════════════════
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CjCallTrace } from "@/lib/cj/client.server";
import type { MediaStats } from "@/lib/cj/media.server";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Accès réservé aux administrateurs.");
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
/** grammes → kilogrammes */
const gToKg = (v: unknown) => {
  const n = num(v);
  return n === null ? null : Math.round((n / 1000) * 1e6) / 1e6;
};
/** millimètres → centimètres */
const mmToCm = (v: unknown) => {
  const n = num(v);
  return n === null ? null : Math.round((n / 10) * 1e4) / 1e4;
};
/** CBM = L(m) × l(m) × h(m), à partir de millimètres */
const cbmFromMm = (l: unknown, w: unknown, h: unknown) => {
  const a = num(l), b = num(w), c = num(h);
  if (a === null || b === null || c === null) return null;
  return Math.round((a / 1000) * (b / 1000) * (c / 1000) * 1e9) / 1e9;
};

function splitVariantKey(key: unknown): { size: string | null; color: string | null } {
  if (typeof key !== "string" || !key.trim()) return { size: null, color: null };
  const parts = key.split("-").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { size: null, color: null };
  if (parts.length === 1) return { size: parts[0] ?? null, color: null };
  return { size: parts[0] ?? null, color: parts.slice(1).join("-") };
}

export interface CjImportReport {
  ok: boolean;
  action: "created" | "updated" | "duplicate" | "error";
  error: string | null;
  cjProductId: string | null;
  productId: string | null;
  productName: string | null;
  cjSku: string | null;
  cjCategory: string | null;
  categoryMapping: string;
  /** Chaîne KawZone attribuée : catégorie › sous-catégorie › sous-sous-catégorie. */
  kawzoneCategoryChain: string[];
  /** Niveaux CJ sans équivalent KawZone. */
  categoryUnresolved: string[];
  variantsTotal: number;
  variantsImported: number;
  images: number;
  media: { detected: number; uploaded: number; reused: number; failed: number; errors: string[] };
  variantImages: number;
  storageUrlPrefix: string | null;
  publicCleanCheck: { clean: boolean; offenders: string[] };
  apiCalls: number;
  pointsUsed: number | null;
  pointsRemaining: number | null;
  missing: string[];
  variants: Array<{
    vid: string;
    sku: string | null;
    barcode: string | null;
    name: string | null;
    size: string | null;
    color: string | null;
    costPrice: number | null;
    currency: string;
    cjStock: number | null;
    warehouse: string | null;
    weightKg: number | null;
    lengthCm: number | null;
    widthCm: number | null;
    heightCm: number | null;
    cbm: number | null;
    image: string | null;
  }>;
}

/**
 * Importe (ou met à jour) UN produit CJ en brouillon.
 * `mode: "check"` ne fait aucune écriture : il dit seulement si le produit
 * est déjà importé.
 */
export const importCjProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pid: string; update?: boolean; withStock?: boolean }) => ({
    pid: String(input?.pid ?? "").trim(),
    update: !!input?.update,
    // Le stock CJ coûte 10 points par variante : il n'est lu que sur demande.
    withStock: !!input?.withStock,
  }))
  .handler(async ({ context, data }): Promise<CjImportReport> => {
    await assertAdmin(context);
    if (!data.pid) throw new Error("Identifiant produit CJ manquant.");

    const { cjGet } = await import("@/lib/cj/client.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const traces: CjCallTrace[] = [];
    const missing: string[] = [];

    const base: CjImportReport = {
      ok: false,
      action: "error",
      error: null,
      cjProductId: data.pid,
      productId: null,
      productName: null,
      cjSku: null,
      cjCategory: null,
      categoryMapping: "pending",
      kawzoneCategoryChain: [],
      categoryUnresolved: [],
      variantsTotal: 0,
      variantsImported: 0,
      images: 0,
      media: { detected: 0, uploaded: 0, reused: 0, failed: 0, errors: [] },
      variantImages: 0,
      storageUrlPrefix: null,
      publicCleanCheck: { clean: false, offenders: [] },
      apiCalls: 0,
      pointsUsed: null,
      pointsRemaining: null,
      missing,
      variants: [],
    };

    try {
      // ── 1. Anti-doublon ──────────────────────────────────────────
      const { data: existing } = await admin
        .from("cj_products")
        .select("cj_product_id, product_id")
        .eq("cj_product_id", data.pid)
        .maybeSingle();

      if (existing && !data.update) {
        await admin.from("cj_import_log").insert({
          cj_product_id: data.pid,
          product_id: existing.product_id,
          action: "duplicate",
          result: "Produit CJ déjà importé",
          created_by: context.userId,
        });
        return {
          ...base,
          ok: false,
          action: "duplicate",
          error: "Produit CJ déjà importé — relancez avec « Mettre à jour » pour rafraîchir les données.",
          productId: existing.product_id ?? null,
        };
      }

      // ── 2. Lecture CJ ────────────────────────────────────────────
      // Documentation CJ « Products Synchronization Processing » :
      // product/query renvoie déjà le produit, ses variantes ET leurs
      // stocks (variants[].inventories). Un seul appel (10 points) suffit
      // donc ; on n'appelle product/stock/queryByVid qu'en secours.
      // countryCode=CN : CJ renvoie alors les stocks entrepôt Chine dans variants[].inventories.
      const p = await cjGet<any>(
        `/product/query?pid=${encodeURIComponent(data.pid)}&countryCode=CN`,
        traces,
      );
      const cjVariants: any[] = Array.isArray(p?.variants) ? p.variants : [];
      base.variantsTotal = cjVariants.length;

      const nameEn: string | null = p?.productNameEn ?? null;
      const nameCn: string | null = (() => {
        try {
          const arr = JSON.parse(p?.productName ?? "null");
          return Array.isArray(arr) ? (arr[0] ?? null) : (p?.productName ?? null);
        } catch {
          return p?.productName ?? null;
        }
      })();
      const images: string[] = Array.isArray(p?.productImageSet) ? p.productImageSet : [];
      const mainImage: string | null = p?.productImage ?? images[0] ?? null;
      // Doc CJ : materialNameEnSet / materialNameSet (tableaux).
      const material: string | null = (() => {
        const raw = p?.materialNameEnSet ?? p?.materialNameSet ?? p?.materialNameEn ?? null;
        const arr = Array.isArray(raw)
          ? raw
          : (() => {
              try {
                const parsed = JSON.parse(String(raw ?? "null"));
                return Array.isArray(parsed) ? parsed : raw ? [raw] : [];
              } catch {
                return raw ? [raw] : [];
              }
            })();
        const joined = arr.filter(Boolean).join(", ").trim();
        return joined || null;
      })();

      if (!nameEn && !nameCn) missing.push("nom du produit");
      if (!p?.description) missing.push("description");
      if (!images.length) missing.push("galerie d'images");
      if (!p?.entryCode) missing.push("code douanier");
      if (!material) missing.push("matière");

      // ── Stock CJ : lu dans la réponse produit (0 appel supplémentaire) ──
      const stockByVid = new Map<string, { qty: number | null; warehouse: string | null }>();
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const missingStock: any[] = [];
      for (const v of cjVariants) {
        const inv: any[] = Array.isArray(v?.inventories) ? v.inventories : [];
        if (!inv.length) {
          missingStock.push(v);
          continue;
        }
        const total = inv.reduce((s, r) => s + (num(r?.totalInventory) ?? 0), 0);
        const cn = inv.find((r) => r?.countryCode === "CN") ?? inv[0];
        stockByVid.set(v.vid, { qty: total, warehouse: cn?.countryCode ?? null });
      }
      // Secours 1 : getInventoryByPid — TOUTES les variantes en un seul appel
      // (10 points) au lieu d'un appel par variante (10 points × n).
      let groupedStockRaw: unknown = null;
      if (missingStock.length && data.withStock) {
        try {
          const all = await cjGet<any>(
            `/product/stock/getInventoryByPid?pid=${encodeURIComponent(data.pid)}`,
            traces,
          );
          groupedStockRaw = all;
          const rows: any[] = Array.isArray(all)
            ? all
            : Array.isArray(all?.list)
              ? all.list
              : Array.isArray(all?.variantInventories)
                ? all.variantInventories
                : [];
          for (const row of rows) {
            const vid = String(row?.vid ?? row?.variantId ?? "");
            if (!vid) continue;
            const qty =
              num(row?.totalInventoryNum) ??
              num(row?.totalInventory) ??
              num(row?.storageNum) ??
              null;
            if (qty !== null) {
              stockByVid.set(vid, { qty, warehouse: row?.areaEn ?? row?.countryCode ?? null });
            }
          }
        } catch {
          // On passe au secours suivant.
        }
      }

      // Secours 2 : appel par variante, uniquement pour celles encore sans stock.
      for (const v of (data.withStock ? missingStock : []).filter((v) => !stockByVid.has(v.vid))) {
        await wait(1200); // CJ limite cet endpoint à ~1 appel/seconde
        try {
          const s = await cjGet<any>(
            `/product/stock/queryByVid?vid=${encodeURIComponent(v.vid)}`,
            traces,
          );
          const row = Array.isArray(s) ? s[0] : null;
          stockByVid.set(v.vid, {
            qty: num(row?.totalInventoryNum),
            warehouse: row?.areaEn ?? null,
          });
        } catch {
          stockByVid.set(v.vid, { qty: null, warehouse: null });
          missing.push(`stock CJ variante ${v.variantSku ?? v.vid}`);
        }
      }
      if (!data.withStock && missingStock.length) {
        missing.push(
          "stocks CJ non lus (option « Lire aussi les stocks CJ » désactivée : 10 points par variante)",
        );
      }

      // ── 3. Produit KawZone (brouillon) ───────────────────────────
      const costs = cjVariants.map((v) => num(v.variantSellPrice)).filter((n): n is number => n !== null);
      const minCost = costs.length ? Math.min(...costs) : null;

      const vendorId = "60c9521c-1694-4e29-974b-d6a6f479bc1f"; // boutique administrateur

      // ── Médias : rapatriement dans le stockage KawZone ───────────
      const { mirrorImage, newMediaStats, containsSupplierRef } =
        await import("@/lib/cj/media.server");
      const { parseSupplierDescription } = await import("@/lib/cj/description");
      const { resolveCjCategory } = await import("@/lib/cj/categories.server");
      const media: MediaStats = newMediaStats();
      const mediaCache = new Map<string, string>();

      // La description fournisseur est découpée : texte d'un côté, images
      // de l'autre. Aucune balise <img> ne reste dans la description.
      const parsed = parseSupplierDescription(p?.description);
      const publicDescription = parsed.html;

      const hostedMain = mainImage ? await mirrorImage(mainImage, media, mediaCache) : null;
      const hostedGallery: string[] = [];
      // Galerie = image principale + images produit + images extraites de la description.
      for (const src of [...images, ...parsed.imageUrls].slice(0, 40)) {
        const hosted = await mirrorImage(src, media, mediaCache);
        if (hosted && !hostedGallery.includes(hosted)) hostedGallery.push(hosted);
      }
      if (hostedMain && !hostedGallery.includes(hostedMain)) hostedGallery.unshift(hostedMain);

      // ── Catégorie : mapping mémorisé, jamais deviné ──────────────
      const cjCategoryPath: string | null =
        p?.categoryName ?? [p?.categoryFirstName, p?.categorySecondName].filter(Boolean).join(" > ") ?? null;
      const category = await resolveCjCategory(
        p?.categoryId ? String(p.categoryId) : null,
        p?.categoryName ?? null,
        cjCategoryPath || null,
      );
      if (category.reason) missing.push(category.reason);
      base.categoryMapping = category.status;
      base.kawzoneCategoryChain = category.kawzoneChain;
      base.categoryUnresolved = category.unresolved;

      const productPayload: Record<string, unknown> = {
        vendor_id: vendorId,
        category_id: category.kawzoneCategoryId,
        code: p?.productSku ?? data.pid,
        sku: p?.productSku ?? null,
        name: nameEn ?? nameCn ?? data.pid,
        designation: nameCn ?? null,
        description: publicDescription, // description nettoyée, sans URL fournisseur
        price: 0, // notre prix de vente reste à définir
        status: "pending",
        is_active: false, // brouillon : non publié
        cost_price: minCost,
        cost_currency_code: "USD",
        supplier_ref: p?.productSku ?? null,
        external_product_id: data.pid,
        material,
      };

      let productId: string | null = existing?.product_id ?? null;
      if (productId) {
        await admin.from("products").update(productPayload).eq("id", productId);
      } else {
        const { data: created, error } = await admin
          .from("products")
          .insert(productPayload)
          .select("id")
          .single();
        if (error) throw new Error(`Création du produit refusée : ${error.message}`);
        productId = created.id as string;
      }

      // ── 4. Images hébergées par KawZone (jamais d'URL fournisseur) ──
      await admin.from("product_images").delete().eq("product_id", productId);
      const gallery = hostedGallery;
      if (gallery.length) {
        await admin.from("product_images").insert(
          gallery.map((url, i) => ({ product_id: productId, url, position: i })),
        );
      }
      base.images = gallery.length;

      // ── 5. Variantes ─────────────────────────────────────────────
      for (const v of cjVariants) {
        const { size, color } = splitVariantKey(v.variantKey);
        const hostedVariantImage = v.variantImage
          ? await mirrorImage(v.variantImage, media, mediaCache)
          : null;
        if (hostedVariantImage) base.variantImages += 1;
        const weightKg = gToKg(v.variantWeight);
        const lengthCm = mmToCm(v.variantLength);
        const widthCm = mmToCm(v.variantWidth);
        const heightCm = mmToCm(v.variantHeight);
        const cbm = cbmFromMm(v.variantLength, v.variantWidth, v.variantHeight);
        const st = stockByVid.get(v.vid) ?? { qty: null, warehouse: null };
        if (weightKg === null) missing.push(`poids variante ${v.variantSku ?? v.vid}`);
        if (cbm === null) missing.push(`dimensions variante ${v.variantSku ?? v.vid}`);

        const payload: Record<string, unknown> = {
          product_id: productId,
          size,
          color,
          stock: 0, // le stock CJ n'alimente pas notre stock local
          // Disponibilité fournisseur : uniquement ce que CJ renvoie réellement.
          supplier_stock: st.qty,
          supplier_available: st.qty === null ? true : st.qty > 0,
          image_url: hostedVariantImage,
          variant_ref: v.variantKey ?? null,
          weight_kg: weightKg,
          length_cm: lengthCm,
          width_cm: widthCm,
          height_cm: heightCm,
          // volume_cbm est calculé automatiquement par la base à partir des cm
          cost_price: num(v.variantSellPrice),
          cost_currency_code: "USD",
          supplier_sku: v.variantSku ?? null,
          supplier_ref: v.barcode ?? null,
          external_variant_id: String(v.vid),
        };

        const { data: exV } = await admin
          .from("product_variants")
          .select("id")
          .eq("external_variant_id", String(v.vid))
          .maybeSingle();
        if (exV) {
          await admin.from("product_variants").update(payload).eq("id", exV.id);
        } else {
          const { error } = await admin.from("product_variants").insert(payload);
          if (error) throw new Error(`Variante ${v.variantSku ?? v.vid} : ${error.message}`);
        }
        base.variantsImported += 1;
        base.variants.push({
          vid: String(v.vid),
          sku: v.variantSku ?? null,
          barcode: v.barcode ?? null,
          name: v.variantNameEn ?? null,
          size,
          color,
          costPrice: num(v.variantSellPrice),
          currency: "USD",
          cjStock: st.qty,
          warehouse: st.warehouse,
          weightKg,
          lengthCm,
          widthCm,
          heightCm,
          cbm,
          image: hostedVariantImage,
        });
      }

      // ── 5 bis. Disponibilité globale : CJ n'a plus aucun stock ────
      const knownStocks = base.variants.map((v) => v.cjStock).filter((q): q is number => q !== null);
      if (knownStocks.length === base.variants.length && knownStocks.length > 0 &&
          knownStocks.every((q) => q <= 0)) {
        await admin.from("products").update({ is_active: false }).eq("id", productId);
        missing.push("produit épuisé chez CJ : retiré de la vente (aucune variante en stock)");
      }

      // ── 6. Trace CJ (catégorie d'origine, données brutes) ────────
      await admin.from("cj_products").upsert({
        cj_product_id: data.pid,
        product_id: productId,
        cj_sku: p?.productSku ?? null,
        name_cn: nameCn,
        name_en: nameEn,
        cj_category_id: category.cjCategoryId,
        cj_category_name: category.cjCategoryName,
        cj_category_path: category.cjCategoryPath,
        kawzone_category_id: category.kawzoneCategoryId,
        category_mapping_status: category.status,
        description_images_extracted: parsed.imageUrls.length,
        customs_code: p?.entryCode ?? null,
        material,
        pack_weight_raw: p?.packingWeight ?? null,
        product_weight_raw: p?.productWeight ?? null,
        main_image: hostedMain,
        images: gallery,
        source_description: p?.description ?? null,
        source_images: mainImage ? [mainImage, ...images] : images,
        raw: {
          product: p,
          stock: Object.fromEntries(stockByVid),
          stockByPid: groupedStockRaw,
        },
        last_imported_at: new Date().toISOString(),
      });

      base.media = media;
      base.storageUrlPrefix = hostedGallery[0]?.split("/supplier/")[0] ?? null;

      // ── Contrôle final : aucune référence fournisseur côté public ──
      const offenders: string[] = [];
      const { data: pubProd } = await admin
        .from("products")
        .select("name, designation, description")
        .eq("id", productId)
        .single();
      for (const [field, value] of Object.entries(pubProd ?? {})) {
        if (containsSupplierRef(value)) offenders.push(`produit.${field}`);
      }
      const { data: pubImgs } = await admin
        .from("product_images").select("url").eq("product_id", productId);
      for (const row of pubImgs ?? []) {
        if (containsSupplierRef(row.url)) offenders.push(`image ${row.url}`);
      }
      const { data: pubVars } = await admin
        .from("product_variants").select("supplier_sku, image_url").eq("product_id", productId);
      for (const row of pubVars ?? []) {
        if (containsSupplierRef(row.image_url)) offenders.push(`variante ${row.supplier_sku}`);
      }
      base.publicCleanCheck = { clean: offenders.length === 0, offenders };

      base.ok = true;
      base.action = existing ? "updated" : "created";
      base.productId = productId;
      base.productName = nameEn ?? nameCn;
      base.cjSku = p?.productSku ?? null;
      base.cjCategory = cjCategoryPath ?? p?.categoryName ?? null;
      base.apiCalls = traces.length;
      const lastPts = [...traces].reverse().find((t) => t.pointsRemaining !== null);
      base.pointsUsed = lastPts?.pointsUsedToday ?? null;
      base.pointsRemaining = lastPts?.pointsRemaining ?? null;

      await admin.from("cj_import_log").insert({
        cj_product_id: data.pid,
        product_id: productId,
        action: base.action,
        variants_total: base.variantsTotal,
        variants_imported: base.variantsImported,
        api_calls: base.apiCalls,
        points_used: base.pointsUsed,
        points_remaining: base.pointsRemaining,
        result: base.action === "created" ? "Produit importé en brouillon" : "Produit mis à jour",
        missing_fields: missing,
        traces: traces as unknown as any,
        created_by: context.userId,
      });

      return base;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue";
      await admin.from("cj_import_log").insert({
        cj_product_id: data.pid,
        action: "error",
        api_calls: traces.length,
        result: "Échec",
        error_message: message,
        traces: traces as unknown as any,
        created_by: context.userId,
      });
      return { ...base, ok: false, action: "error", error: message, apiCalls: traces.length };
    }
  });
