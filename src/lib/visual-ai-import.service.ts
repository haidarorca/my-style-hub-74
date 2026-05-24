import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface MediaGroup {
  infoImages: string[];
  productImages: string[];
  variantImages: string[];
}
export interface SimpleVariant {
  label: string;
  price: number;
  image_url: string | null;
  colors: string[];
  sizes: string[];
  color_hex: string;
  stock: number;
}
export interface DescriptiveAttributes {
  colors: string[];
  materials: string[];
  features: string[];
}
export interface SmartVariantAnalysis {
  is_multicolor_fixed: boolean;
  descriptive_colors: string[];
  variant_colors: string[];
  variant_sizes: string[];
  variant_images: string[];
}
export interface VisualDraft {
  id: string; name: string; designation: string; description: string;
  price: number | null; originalPrice: number | null; originalCurrency: string;
  images: string[]; variants: SimpleVariant[];
  categoryId: string | null; categoryName: string | null;
  confidence: number; uncertainties: string[];
  mediaGroup: MediaGroup;
  status: "draft"; createdAt: number;
  descriptiveColors: string[];
  isMulticolorFixed: boolean;
}
interface CatRow { id: string; name: string; level: number; parent_id: string | null; }
const MAX_VIDEO_FRAMES = 8;
const FCFA_RATES: Record<string, number> = { CNY: 85, USD: 605, EUR: 655 };

/** Parse index segment like "1,2" or "1-3,5" into ordered 0-based indices */
function parseIndexSegment(segment: string, allUrls: string[]): number[] {
  const indices: number[] = [];
  for (const seg of segment.split(",")) {
    const s = seg.trim();
    if (!s) continue;
    if (s.includes("-")) {
      const [a, b] = s.split("-").map(x => parseInt(x.trim()) - 1);
      if (!isNaN(a) && !isNaN(b)) {
        for (let i = Math.max(0, a); i <= Math.min(b, allUrls.length - 1); i++) indices.push(i);
      }
    } else {
      const idx = parseInt(s) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < allUrls.length) indices.push(idx);
    }
  }
  return [...new Set(indices)];
}

/**
 * Parse media notation using ,, as group separator.
 * "1,2,,3,4,,5,7" gives info=[1,2], product=[3,4], variants=[5,7]
 * "1,2,,3,4"      gives info=[1,2], product=[3,4], variants=[]
 * "1,2,3,4"       gives info=[1,2], product=[3,4] (default, no ,,)
 */
export function parseMediaNotation(notation: string, allUrls: string[]): MediaGroup {
  const group: MediaGroup = { infoImages: [], productImages: [], variantImages: [] };
  if (!notation.trim() || allUrls.length === 0) {
    const infoEnd = Math.min(2, allUrls.length);
    group.infoImages = allUrls.slice(0, infoEnd);
    group.productImages = allUrls.slice(infoEnd);
    return group;
  }

  const parts = notation.split(",,").map(p => p.trim());

  if (parts.length >= 3) {
    group.infoImages = parseIndexSegment(parts[0], allUrls).map(i => allUrls[i]);
    group.productImages = parseIndexSegment(parts[1], allUrls).map(i => allUrls[i]);
    group.variantImages = parseIndexSegment(parts[2], allUrls).map(i => allUrls[i]);
  } else if (parts.length === 2) {
    group.infoImages = parseIndexSegment(parts[0], allUrls).map(i => allUrls[i]);
    group.productImages = parseIndexSegment(parts[1], allUrls).map(i => allUrls[i]);
  } else {
    const allIndices = parseIndexSegment(parts[0], allUrls);
    const infoEnd = Math.min(2, allIndices.length);
    group.infoImages = allIndices.slice(0, infoEnd).map(i => allUrls[i]);
    group.productImages = allIndices.slice(infoEnd).map(i => allUrls[i]);
  }

  if (group.infoImages.length === 0 && allUrls.length > 0) {
    group.infoImages = [allUrls[0]];
  }
  if (group.productImages.length === 0 && allUrls.length > group.infoImages.length) {
    group.productImages = allUrls.slice(group.infoImages.length);
  }
  return group;
}
const IA_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
function toFcfa(price: number, currency: string): number { return Math.round(price * (FCFA_RATES[currency?.toUpperCase()] || 85)); }
function detectCurrency(text: string): string { const l = text.toLowerCase(); if (l.includes("$") || l.includes("usd")) return "USD"; if (l.includes("€") || l.includes("eur")) return "EUR"; return "CNY"; }
function similarity(s: string, t: string): number { const a = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); const b = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); if (a === b) return 1; if (a.includes(b) || b.includes(a)) return 0.9; const wa = new Set(a.split(" ").filter(w => w.length > 2)); const wb = b.split(" ").filter(w => w.length > 2); let m = 0; for (const w of wb) { if (wa.has(w)) m++; else if (wa.has(w + "s")) m += 0.8; } return m / Math.max(wa.size, wb.length); }
function findCategory(name: string, pType: string, tags: string[], cats: CatRow[]) { const l3s = cats.filter(c => c.level === 3); if (l3s.length === 0) return null; const q = [name, pType, ...tags].join(" "); let best: { cat: CatRow; score: number } | null = null; for (const l3 of l3s) { const l2 = cats.find(c => c.id === l3.parent_id && c.level === 2); const l1 = l2 ? cats.find(c => c.id === l2.parent_id && c.level === 1) : null; const full = [l1?.name, l2?.name, l3.name].filter(Boolean).join(" "); const sc = Math.max(similarity(q, full), similarity(q, l3.name)); if (!best || sc > best.score) best = { cat: l3, score: sc }; } if (!best || best.score < 0.15) return null; const l2 = cats.find(c => c.id === best.cat.parent_id && c.level === 2); const l1 = l2 ? cats.find(c => c.id === l2.parent_id && c.level === 1) : null; return { l3Id: best.cat.id, l3Name: best.cat.name, l1Name: l1?.name || "", l2Name: l2?.name || "", score: Math.round(best.score * 100) }; }

export const uploadImportMedia = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ fileBase64: z.string().min(100), fileName: z.string().min(1), mimeType: z.string().min(1) }).parse(input)).handler(async ({ data }) => { const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin; const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_"); const path = `temp/${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safeName}`; const binary = Buffer.from(data.fileBase64, "base64"); for (const bucket of ["imports", "product-images"]) { const { error } = await supabase.storage.from(bucket).upload(path, binary, { contentType: data.mimeType, upsert: false }); if (!error) { const { data: u } = supabase.storage.from(bucket).getPublicUrl(path); return { url: u.publicUrl, path }; } } throw new Error("Upload failed"); });

export const extractVideoFrames = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ videoUrl: z.string().url(), maxFrames: z.number().int().min(1).max(MAX_VIDEO_FRAMES).default(MAX_VIDEO_FRAMES) }).parse(input)).handler(async ({ data }) => { const frameUrls: string[] = []; let error = ""; try { const fs = await import("fs"); const path = await import("path"); const { execSync } = await import("child_process"); const os = await import("os"); const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vai-")); const videoPath = path.join(tempDir, "v.mp4"); const res = await fetch(data.videoUrl, { signal: AbortSignal.timeout(30000) }); fs.writeFileSync(videoPath, Buffer.from(await res.arrayBuffer())); const dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`, { encoding: "utf-8", timeout: 10000 }).trim()) || 60; try { execSync(`ffmpeg -i "${videoPath}" -vf "select='gt(scene,0.3)'" -vsync vfr -q:v 2 "${tempDir}/s_%04d.jpg" 2>/dev/null`, { timeout: 30000 }); } catch { } const scenes = fs.readdirSync(tempDir).filter(f => f.startsWith("s_")).sort(); const frames: string[] = []; if (scenes.length < 3) { const interval = Math.min(dur, 60) / (data.maxFrames + 1); for (let i = 1; i <= data.maxFrames; i++) { const out = path.join(tempDir, `f_${i}.jpg`); try { execSync(`ffmpeg -ss ${(interval * i).toFixed(1)} -i "${videoPath}" -vf "scale=720:-1" -vframes 1 -q:v 2 "${out}"`, { timeout: 10000 }); if (fs.existsSync(out) && fs.statSync(out).size > 1000) frames.push(out); } catch { } } } else { for (const s of scenes.slice(0, data.maxFrames)) frames.push(path.join(tempDir, s)); } const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin; for (let i = 0; i < frames.length; i++) { const buf = fs.readFileSync(frames[i]); const up = `temp/f/${Date.now()}_${i}.jpg`; for (const b of ["imports", "product-images"]) { const { error: e } = await supabase.storage.from(b).upload(up, buf); if (!e) { const { data: u } = supabase.storage.from(b).getPublicUrl(up); frameUrls.push(u.publicUrl); break; } } } } catch (e: any) { error = e.message; } return { frameUrls, frameCount: frameUrls.length, error }; });

export const analyzeVisualMedia = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ imageUrls: z.array(z.string().url()).max(30).default([]), videoFrameUrls: z.array(z.string().url()).max(MAX_VIDEO_FRAMES).default([]), mediaNotation: z.string().default("") }).parse(input)).handler(async ({ data }) => { const logs: string[] = []; const allUrls = [...data.imageUrls, ...data.videoFrameUrls]; if (allUrls.length === 0) return { success: false, draft: null, logs, errors: ["Aucun media"] };

const mediaGroup = parseMediaNotation(data.mediaNotation, allUrls);
logs.push(`Media: ${allUrls.length} total | Info:${mediaGroup.infoImages.length} Prod:${mediaGroup.productImages.length} Var:${mediaGroup.variantImages.length}`); const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin; const { data: allCats } = await supabase.from("categories").select("id, name, level, parent_id, name_i18n").order("position"); const cats = (allCats || []) as CatRow[]; const catList = cats.filter(c => c.level === 3).map(c => { const l2 = cats.find(p => p.id === c.parent_id && p.level === 2); const l1 = l2 ? cats.find(p => p.id === l2.parent_id && p.level === 1) : null; return `${l1?.name || ""}>${l2?.name || ""}>${c.name}`; }).slice(0, 50).join("\n");

const prompt = `Analyse ces images de produit e-commerce. EXTRAIS UNIQUEMENT ce qui est visible. Ne invente rien.\n\nIMAGES FOURNIES:\n- ${mediaGroup.infoImages.length} images INFO (contiennent prix, description, details vendeur)\n- ${mediaGroup.productImages.length} images PRODUIT (photos du produit)\n- ${mediaGroup.variantImages.length} images VARIANTES (chaque image = une option differente)\n\nREGLES PRIX:\n- Detecte la devise (¥=CNY, $=USD, €=EUR)\n- Convertis en FCFA: CNYx85, USDx605, EURx655\n- Prix non visible: price: null\n\nREGLES VARIANTES - TRES IMPORTANT:\nDiffencie 2 types de couleurs:\n1. COULEURS DESCRIPTIVES (descriptive_colors): couleurs visibles sur le produit mais NON achetables separement. Ex: jouets multicolores, blocs magnetiques, objets a plusieurs couleurs fixes. Le client ne choisit pas "Rouge" ou "Bleu", il recoit le produit multicolore tel quel.\n2. COULEURS VARIANTE (variant_colors): vraies options achetables. Ex: t-shirt en Rouge OU Bleu OU Noir, ou le client choisit explicitement une couleur.\n\nSi le produit est multicolore fixe (les couleurs sont melangees, pas d'image separee par couleur, le client ne choisit pas):\n- is_multicolor_fixed: true\n- descriptive_colors: ["Rouge","Bleu","Jaune"] (couleurs visibles)\n- variant_colors: [] (vide, pas de choix couleur)\n- variants doivent contenir uniquement les vraies options (tailles, quantites, etc.)\n\nSi le produit a des vraies variantes couleur:\n- is_multicolor_fixed: false\n- descriptive_colors: []\n- variant_colors: ["Rouge","Bleu"] (choix reels)\n\nREGLES SIZES:\n- variant_sizes: vraies tailles/quantites achetables ("40 pieces", "80 pieces", "S", "M", "L", "XL")\n\nEXEMPLES:\n\nProduit multicolore fixe (blocs magnetiques):\n{\"is_multicolor_fixed\":true,\"descriptive_colors\":[\"Rouge\",\"Bleu\",\"Jaune\",\"Vert\"],\"variant_colors\":[],\"variant_sizes\":[],\"variants\":[{\"label\":\"40 pieces\",\"price\":8500},{\"label\":\"80 pieces\",\"price\":15000},{\"label\":\"160 pieces\",\"price\":25000}]}\n\nT-shirt avec choix couleur:\n{\"is_multicolor_fixed\":false,\"descriptive_colors\":[],\"variant_colors\":[\"Rouge\",\"Bleu\",\"Noir\"],\"variant_sizes\":[\"S\",\"M\",\"L\",\"XL\"],\"variants\":[{\"label\":\"Rouge\",\"price\":8500},{\"label\":\"Bleu\",\"price\":8500},{\"label\":\"Noir\",\"price\":8500}]}\n\nReponds JSON strict:\n{\"name\":\"\",\"designation\":\"\",\"description\":\"\",\"originalPrice\":0,\"originalCurrency\":\"CNY\",\"priceInFcfa\":0,\"is_multicolor_fixed\":false,\"descriptive_colors\":[],\"variant_colors\":[],\"variant_sizes\":[],\"variants\":[{\"label\":\"\",\"price\":0,\"image_url\":\"\",\"colors\":[],\"sizes\":[]}],\"materials\":[],\"detectedBrand\":null,\"detectedText\":[],\"tags\":[],\"features\":[],\"categoryHint\":\"\",\"productType\":\"\",\"confidence\":70,\"uncertainties\":[]}\nCategories:\n${catList}`;

const selected = [...mediaGroup.infoImages, ...mediaGroup.productImages, ...mediaGroup.variantImages].slice(0, 10); const parts: any[] = [{ type: "text", text: prompt }]; for (const url of selected) parts.push({ type: "image_url", image_url: { url, detail: "high" } });
let aiResult: any = null; try { const apiKey = process.env.LOVABLE_API_KEY || ""; const res = await fetch(IA_ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "system", content: "Expert produits e-commerce." }, { role: "user", content: parts }], max_tokens: 4096, temperature: 0.2 }), signal: AbortSignal.timeout(60000) }); if (!res.ok) throw new Error(`IA HTTP ${res.status}`); const json = await res.json(); const raw = json.choices?.[0]?.message?.content?.trim() || ""; try { const c = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim(); aiResult = JSON.parse(c); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) aiResult = JSON.parse(m[0]); else throw new Error("JSON invalide"); } } catch (e: any) { return { success: false, draft: null, logs, errors: [`IA: ${e.message}`] }; }

const currency = aiResult?.originalCurrency || detectCurrency(JSON.stringify(aiResult));
const originalPrice = aiResult?.originalPrice && Number(aiResult.originalPrice) > 0 ? Number(aiResult.originalPrice) : null;
const priceFcfa = originalPrice ? toFcfa(originalPrice, currency) : null;

// Smart color/size analysis
const isMulticolorFixed = Boolean(aiResult?.is_multicolor_fixed);
const descriptiveColors: string[] = Array.isArray(aiResult?.descriptive_colors) ? aiResult.descriptive_colors.map(String).filter(Boolean) : [];
const variantColors: string[] = Array.isArray(aiResult?.variant_colors) ? aiResult.variant_colors.map(String).filter(Boolean) : [];
const variantSizes: string[] = Array.isArray(aiResult?.variant_sizes) ? aiResult.variant_sizes.map(String).filter(Boolean) : [];

// If not using smart analysis, fall back to legacy colors field
const legacyColors: string[] = Array.isArray(aiResult?.colors) ? aiResult.colors.map(String).filter(Boolean) : [];
const effectiveVariantColors = variantColors.length > 0 ? variantColors : (isMulticolorFixed ? [] : legacyColors);

// Assign variant images to variants
const variantImgUrls = mediaGroup.variantImages.length > 0 ? mediaGroup.variantImages : [];

const rawVariants = Array.isArray(aiResult?.variants) ? aiResult.variants : [];
let variants: SimpleVariant[] = rawVariants.map((v: any, idx: number) => ({
  label: String(v.label || v.name || "Option").slice(0, 60),
  price: v.price && Number(v.price) > 0 ? (Number(v.price) < 1000 ? toFcfa(Number(v.price), currency) : Number(v.price)) : (priceFcfa || 0),
  image_url: v.image_url || variantImgUrls[idx] || null,
  colors: Array.isArray(v.colors) ? v.colors.map(String).filter(Boolean) : effectiveVariantColors,
  sizes: Array.isArray(v.sizes) ? v.sizes.map(String).filter(Boolean) : variantSizes.length > 0 ? variantSizes : (v.size ? [String(v.size)] : []),
  color_hex: /^#[0-9a-fA-F]{6}$/.test(v.color_hex) ? v.color_hex : "",
  stock: Number(v.stock) || 0,
})).filter((v: SimpleVariant) => v.label && v.label !== "Option" && v.label !== "");

// If no variants extracted but we have variant sizes, auto-create variants
if (variants.length === 0 && variantSizes.length > 0) {
  variants = variantSizes.map((sz, idx) => ({
    label: sz,
    price: priceFcfa || 0,
    image_url: variantImgUrls[idx] || null,
    colors: effectiveVariantColors,
    sizes: [sz],
    color_hex: "",
    stock: 0,
  }));
}

// If still no variants and not multicolor fixed, create from colors
if (variants.length === 0 && effectiveVariantColors.length > 0 && !isMulticolorFixed) {
  variants = effectiveVariantColors.map((c, idx) => ({
    label: c,
    price: priceFcfa || 0,
    image_url: variantImgUrls[idx] || null,
    colors: [c],
    sizes: variantSizes.length > 0 ? variantSizes : [],
    color_hex: "",
    stock: 0,
  }));
}

// If still no variants at all, create a single default variant
if (variants.length === 0) {
  variants = [{ label: "Standard", price: priceFcfa || 0, image_url: variantImgUrls[0] || null,
    : null, colors: effectiveVariantColors, sizes: variantSizes, color_hex: "", stock: 0 }];
}

const fromPrice = variants.length > 0 ? Math.min(...variants.map(v => v.price).filter(p => p > 0)) : priceFcfa;
const catMatch = findCategory(aiResult?.name || "", aiResult?.productType || aiResult?.categoryHint || "", Array.isArray(aiResult?.tags) ? aiResult.tags : [], cats);
const uncertainties: string[] = Array.isArray(aiResult?.uncertainties) ? aiResult.uncertainties : [];
if (!originalPrice) uncertainties.push("Prix non visible - a completer en FCFA"); else uncertainties.push(`${originalPrice} ${currency} = ${priceFcfa} FCFA (verifiez)`);
if (!catMatch) uncertainties.push("Categorie - selectionnez manuellement"); else if (catMatch.score < 50) uncertainties.push(`Categorie incertaine (${catMatch.score}%)`);

// Build description including descriptive colors if multicolor fixed
let finalDescription = String(aiResult?.description || "").slice(0, 2000);
if (isMulticolorFixed && descriptiveColors.length > 0 && !finalDescription.toLowerCase().includes("multicolor")) {
  const colorDesc = `Produit multicolore contenant: ${descriptiveColors.join(", ")}.`;
  finalDescription = colorDesc + (finalDescription ? "\n\n" + finalDescription : "");
}

const draft: VisualDraft = {
  id: `vd-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
  name: String(aiResult?.name || "Produit").slice(0, 100),
  designation: String(aiResult?.designation || "").slice(0, 120),
  description: finalDescription.slice(0, 2000),
  price: fromPrice, originalPrice, originalCurrency: currency,
  images: mediaGroup.productImages.length > 0 ? mediaGroup.productImages : allUrls,
  variants,
  categoryId: catMatch?.l3Id || null,
  confidence: Math.min(95, Math.max(10, Number(aiResult?.confidence) || 50)),
  uncertainties: [...new Set(uncertainties)],
  mediaGroup,
  status: "draft",
  createdAt: Date.now(),
  descriptiveColors,
  isMulticolorFixed,
};
logs.push(`OK: "${draft.name}" | ${fromPrice} FCFA | ${variants.length}v`);
return { success: true, draft, logs, errors: [] }; });

export const publishDraft = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ draft: z.object({ name: z.string().min(1), designation: z.string().optional(), description: z.string().optional(), price: z.number().min(0), categoryId: z.string().nullable(), images: z.array(z.string()), variants: z.array(z.object({ label: z.string(), price: z.number(), image_url: z.string().nullable().optional(),
    : z.string().nullable().optional(),
    : z.string().nullable().optional(), colors: z.array(z.string()).default([]), sizes: z.array(z.string()).default([]), color_hex: z.string().optional(), stock: z.number().optional() })) }) }).parse(input)).handler(async ({ data }) => { const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin; let adminShop: any; const { data: s } = await supabase.from("profiles").select("id, shop_name").eq("is_admin_shop", true).maybeSingle(); if (s) adminShop = s; else { const { data: a } = await supabase.from("profiles" as any).select("id, shop_name").eq("role", "admin").limit(1).single(); adminShop = a; } if (!adminShop) throw new Error("Boutique admin introuvable"); const shopId = adminShop.id; const ts = Date.now().toString(36).toUpperCase(); let code = `VIS-${ts}`; for (let i = 0; i < 10; i++) { const { data: dup } = await supabase.from("products").select("id").eq("vendor_id", shopId).eq("code", code).maybeSingle(); if (!dup) break; code = `VIS-${ts}-${i}`; } let productId: string | null = null; const uploadedPaths: string[] = []; try { const { data: prod, error: pErr } = await supabase.from("products").insert({ vendor_id: shopId, name: data.draft.name.trim(), code, designation: data.draft.designation?.trim() || null, description: data.draft.description?.trim() || null, price: data.draft.price, category_id: data.draft.categoryId, pending_category_request_id: null, requires_international_shipping: false, status: "approved" }).select("id").single(); if (pErr) throw pErr; productId = prod.id; if (data.draft.images.length > 0) { const imgRows: any[] = []; for (let i = 0; i < data.draft.images.length; i++) { try { const r = await fetch(data.draft.images[i], { signal: AbortSignal.timeout(15000) }); if (!r.ok) continue; const buf = Buffer.from(await r.arrayBuffer()); const ext = data.draft.images[i].split("?")[0].split(".").pop() || "jpg"; const p = `${shopId}/${productId}/${Date.now()}-${i}.${ext}`; const { error: uErr } = await supabase.storage.from("product-images").upload(p, buf); if (uErr) continue; uploadedPaths.push(p); const { data: pub } = supabase.storage.from("product-images").getPublicUrl(p); imgRows.push({ product_id: productId, url: pub.publicUrl, position: i }); } catch { } } if (imgRows.length > 0) await supabase.from("product_images").insert(imgRows); } if (data.draft.variants.length > 0) {
          const vRows: any[] = [];
          for (const v of data.draft.variants) {
            const sizes = v.sizes?.filter(Boolean) || [];
            const colors = v.colors?.filter(Boolean) || [];
            const baseLabel = v.label?.slice(0, 40) || "";
            // Flatten: if both sizes and colors, create all combinations
            if (sizes.length > 0 && colors.length > 0) {
              for (const sz of sizes) {
                for (const c of colors) {
                  vRows.push({
                    product_id: productId!,
                    size: sz,
                    color: c,
                    color_hex: v.color_hex || null,
                    stock: v.stock || 0,
                    price_override: v.price,
                    image_url: v.image_url || null,
                  });
                }
              }
            } else if (sizes.length > 0) {
              for (const sz of sizes) {
                vRows.push({
                  product_id: productId!,
                  size: sz,
                  color: "",
                  color_hex: v.color_hex || null,
                  stock: v.stock || 0,
                  price_override: v.price,
                  image_url: v.image_url || null,
                });
              }
            } else if (colors.length > 0) {
              for (const c of colors) {
                vRows.push({
                  product_id: productId!,
                  size: baseLabel,
                  color: c,
                  color_hex: v.color_hex || null,
                  stock: v.stock || 0,
                  price_override: v.price,
                  image_url: v.image_url || null,
                });
              }
            } else {
              vRows.push({
                product_id: productId!,
                size: baseLabel,
                color: "",
                color_hex: v.color_hex || null,
                stock: v.stock || 0,
                price_override: v.price,
                image_url: v.image_url || null,
              });
            }
          }
          if (vRows.length > 0) await supabase.from("product_variants").insert(vRows);
        } try { const { autoTranslateProduct } = await import("@/lib/auto-translate"); void autoTranslateProduct({ productId, name: data.draft.name.trim(), designation: data.draft.designation?.trim() || null, description: data.draft.description?.trim() || null }); } catch { } return { success: true, productId, code }; } catch (e: any) { if (productId) { await supabase.from("product_variants").delete().eq("product_id", productId); await supabase.from("product_images").delete().eq("product_id", productId); await supabase.from("products").delete().eq("id", productId); } if (uploadedPaths.length > 0) await supabase.storage.from("product-images").remove(uploadedPaths); throw new Error(e.message || "Publication echoue"); } });
