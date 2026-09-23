// ═══════════════════════════════════════════════════════════════
// Cœur d'import / synchronisation CJ — SERVEUR UNIQUEMENT.
// Utilisé par l'import unitaire (écran admin) ET par le worker
// d'arrière-plan (imports massifs, imports programmés).
//
//  • IMPORTER = créer un produit KawZone qui n'existe pas encore.
//  • SYNCHRONISER = mettre à jour un produit existant, par parties
//    (stock, prix, images, variantes, données) sans jamais le recréer.
//  • Idempotent : verrou par PID + index uniques en base
//    (products.external_product_id, product_variants.external_variant_id).
//  • Aucune donnée inventée : ce que CJ ne fournit pas reste null.
// ═══════════════════════════════════════════════════════════════
import { cjGet, type CjCallTrace } from "./client.server";
import type { MediaStats } from "./media.server";
import { parseCjVariantOptions } from "./variant-options";

export type SyncPart = "stock" | "price" | "images" | "variants" | "data";
export const ALL_SYNC_PARTS: SyncPart[] = ["stock", "price", "images", "variants", "data"];

export interface ImportCriteria {
  keyword?: string | null;
  categoryId?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  minStock?: number | null;
  maxWeightKg?: number | null;
  minVariants?: number | null;
  maxVariants?: number | null;
  requireImages?: boolean;
  requireSku?: boolean;
  requireWeight?: boolean;
  requireDimensions?: boolean;
  newOnly?: boolean;
}

export type CoreStatus = "SUCCESS" | "ALREADY_EXISTS" | "SYNCED" | "FAILED" | "SKIPPED" | "LOCKED";

export interface CoreOptions {
  pid: string;
  /** import : crée si absent, sinon ALREADY_EXISTS. sync : met à jour si présent. upsert : les deux. */
  mode: "import" | "sync" | "upsert";
  syncParts?: SyncPart[];
  withStock?: boolean;
  /** Critères vérifiés sur la fiche complète avant toute création (imports filtrés). */
  criteria?: ImportCriteria | null;
  userId?: string | null;
  traces?: CjCallTrace[];
}

export interface CoreResult {
  status: CoreStatus;
  productId: string | null;
  error: string | null;
  missing: string[];
  report: any;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const gToKg = (v: unknown) => {
  const n = num(v);
  return n === null || n <= 0 ? null : Math.round((n / 1000) * 1e6) / 1e6;
};
const mmToCm = (v: unknown) => {
  const n = num(v);
  return n === null || n <= 0 ? null : Math.round((n / 10) * 1e4) / 1e4;
};
const cbmFromMm = (l: unknown, w: unknown, h: unknown) => {
  const a = num(l), b = num(w), c = num(h);
  if (!a || !b || !c) return null;
  return Math.round((a / 1000) * (b / 1000) * (c / 1000) * 1e9) / 1e9;
};

const VENDOR_ID = "60c9521c-1694-4e29-974b-d6a6f479bc1f"; // boutique administrateur

/** Fiche CJ product/query, avec cache (évite de repayer 10 points entre aperçu et import). */
export async function fetchCjProduct(
  pid: string,
  traces: CjCallTrace[],
  maxAgeMs = 30 * 60 * 1000,
): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const key = `pq:${pid}`;
  const { data: cached } = await admin
    .from("cj_api_cache").select("payload, fetched_at").eq("cache_key", key).maybeSingle();
  if (cached?.payload && Date.now() - new Date(cached.fetched_at).getTime() < maxAgeMs) {
    return cached.payload;
  }
  const p = await cjGet<any>(`/product/query?pid=${encodeURIComponent(pid)}&countryCode=CN`, traces);
  if (p) {
    await admin.from("cj_api_cache").upsert({ cache_key: key, payload: p, fetched_at: new Date().toISOString() });
  }
  return p;
}

/** Résumé exploitable d'une fiche CJ (aperçu, complétude, filtres). */
export function summarizeCjProduct(p: any) {
  const variants: any[] = Array.isArray(p?.variants) ? p.variants : [];
  const images: string[] = Array.isArray(p?.productImageSet) ? p.productImageSet : [];
  const vs = variants.map((v) => {
    const inv: any[] = Array.isArray(v?.inventories) ? v.inventories : [];
    const stock = inv.length ? inv.reduce((s, r) => s + (num(r?.totalInventory) ?? 0), 0) : null;
    return {
      vid: String(v.vid),
      sku: v.variantSku ?? null,
      barcode: v.barcode ?? null,
      key: v.variantKey ?? null,
      options: parseCjVariantOptions(p?.productKeyEn, v.variantKey).options,
      price: num(v.variantSellPrice),
      stock,
      weightKg: gToKg(v.variantWeight),
      lengthCm: mmToCm(v.variantLength),
      widthCm: mmToCm(v.variantWidth),
      heightCm: mmToCm(v.variantHeight),
      cbm: cbmFromMm(v.variantLength, v.variantWidth, v.variantHeight),
      image: v.variantImage ?? null,
    };
  });
  const prices = vs.map((v) => v.price).filter((n): n is number => n !== null);
  const stocks = vs.map((v) => v.stock).filter((n): n is number => n !== null);
  const weights = vs.map((v) => v.weightKg).filter((n): n is number => n !== null);
  const completeness = {
    images: images.length > 0 || !!p?.productImage,
    sku: !!p?.productSku && vs.every((v) => !!v.sku),
    price: vs.length > 0 && prices.length === vs.length,
    stock: vs.length > 0 && stocks.length === vs.length,
    weight: vs.length > 0 && weights.length === vs.length,
    dimensions: vs.length > 0 && vs.every((v) => v.cbm !== null),
    variants: vs.length > 0,
    description: !!(p?.description && String(p.description).replace(/<[^>]+>/g, "").trim()),
  };
  const score = Math.round(
    (Object.values(completeness).filter(Boolean).length / Object.keys(completeness).length) * 100,
  );
  return {
    pid: String(p?.pid ?? ""),
    name: p?.productNameEn ?? null,
    sku: p?.productSku ?? null,
    image: p?.productImage ?? images[0] ?? null,
    gallery: images,
    description: p?.description ? String(p.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : null,
    category: p?.categoryName ?? null,
    optionNames: p?.productKeyEn ?? null,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    totalStock: stocks.length ? stocks.reduce((a, b) => a + b, 0) : null,
    maxWeightKg: weights.length ? Math.max(...weights) : null,
    variantCount: vs.length,
    variants: vs,
    completeness,
    score,
  };
}

/** Vérifie une fiche complète contre des critères ; renvoie la liste des critères non remplis. */
export function failsCriteria(sum: ReturnType<typeof summarizeCjProduct>, c?: ImportCriteria | null): string[] {
  if (!c) return [];
  const out: string[] = [];
  if (c.requireImages && !sum.completeness.images) out.push("images absentes");
  if (c.requireSku && !sum.completeness.sku) out.push("SKU incomplet");
  if (c.requireWeight && !sum.completeness.weight) out.push("poids incomplet");
  if (c.requireDimensions && !sum.completeness.dimensions) out.push("dimensions incomplètes");
  if (c.minPrice != null && (sum.minPrice === null || sum.minPrice < c.minPrice)) out.push(`prix < ${c.minPrice}`);
  if (c.maxPrice != null && (sum.minPrice === null || sum.minPrice > c.maxPrice)) out.push(`prix > ${c.maxPrice}`);
  if (c.minStock != null && sum.totalStock !== null && sum.totalStock < c.minStock) out.push(`stock < ${c.minStock}`);
  if (c.maxWeightKg != null && (sum.maxWeightKg === null || sum.maxWeightKg > c.maxWeightKg)) out.push(`poids > ${c.maxWeightKg} kg`);
  if (c.minVariants != null && sum.variantCount < c.minVariants) out.push(`variantes < ${c.minVariants}`);
  if (c.maxVariants != null && sum.variantCount > c.maxVariants) out.push(`variantes > ${c.maxVariants}`);
  return out;
}

/** Produit KawZone déjà lié à ce PID ? (cj_products OU products.external_product_id) */
export async function findExistingProduct(admin: any, pid: string): Promise<string | null> {
  const { data: cj } = await admin.from("cj_products").select("product_id").eq("cj_product_id", pid).maybeSingle();
  if (cj?.product_id) return cj.product_id as string;
  const { data: pr } = await admin.from("products").select("id").eq("external_product_id", pid).maybeSingle();
  return (pr?.id as string) ?? null;
}

export async function runCjProductImport(opts: CoreOptions): Promise<CoreResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const traces = opts.traces ?? [];
  const missing: string[] = [];
  const pid = opts.pid.trim();
  const report: any = {
    cjProductId: pid, variantsTotal: 0, variantsImported: 0, images: 0, variantImages: 0,
    media: { detected: 0, uploaded: 0, reused: 0, failed: 0, errors: [] },
    kawzoneCategoryChain: [], categoryUnresolved: [], categoryMapping: "pending",
    publicCleanCheck: { clean: true, offenders: [] }, variants: [], missing,
  };
  const done = (status: CoreStatus, productId: string | null, error: string | null = null): CoreResult =>
    ({ status, productId, error, missing, report });

  // ── Verrou par PID : deux traitements simultanés du même produit sont impossibles ──
  const { data: locked } = await admin.rpc("cj_try_lock_pid", { _pid: pid, _seconds: 300 });
  if (!locked) return done("LOCKED", null, "Ce produit CJ est déjà en cours de traitement.");

  try {
    let existingId = await findExistingProduct(admin, pid);
    if (existingId && opts.mode === "import") return done("ALREADY_EXISTS", existingId);
    if (!existingId && opts.mode === "sync") return done("FAILED", null, "Produit absent de KawZone : importez-le d'abord.");

    const isNew = !existingId;
    const parts = new Set<SyncPart>(isNew ? ALL_SYNC_PARTS : (opts.syncParts?.length ? opts.syncParts : ALL_SYNC_PARTS));
    // Le stock doit être frais pour une synchro de stock ; sinon le cache (30 min) suffit.
    const p = await fetchCjProduct(pid, traces, parts.has("stock") && !isNew ? 0 : 30 * 60 * 1000);
    if (!p?.pid) return done("FAILED", existingId, "Produit introuvable chez CJ.");

    const sum = summarizeCjProduct(p);
    if (isNew) {
      const fails = failsCriteria(sum, opts.criteria);
      if (fails.length) return done("SKIPPED", null, `Critères non remplis : ${fails.join(", ")}`);
    }

    const cjVariants: any[] = Array.isArray(p.variants) ? p.variants : [];
    report.variantsTotal = cjVariants.length;
    if (!cjVariants.length) missing.push("aucune variante CJ");

    const nameEn: string | null = p.productNameEn ?? null;
    const nameCn: string | null = (() => {
      try {
        const arr = JSON.parse(p.productName ?? "null");
        return Array.isArray(arr) ? (arr[0] ?? null) : (p.productName ?? null);
      } catch { return p.productName ?? null; }
    })();
    const images: string[] = Array.isArray(p.productImageSet) ? p.productImageSet : [];
    const mainImage: string | null = p.productImage ?? images[0] ?? null;
    const material: string | null = (() => {
      const raw = p.materialNameEnSet ?? p.materialNameSet ?? p.materialNameEn ?? null;
      let arr: any[] = [];
      if (Array.isArray(raw)) arr = raw;
      else if (raw) { try { const x = JSON.parse(String(raw)); arr = Array.isArray(x) ? x : [raw]; } catch { arr = [raw]; } }
      return arr.filter(Boolean).join(", ").trim() || null;
    })();
    if (!nameEn && !nameCn) missing.push("nom du produit");
    if (!p.description) missing.push("description");
    if (!images.length) missing.push("galerie d'images");

    // ── Stock (dans la fiche : 0 appel supplémentaire) ──
    const stockByVid = new Map<string, number | null>();
    const noInv: any[] = [];
    for (const v of cjVariants) {
      const inv: any[] = Array.isArray(v?.inventories) ? v.inventories : [];
      if (!inv.length) { noInv.push(v); continue; }
      stockByVid.set(String(v.vid), inv.reduce((s, r) => s + (num(r?.totalInventory) ?? 0), 0));
    }
    if (noInv.length && opts.withStock) {
      try {
        const all = await cjGet<any>(`/product/stock/getInventoryByPid?pid=${encodeURIComponent(pid)}`, traces);
        const rows: any[] = Array.isArray(all) ? all : Array.isArray(all?.list) ? all.list
          : Array.isArray(all?.variantInventories) ? all.variantInventories : [];
        for (const row of rows) {
          const vid = String(row?.vid ?? row?.variantId ?? "");
          const qty = num(row?.totalInventoryNum) ?? num(row?.totalInventory) ?? num(row?.storageNum);
          if (vid && qty !== null) stockByVid.set(vid, qty);
        }
      } catch { /* stock laissé inconnu */ }
    }

    const costs = cjVariants.map((v) => num(v.variantSellPrice)).filter((n): n is number => n !== null);
    const minCost = costs.length ? Math.min(...costs) : null;

    const { mirrorImage, newMediaStats, containsSupplierRef } = await import("./media.server");
    const { parseSupplierDescription } = await import("./description");
    const { resolveCjCategory } = await import("./categories.server");
    const media: MediaStats = newMediaStats();
    const mediaCache = new Map<string, string>();
    const parsed = parseSupplierDescription(p.description);

    // ── Catégorie ──
    const cjCategoryPath: string | null =
      p.categoryName ?? ([p.categoryFirstName, p.categorySecondName].filter(Boolean).join(" > ") || null);
    const category = await resolveCjCategory(p.categoryId ? String(p.categoryId) : null, p.categoryName ?? null, cjCategoryPath);
    if (category.reason) missing.push(category.reason);
    report.categoryMapping = category.status;
    report.kawzoneCategoryChain = category.kawzoneChain;
    report.categoryUnresolved = category.unresolved;

    // ── Produit ──
    let productId = existingId;
    if (isNew) {
      const payload: Record<string, unknown> = {
        vendor_id: VENDOR_ID,
        category_id: category.kawzoneCategoryId,
        code: p.productSku ?? pid,
        sku: p.productSku ?? null,
        name: nameEn ?? nameCn ?? pid,
        designation: nameCn ?? null,
        description: parsed.html,
        origin_price: minCost,
        origin_currency_code: minCost !== null ? "USD" : null,
        status: "pending",
        is_active: false,
        cost_price: minCost,
        cost_currency_code: "USD",
        supplier_ref: p.productSku ?? null,
        external_product_id: pid,
        material,
      };
      const { data: created, error } = await admin.from("products").insert(payload).select("id").single();
      if (error) {
        // Index unique : un autre traitement vient de le créer → on le reconnaît.
        if (error.code === "23505") {
          const again = await findExistingProduct(admin, pid);
          if (again) return done("ALREADY_EXISTS", again);
        }
        throw new Error(`Création du produit refusée : ${error.message}`);
      }
      productId = created.id as string;
      // Lien CJ enregistré immédiatement : une interruption ne peut plus créer de doublon.
      await admin.from("cj_products").upsert({ cj_product_id: pid, product_id: productId, cj_sku: p.productSku ?? null, name_en: nameEn });
    } else {
      const upd: Record<string, unknown> = {};
      // Jamais de changement de statut/publication lors d'une synchronisation.
      if (parts.has("data")) {
        Object.assign(upd, { name: nameEn ?? nameCn ?? pid, designation: nameCn ?? null, description: parsed.html, material });
      }
      if (parts.has("price") && minCost !== null) {
        Object.assign(upd, { origin_price: minCost, origin_currency_code: "USD", cost_price: minCost, cost_currency_code: "USD" });
      }
      if (Object.keys(upd).length) {
        const { error } = await admin.from("products").update(upd).eq("id", productId);
        if (error) throw new Error(`Mise à jour du produit refusée : ${error.message}`);
      }
    }

    // ── Images ──
    let gallery: string[] | null = null;
    let hostedMain: string | null = null;
    if (parts.has("images")) {
      hostedMain = mainImage ? await mirrorImage(mainImage, media, mediaCache) : null;
      gallery = [];
      for (const src of [...images, ...parsed.imageUrls].slice(0, 40)) {
        const hosted = await mirrorImage(src, media, mediaCache);
        if (hosted && !gallery.includes(hosted)) gallery.push(hosted);
      }
      if (hostedMain && !gallery.includes(hostedMain)) gallery.unshift(hostedMain);
      // On ne remplace la galerie que si on a réellement des images (jamais vider sur échec).
      if (gallery.length) {
        await admin.from("product_images").delete().eq("product_id", productId);
        await admin.from("product_images").insert(gallery.map((url, i) => ({ product_id: productId, url, position: i })));
      }
      report.images = gallery.length;
    }

    // ── Variantes ──
    const { data: existingVars } = await admin
      .from("product_variants").select("id, external_variant_id, product_id").in("external_variant_id", cjVariants.map((v) => String(v.vid)));
    const byVid = new Map<string, any>((existingVars ?? []).map((r: any) => [String(r.external_variant_id), r]));

    for (const v of cjVariants) {
      const vid = String(v.vid);
      const ex = byVid.get(vid);
      if (ex && ex.product_id !== productId) {
        missing.push(`variante ${vid} déjà liée à un autre produit — ignorée`);
        continue;
      }
      const opt = parseCjVariantOptions(p.productKeyEn, v.variantKey);
      const weightKg = gToKg(v.variantWeight);
      const lengthCm = mmToCm(v.variantLength);
      const widthCm = mmToCm(v.variantWidth);
      const heightCm = mmToCm(v.variantHeight);
      const cbm = cbmFromMm(v.variantLength, v.variantWidth, v.variantHeight);
      const qty = stockByVid.has(vid) ? stockByVid.get(vid)! : null;
      if (weightKg === null) missing.push(`poids variante ${v.variantSku ?? vid}`);
      if (cbm === null) missing.push(`dimensions variante ${v.variantSku ?? vid}`);

      const payload: Record<string, unknown> = {};
      const needImage = parts.has("images") || (!ex && parts.has("variants"));
      if (needImage) {
        const img = v.variantImage ? await mirrorImage(v.variantImage, media, mediaCache) : null;
        if (img) { payload.image_url = img; report.variantImages += 1; }
      }
      if (!ex || parts.has("variants")) {
        Object.assign(payload, {
          size: opt.size, color: opt.color, cj_options: opt.options, variant_ref: v.variantKey ?? null,
          weight_kg: weightKg, length_cm: lengthCm, width_cm: widthCm, height_cm: heightCm,
          supplier_sku: v.variantSku ?? null, supplier_ref: v.barcode ?? null,
        });
      }
      if (!ex || parts.has("price")) {
        Object.assign(payload, { cost_price: num(v.variantSellPrice), cost_currency_code: "USD" });
      }
      if (!ex || parts.has("stock")) {
        if (qty !== null || !ex) {
          Object.assign(payload, { supplier_stock: qty, supplier_available: qty === null ? true : qty > 0 });
        }
      }

      if (ex) {
        if (Object.keys(payload).length) {
          const { error } = await admin.from("product_variants").update(payload).eq("id", ex.id);
          if (error) throw new Error(`Variante ${v.variantSku ?? vid} : ${error.message}`);
        }
      } else if (isNew || parts.has("variants")) {
        const { error } = await admin.from("product_variants").insert({
          ...payload, product_id: productId, stock: 0, external_variant_id: vid,
        });
        if (error && error.code !== "23505") throw new Error(`Variante ${v.variantSku ?? vid} : ${error.message}`);
      } else {
        continue;
      }
      report.variantsImported += 1;
      report.variants.push({
        vid, sku: v.variantSku ?? null, barcode: v.barcode ?? null, options: opt.options,
        size: opt.size, color: opt.color, costPrice: num(v.variantSellPrice), cjStock: qty,
        weightKg, lengthCm, widthCm, heightCm, cbm, image: (payload.image_url as string) ?? null,
      });
    }

    // Épuisé chez CJ (toutes les variantes connues à 0) → retiré de la vente.
    if (parts.has("stock")) {
      const known = cjVariants.map((v) => stockByVid.get(String(v.vid))).filter((q): q is number => q != null);
      if (known.length === cjVariants.length && known.length > 0 && known.every((q) => q <= 0)) {
        await admin.from("products").update({ is_active: false }).eq("id", productId);
        missing.push("produit épuisé chez CJ : retiré de la vente");
      }
    }

    // ── Trace CJ ──
    const cjRow: Record<string, unknown> = {
      cj_product_id: pid, product_id: productId, cj_sku: p.productSku ?? null, name_cn: nameCn, name_en: nameEn,
      cj_category_id: category.cjCategoryId, cj_category_name: category.cjCategoryName, cj_category_path: category.cjCategoryPath,
      customs_code: p.entryCode ?? null, material, pack_weight_raw: p.packingWeight ?? null, product_weight_raw: p.productWeight ?? null,
      source_description: p.description ?? null, source_images: mainImage ? [mainImage, ...images] : images,
      description_images_extracted: parsed.imageUrls.length,
      raw: { product: p, stock: Object.fromEntries(stockByVid) },
      last_imported_at: new Date().toISOString(),
    };
    if (isNew) Object.assign(cjRow, { kawzone_category_id: category.kawzoneCategoryId, category_mapping_status: category.status });
    if (gallery?.length) Object.assign(cjRow, { main_image: hostedMain, images: gallery });
    await admin.from("cj_products").upsert(cjRow);
    if (isNew && category.kawzoneCategoryId) {
      // catégorie déjà posée à la création
    }

    // ── Contrôle : aucune référence fournisseur publique ──
    const offenders: string[] = [];
    const { data: pubProd } = await admin.from("products").select("name, designation, description").eq("id", productId).single();
    for (const [f, val] of Object.entries(pubProd ?? {})) if (containsSupplierRef(val)) offenders.push(`produit.${f}`);
    const { data: pubImgs } = await admin.from("product_images").select("url").eq("product_id", productId);
    for (const r of pubImgs ?? []) if (containsSupplierRef(r.url)) offenders.push("image");
    report.publicCleanCheck = { clean: offenders.length === 0, offenders };
    report.media = media;
    report.productName = nameEn ?? nameCn;
    report.cjSku = p.productSku ?? null;
    report.cjCategory = cjCategoryPath;

    await admin.from("cj_import_log").insert({
      cj_product_id: pid, product_id: productId, action: isNew ? "created" : "updated",
      variants_total: report.variantsTotal, variants_imported: report.variantsImported, api_calls: traces.length,
      result: isNew ? "Produit importé en brouillon" : `Synchronisé : ${[...parts].join(", ")}`,
      missing_fields: missing, traces: traces as any, created_by: opts.userId ?? null,
    });
    return done(isNew ? "SUCCESS" : "SYNCED", productId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    await admin.from("cj_import_log").insert({
      cj_product_id: pid, action: "error", api_calls: traces.length, result: "Échec",
      error_message: message, traces: traces as any, created_by: opts.userId ?? null,
    });
    const r = done("FAILED", null, message);
    (r as any).retryable = (e as any)?.retryable === true;
    return r;
  } finally {
    await admin.from("cj_import_locks").delete().eq("pid", pid);
  }
}
