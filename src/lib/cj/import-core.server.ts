import { asImageList, orderSupplierImages } from "./image-order";
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
import { resolveMaterial } from "./material";
import { parseSupplierDescription as parseDesc } from "./description";

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
  // ── Filtres ajoutés (voir listV2Query / failsCriteria) ──
  maxStock?: number | null;
  minWeightKg?: number | null;
  minImages?: number | null;
  maxSideCm?: number | null;
  maxCbm?: number | null;
  material?: string | null;
  countryCode?: string | null;
  freeShipping?: boolean;
  newArrivals?: boolean;
  hasVideo?: boolean;
  verifiedOnly?: boolean;
  listedAfter?: string | null;
  supplierId?: string | null;
  orderBy?: number | null;
  sort?: "asc" | "desc" | null;
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
  /** Étape courante (progression réelle affichée dans l'admin). */
  onStep?: (step: string) => void | Promise<void>;
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
  let p = await cjGet<any>(`/product/query?pid=${encodeURIComponent(pid)}&countryCode=CN`, traces);
  // Produits expédiés par un fournisseur tiers ou hors entrepôt Chine : le
  // filtre countryCode=CN renvoie une liste de variantes vide. On relit
  // alors la fiche sans filtre, puis la liste officielle des variantes.
  const noVariants = (x: any) => !Array.isArray(x?.variants) || x.variants.length === 0;
  if (p && noVariants(p)) {
    try {
      const full = await cjGet<any>(`/product/query?pid=${encodeURIComponent(pid)}`, traces);
      if (full && !noVariants(full)) p = full;
    } catch { /* on garde la première fiche */ }
  }
  if (p && noVariants(p)) {
    try {
      const vs = await cjGet<any>(`/product/variant/query?pid=${encodeURIComponent(pid)}`, traces);
      const list = Array.isArray(vs) ? vs : Array.isArray(vs?.list) ? vs.list : [];
      if (list.length) p = { ...p, variants: list };
    } catch { /* variantes indisponibles */ }
  }
  if (p) {
    await admin.from("cj_api_cache").upsert({ cache_key: key, payload: p, fetched_at: new Date().toISOString() });
  }
  return p;
}

/** Résumé exploitable d'une fiche CJ (aperçu, complétude, filtres). */
export function summarizeCjProduct(p: any) {
  const variants: any[] = Array.isArray(p?.variants) ? p.variants : [];
  const images: string[] = asImageList(p?.productImageSet);
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
  const mat = resolveMaterial(parseDesc(p?.description).specs, p);
  const sides = vs.flatMap((v) => [v.lengthCm, v.widthCm, v.heightCm]).filter((n): n is number => n !== null);
  const cbms = vs.map((v) => v.cbm).filter((n): n is number => n !== null);
  const imageCount = new Set([...asImageList(p?.productImage), ...images]).size;
  const completeness = {
    images: images.length > 0 || !!p?.productImage,
    sku: !!p?.productSku && vs.every((v) => !!v.sku),
    price: vs.length > 0 && prices.length === vs.length,
    stock: vs.length > 0 && stocks.length === vs.length,
    weight: vs.length > 0 && weights.length === vs.length,
    dimensions: vs.length > 0 && vs.every((v) => v.cbm !== null),
    variants: vs.length > 0,
    description: !!(p?.description && String(p.description).replace(/<[^>]+>/g, "").trim()),
    material: !!mat.value,
    category: !!p?.categoryId,
  };
  const quality = computeCompleteness(completeness);
  const score = quality.score;
  return {
    pid: String(p?.pid ?? ""),
    name: p?.productNameEn ?? null,
    sku: p?.productSku ?? null,
    image: asImageList(p?.productImage)[0] ?? images[0] ?? null,
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
    quality,
    imageCount,
    material: mat.value,
    materialSource: mat.source,
    minWeightKg: weights.length ? Math.min(...weights) : null,
    maxSideCm: sides.length ? Math.max(...sides) : null,
    maxCbm: cbms.length ? Math.max(...cbms) : null,
    video: !!(p?.productVideo && String(p.productVideo).replace(/[\[\]"\s]/g, "")),
  };
}

// Niveaux de qualité : obligatoire (bloque la validation automatique),
// recommandé, optionnel (n'empêchent jamais l'import).
export const QUALITY_LEVELS: Record<string, { level: "required" | "recommended" | "optional"; label: string; weight: number }> = {
  images: { level: "required", label: "Image", weight: 3 },
  price: { level: "required", label: "Prix d'achat", weight: 3 },
  variants: { level: "required", label: "Variantes", weight: 3 },
  sku: { level: "required", label: "SKU", weight: 3 },
  weight: { level: "required", label: "Poids", weight: 3 },
  dimensions: { level: "required", label: "Dimensions / volume", weight: 3 },
  category: { level: "recommended", label: "Catégorie", weight: 2 },
  stock: { level: "recommended", label: "Stock", weight: 2 },
  description: { level: "recommended", label: "Description", weight: 2 },
  material: { level: "optional", label: "Matière", weight: 1 },
};

export function computeCompleteness(c: Record<string, boolean>) {
  let got = 0, total = 0;
  const missing: Array<{ key: string; label: string; level: string }> = [];
  for (const [k, def] of Object.entries(QUALITY_LEVELS)) {
    if (!(k in c)) continue;
    total += def.weight;
    if (c[k]) got += def.weight; else missing.push({ key: k, label: def.label, level: def.level });
  }
  return { score: total ? Math.round((got / total) * 100) : 0, missing };
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
  if (c.maxStock != null && sum.totalStock !== null && sum.totalStock > c.maxStock) out.push(`stock > ${c.maxStock}`);
  if (c.minWeightKg != null && (sum.minWeightKg === null || sum.minWeightKg < c.minWeightKg)) out.push(`poids < ${c.minWeightKg} kg`);
  if (c.minImages != null && sum.imageCount < c.minImages) out.push(`moins de ${c.minImages} images`);
  if (c.maxSideCm != null && (sum.maxSideCm === null || sum.maxSideCm > c.maxSideCm)) out.push(`dimension > ${c.maxSideCm} cm`);
  if (c.maxCbm != null && (sum.maxCbm === null || sum.maxCbm > c.maxCbm)) out.push(`volume > ${c.maxCbm} m³`);
  if (c.material) {
    const want = c.material.toLowerCase();
    if (!sum.material || !sum.material.toLowerCase().includes(want)) out.push(`matière ≠ ${c.material}`);
  }
  if (c.hasVideo && !sum.video) out.push("sans vidéo");
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
  // Mesure du temps par étape (journal technique uniquement).
  const timings: Record<string, number> = {};
  const t0 = Date.now();
  let tMark = t0;
  const lap = (k: string) => { const n = Date.now(); timings[k] = (timings[k] ?? 0) + (n - tMark); tMark = n; };
  const step = async (s: string) => { try { await opts.onStep?.(s); } catch { /* affichage seulement */ } };
  report.timings = timings;
  const done = (status: CoreStatus, productId: string | null, error: string | null = null): CoreResult => {
    timings.total = Date.now() - t0;
    return { status, productId, error, missing, report };
  };

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
    lap("antiDoublon");
    await step("Récupération du produit CJ");
    const p = await fetchCjProduct(pid, traces, parts.has("stock") && !isNew ? 0 : 30 * 60 * 1000);
    lap("cjProduit");
    const heavy = isNew || parts.has("data") || parts.has("images") || parts.has("variants");
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
    const images: string[] = asImageList(p.productImageSet);
    const mainImage: string | null = asImageList(p.productImage)[0] ?? images[0] ?? null;
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
      lap("cjStock");
    }

    const costs = cjVariants.map((v) => num(v.variantSellPrice)).filter((n): n is number => n !== null);
    const minCost = costs.length ? Math.min(...costs) : null;

    const { newMediaStats, containsSupplierRef } = await import("./media.server");
    const { parseSupplierDescription } = await import("./description");
    const { resolveCjCategory } = await import("./categories.server");
    const media: MediaStats = newMediaStats();
    const mediaCache = new Map<string, string>();
    const parsed = parseSupplierDescription(p.description);
    const materialInfo = resolveMaterial(parsed.specs, p);
    const material: string | null = materialInfo.value;
    report.material = materialInfo;
    // Vidéo : champ officiel productVideo (URL ou liste), jamais inventée.
    const video: string | null = (() => {
      const raw = p.productVideo;
      const list = Array.isArray(raw) ? raw : typeof raw === "string" && raw.trim() ? (() => { try { const x = JSON.parse(raw); return Array.isArray(x) ? x : [raw]; } catch { return [raw]; } })() : [];
      return list.map(String).find((u: string) => /^https?:\/\//i.test(u)) ?? null;
    })();

    // ── Catégorie ──
    const cjCategoryPath: string | null =
      p.categoryName ?? ([p.categoryFirstName, p.categorySecondName].filter(Boolean).join(" > ") || null);
    // Catégorie : utile seulement à la création ou à une synchro complète des données.
    const category = heavy
      ? await resolveCjCategory(p.categoryId ? String(p.categoryId) : null, p.categoryName ?? null, cjCategoryPath)
      : { reason: null, status: "unchanged", kawzoneChain: [], unresolved: [], kawzoneCategoryId: null, cjCategoryId: p.categoryId ? String(p.categoryId) : null, cjCategoryName: p.categoryName ?? null, cjCategoryPath } as any;
    lap("categorie");
    if (category.reason) missing.push(category.reason);
    report.categoryMapping = category.status;
    report.kawzoneCategoryChain = category.kawzoneChain;
    report.categoryUnresolved = category.unresolved;

    // ── Produit ──
    let productId = existingId;
    await step(isNew ? "Création du produit" : "Mise à jour du produit");
    if (isNew) {
      const payload: Record<string, unknown> = {
        vendor_id: VENDOR_ID,
        category_id: category.kawzoneCategoryId,
        code: p.productSku ?? pid,
        sku: p.productSku ?? null,
        name: nameEn ?? nameCn ?? pid,
        // Langue réelle du texte fourni par CJ (jamais supposé français).
        source_lang: nameEn ? "en" : nameCn ? "zh" : null,
        designation: nameCn ?? null,
        description: parsed.html,
        specifications: parsed.specs.length ? parsed.specs : null,
        origin_price: minCost,
        origin_currency_code: minCost !== null ? "USD" : null,
        status: "pending",
        is_active: false,
        source: "cj_import",
        cost_price: minCost,
        cost_currency_code: "USD",
        supplier_ref: p.productSku ?? null,
        external_product_id: pid,
        // Provenance commerciale CJ = Chine selon la règle métier KawZone.
        // Ne pas présenter ce pays comme une preuve du lieu de fabrication.
        origin_country_id: "60dfa0a1-818e-4538-8c50-9af19249273e",
        material,
        video_url: video,
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
        Object.assign(upd, { name: nameEn ?? nameCn ?? pid, designation: nameCn ?? null, description: parsed.html, specifications: parsed.specs.length ? parsed.specs : null, material, ...(video ? { video_url: video } : {}) });
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
    lap("produit");
    let gallery: string[] | null = null;
    let hostedMain: string | null = null;
    // Toutes les images nécessaires (galerie + variantes) sont rapatriées EN
    // PARALLÈLE, une seule fois chacune (empreinte d'URL). Un échec d'image
    // n'arrête pas le produit : il est signalé dans « missing ».
    const { mirrorMany } = await import("./media.server");
    const needVariantImages = parts.has("images") || parts.has("variants") || isNew;
    const orderedGallery = parts.has("images") ? orderSupplierImages(p.productImage, images, parsed.imageUrls).slice(0, 40) : [];
    const variantImgUrls = needVariantImages ? cjVariants.map((v) => v.variantImage).filter(Boolean) : [];
    let hostedMap = new Map<string, string | null>();
    if (orderedGallery.length || variantImgUrls.length) {
      await step(`Téléchargement des images (${new Set([...orderedGallery, ...variantImgUrls]).size})`);
      hostedMap = await mirrorMany([...orderedGallery, ...variantImgUrls], media, mediaCache, 8);
      if (media.failed) missing.push(`${media.failed} image(s) non rapatriée(s) — à réessayer`);
    }
    lap("images");
    if (parts.has("images")) {
      // Ordre : image principale CJ (productImage) → galerie CJ dans l'ordre
      // fourni (productImageSet) → images de détail de la description.
      // Les images de variantes restent liées à leurs variantes (pas en galerie).
      gallery = [];
      for (const src of orderedGallery) {
        const hosted = hostedMap.get(src.trim()) ?? null;
        if (hosted && !gallery.includes(hosted)) gallery.push(hosted);
      }
      hostedMain = gallery[0] ?? null;
      // On ne remplace la galerie que si on a réellement des images (jamais vider sur échec).
      if (gallery.length) {
        await admin.from("product_images").delete().eq("product_id", productId);
        await admin.from("product_images").insert(gallery.map((url, i) => ({ product_id: productId, url, position: i })));
      }
      report.images = gallery.length;
    }

    // ── Variantes ── (insertions groupées, mises à jour en parallèle)
    await step(`Enregistrement des variantes (${cjVariants.length})`);
    const toInsert: any[] = [];
    const toUpdate: Array<{ id: string; payload: any; label: string }> = [];
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
        const img = v.variantImage ? (hostedMap.get(String(v.variantImage).trim()) ?? null) : null;
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
        if (Object.keys(payload).length) toUpdate.push({ id: ex.id, payload, label: v.variantSku ?? vid });
      } else if (isNew || parts.has("variants")) {
        toInsert.push({ ...payload, product_id: productId, stock: 0, external_variant_id: vid });
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

    // Insertion groupée ; l'index unique sur external_variant_id garantit
    // qu'un même VID ne crée jamais deux variantes (conflit → ignoré).
    const INSERT_KEYS = ["size", "color", "cj_options", "variant_ref", "weight_kg", "length_cm", "width_cm", "height_cm", "supplier_sku", "supplier_ref", "cost_price", "cost_currency_code", "supplier_stock", "supplier_available", "image_url", "product_id", "stock", "external_variant_id"];
    const normRows = toInsert.map((row) => Object.fromEntries(INSERT_KEYS.map((k) => [k, row[k] ?? (k === "supplier_available" ? true : null)])));
    for (let i = 0; i < normRows.length; i += 200) {
      const { error } = await admin.from("product_variants")
        .upsert(normRows.slice(i, i + 200), { onConflict: "external_variant_id", ignoreDuplicates: true });
      if (error) throw new Error(`Variantes : ${error.message}`);
    }
    for (let i = 0; i < toUpdate.length; i += 8) {
      const res = await Promise.all(toUpdate.slice(i, i + 8).map((u) => admin.from("product_variants").update(u.payload).eq("id", u.id).then((r: any) => ({ r, u }))));
      for (const { r, u } of res) if (r.error) throw new Error(`Variante ${u.label} : ${r.error.message}`);
    }
    lap("variantes");

    // Stock : la disponibilité (variante et produit) est recalculée
    // automatiquement en base à partir de supplier_stock. Le produit n'est
    // jamais retiré de la vente à la main : il redevient achetable dès que
    // le stock CJ revient.
    if (parts.has("stock")) {
      const known = cjVariants.map((v) => stockByVid.get(String(v.vid))).filter((q): q is number => q != null);
      if (known.length === cjVariants.length && known.length > 0 && known.every((q) => q <= 0)) {
        missing.push("produit en rupture chez CJ (non achetable tant que le stock est à 0)");
      }
    }

    // ── Trace CJ ── (+ date de dernière synchronisation par partie)
    await step("Finalisation");
    const nowIso = new Date().toISOString();
    const syncStamps: Record<string, string> = {};
    for (const part of parts) syncStamps[`${part}_synced_at`] = nowIso;
    if (!heavy) {
      // Synchro légère (stock / prix) : on ne réécrit pas toute la fiche.
      await admin.from("cj_products").update({ ...syncStamps, raw: { product: p, stock: Object.fromEntries(stockByVid) } }).eq("cj_product_id", pid);
      lap("base");
      await admin.from("cj_import_log").insert({
        cj_product_id: pid, product_id: productId, action: "updated",
        variants_total: report.variantsTotal, variants_imported: report.variantsImported, api_calls: traces.length,
        result: `Synchronisé : ${[...parts].join(", ")}`, missing_fields: missing, traces: traces as any,
        timings: { ...timings, total: Date.now() - t0 }, created_by: opts.userId ?? null,
      });
      report.productName = nameEn ?? nameCn;
      return done("SYNCED", productId);
    }
    const cjRow: Record<string, unknown> = {
      ...syncStamps,
      cj_product_id: pid, product_id: productId, cj_sku: p.productSku ?? null, name_cn: nameCn, name_en: nameEn,
      cj_category_id: category.cjCategoryId, cj_category_name: category.cjCategoryName, cj_category_path: category.cjCategoryPath,
      quality_score: sum.quality.score, quality_missing: sum.quality.missing,
      material_source: materialInfo.source, material_cj_class: materialInfo.cjClass,
      customs_code: p.entryCode ?? null, material, pack_weight_raw: p.packingWeight ?? null, product_weight_raw: p.productWeight ?? null,
      source_description: p.description ?? null, source_images: orderSupplierImages(p.productImage, images),
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
    lap("base");
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

    // ── Validation automatique (nouveaux produits uniquement) ──
    // Contrôles de qualité : si tout est conforme → « Validé automatiquement »
    // (statut approuvé, publication/activation inchangées) ; sinon → « À vérifier »
    // avec les raisons précises. Une synchronisation ne change jamais le statut.
    let resultLabel = `Synchronisé : ${[...parts].join(", ")}`;
    if (isNew) {
      const { evaluateCjAutoValidation } = await import("./auto-validate");
      const { data: priced } = await admin.from("products").select("price").eq("id", productId).single();
      const reasons = evaluateCjAutoValidation({
        name: nameEn ?? nameCn,
        galleryCount: gallery?.length ?? 0,
        costPrice: minCost,
        salePrice: priced?.price == null ? null : Number(priced.price),
        variantsTotal: report.variantsTotal,
        variantsImported: report.variantsImported,
        variants: report.variants,
        sku: p.productSku ?? null,
        categoryId: category.kawzoneCategoryId,
        publicClean: offenders.length === 0,
        descriptionHtml: parsed.html,
      });
      report.autoValidation = { validated: reasons.length === 0, reasons };
      const nowV = new Date().toISOString();
      await admin.from("products").update(
        reasons.length === 0
          ? { status: "approved", is_active: true, validation_mode: "auto", validated_at: nowV, review_reasons: [], is_edit: false }
          : { status: "pending", validation_mode: null, review_reasons: reasons },
      ).eq("id", productId);
      resultLabel = reasons.length === 0 ? "Importé — validé automatiquement" : `Importé — à vérifier : ${reasons.join(" ; ")}`;
    }

    await admin.from("cj_import_log").insert({
      cj_product_id: pid, product_id: productId, action: isNew ? "created" : "updated",
      variants_total: report.variantsTotal, variants_imported: report.variantsImported, api_calls: traces.length,
      result: resultLabel,
      missing_fields: missing, traces: traces as any, created_by: opts.userId ?? null,
      timings: { ...timings, total: Date.now() - t0 },
    });
    return done(isNew ? "SUCCESS" : "SYNCED", productId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    await admin.from("cj_import_log").insert({
      cj_product_id: pid, action: "error", api_calls: traces.length, result: "Échec",
      error_message: message, traces: traces as any, timings: { ...timings, total: Date.now() - t0 }, created_by: opts.userId ?? null,
    });
    const r = done("FAILED", null, message);
    (r as any).retryable = (e as any)?.retryable === true;
    return r;
  } finally {
    await admin.from("cj_import_locks").delete().eq("pid", pid);
  }
}
