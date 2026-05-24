/**
 * visual-ai-import.service.ts
 * ---------------------------
 * Moteur IA Visuel avec systeme de notation intelligent.
 *
 * Notation admin:
 *   "1,2"   → images 1-2 = INFO (prix, description, details)
 *   "3,4"   → images 3-4 = PRODUIT (galerie principale)
 *   ","     → apres virgule = VARIANTES (images liees aux variantes)
 *
 * Exemple: "1,2,3,4,5,6" ou "1-4,5,6" ou "1,2,3,4,,"
 *
 * Prix:
 *   - Conversion auto FCFA si devise detectee (CNY, USD, EUR)
 *   - Prix "from" = minimum des variantes
 *   - Chaque variante a son propre prix
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── Types ──
export interface MediaGroup {
  infoImages: string[];      // Images contenant les infos (prix, desc)
  productImages: string[];   // Images de la galerie produit
  variantImages: string[];   // Images des variantes
}

export interface ProductVariant {
  id: string;
  size: string;
  color: string;
  color_hex: string;
  stock: number;
  price: number | null;        // Prix specifique a la variante
  image_url: string | null;    // Image de la variante
  label: string;               // "Rouge - M" ou "XL"
}

export interface VisualDraft {
  id: string;
  name: string;
  designation: string;
  description: string;
  price: number | null;        // Prix "from" (minimum)
  originalCurrency: string;    // Devise detectee (CNY, USD, etc)
  originalPrice: number | null;// Prix original detecte
  priceNote: string;
  images: string[];            // Galerie produit (productImages)
  allMedia: string[];          // Tous les medias uploades
  mediaGroup: MediaGroup;
  variants: ProductVariant[];
  categoryId: string | null;
  categoryName: string | null;
  categoryMatch: CategoryMatch | null;
  tags: string[];
  features: string[];
  materials: string[];
  colors: string[];
  detectedBrand: string | null;
  detectedText: string[];
  confidence: number;
  uncertainties: string[];
  status: "draft";
  createdAt: number;
}

export interface CategoryMatch {
  l1Id: string; l1Name: string;
  l2Id: string; l2Name: string;
  l3Id: string; l3Name: string;
  score: number;
  reason: string;
}

interface CatRow {
  id: string; name: string; level: number;
  parent_id: string | null;
}

// ── Constants ──
const MAX_VIDEO_FRAMES = 8;
const FCFA_RATE_CNY = 85;   // 1 CNY ≈ 85 FCFA
const FCFA_RATE_USD = 605;  // 1 USD ≈ 605 FCFA
const FCFA_RATE_EUR = 655;  // 1 EUR ≈ 655 FCFA
const IA_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ── Logger ──
function log(logs: string[], msg: string) {
  const t = new Date().toISOString().slice(11, 19);
  logs.push(`[${t}] ${msg}`);
  console.log(`[VISUAL-AI] ${msg}`);
}

// ── Parse media notation from admin ──
// "1,2" → info, "3,4" → product, "," → variants
export function parseMediaNotation(
  notation: string,
  allUrls: string[]
): MediaGroup {
  const group: MediaGroup = { infoImages: [], productImages: [], variantImages: [] };
  if (!notation.trim() || allUrls.length === 0) {
    // Default: first half = info, rest = product
    const mid = Math.ceil(allUrls.length / 2);
    group.infoImages = allUrls.slice(0, mid);
    group.productImages = allUrls.slice(mid);
    return group;
  }

  const parts = notation.split(",").map(p => p.trim()).filter(Boolean);
  // Check if there's an explicit comma-only segment (",," or trailing ",")
  const hasCommaSeparator = notation.includes(",,");

  let variantStartIndex = -1;

  // Find where variants start (marked by empty segment or explicit comma)
  const segments = notation.split(",");
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].trim() === "" && i > 0) {
      variantStartIndex = i;
      break;
    }
  }

  // Parse ranges/indices
  const indices = new Set<number>();
  for (const part of parts) {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map(n => parseInt(n.trim()) - 1);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.max(0, start); i <= Math.min(end, allUrls.length - 1); i++) indices.add(i);
      }
    } else {
      const idx = parseInt(part) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < allUrls.length) indices.add(idx);
    }
  }

  // If no valid notation, default split
  if (indices.size === 0) {
    const mid = Math.min(2, allUrls.length);
    group.infoImages = allUrls.slice(0, mid);
    group.productImages = allUrls.slice(mid);
    return group;
  }

  // Assign based on notation pattern
  const sorted = [...indices].sort((a, b) => a - b);

  if (hasCommaSeparator || variantStartIndex > 0) {
    // Format: "1,2,3,4,,5,6" → 1-4 = info+product, 5-6 = variants
    const splitPoint = variantStartIndex > 0
      ? sorted[Math.min(variantStartIndex - 1, sorted.length - 1)]
      : Math.floor(sorted.length / 2);

    const firstHalf = sorted.filter(i => i <= splitPoint);
    const secondHalf = sorted.filter(i => i > splitPoint);

    // First half: split between info and product
    const infoSplit = Math.ceil(firstHalf.length / 2);
    group.infoImages = firstHalf.slice(0, infoSplit).map(i => allUrls[i]).filter(Boolean);
    group.productImages = firstHalf.slice(infoSplit).map(i => allUrls[i]).filter(Boolean);
    group.variantImages = secondHalf.map(i => allUrls[i]).filter(Boolean);
  } else {
    // Simple format: all listed = product images, first 1-2 = info
    const explicitIndices = [...indices].sort((a, b) => a - b);
    const infoEnd = Math.min(2, explicitIndices.length);
    group.infoImages = explicitIndices.slice(0, infoEnd).map(i => allUrls[i]).filter(Boolean);
    group.productImages = explicitIndices.slice(infoEnd).map(i => allUrls[i]).filter(Boolean);
  }

  // Ensure we have at least something
  if (group.infoImages.length === 0 && allUrls.length > 0) {
    group.infoImages = [allUrls[0]];
  }
  if (group.productImages.length === 0 && allUrls.length > group.infoImages.length) {
    group.productImages = allUrls.slice(group.infoImages.length);
  }

  return group;
}

// ── Convert price to FCFA ──
function convertToFcfa(price: number, currency: string): number {
  switch (currency.toUpperCase()) {
    case "CNY": case "RMB": case "¥": return Math.round(price * FCFA_RATE_CNY);
    case "USD": case "$": return Math.round(price * FCFA_RATE_USD);
    case "EUR": case "€": return Math.round(price * FCFA_RATE_EUR);
    default: return Math.round(price * FCFA_RATE_CNY); // Default CNY
  }
}

// ── Detect currency from text ──
function detectCurrency(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("$") || lower.includes("usd") || lower.includes("dollar")) return "USD";
  if (lower.includes("€") || lower.includes("eur") || lower.includes("euro")) return "EUR";
  if (lower.includes("£") || lower.includes("gbp")) return "GBP";
  return "CNY"; // Default for Taobao/1688
}

// ── Similarity scoring ──
function normalize(str: string): string {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function similarityScore(source: string, target: string): number {
  const s = normalize(source), t = normalize(target);
  if (s === t) return 1.0;
  if (t.includes(s) || s.includes(t)) return 0.9;
  const sWords = new Set(s.split(" ").filter(w => w.length > 2));
  const tWords = t.split(" ").filter(w => w.length > 2);
  let match = 0;
  for (const w of tWords) {
    if (sWords.has(w)) match++;
    else if (sWords.has(w + "s")) match += 0.8;
    else if (w.endsWith("s") && sWords.has(w.slice(0, -1))) match += 0.8;
  }
  return match / Math.max(sWords.size, tWords.length);
}
function findBestCategory(name: string, pType: string, tags: string[], cats: CatRow[]): CategoryMatch | null {
  const l3s = cats.filter(c => c.level === 3);
  if (l3s.length === 0) return null;
  const query = [name, pType, ...tags].join(" ");
  let best: { cat: CatRow; score: number } | null = null;
  for (const l3 of l3s) {
    const l2 = cats.find(c => c.id === l3.parent_id && c.level === 2);
    const l1 = l2 ? cats.find(c => c.id === l2.parent_id && c.level === 1) : null;
    const fullName = [l1?.name, l2?.name, l3.name].filter(Boolean).join(" ");
    const score = Math.max(similarityScore(query, fullName), similarityScore(query, l3.name));
    if (!best || score > best.score) best = { cat: l3, score };
  }
  if (!best || best.score < 0.15) return null;
  const l2 = cats.find(c => c.id === best.cat.parent_id && c.level === 2);
  const l1 = l2 ? cats.find(c => c.id === l2.parent_id && c.level === 1) : null;
  return {
    l1Id: l1?.id || "", l1Name: l1?.name || "",
    l2Id: l2?.id || "", l2Name: l2?.name || "",
    l3Id: best.cat.id, l3Name: best.cat.name,
    score: Math.round(best.score * 100),
    reason: `Match a ${Math.round(best.score * 100)}%`,
  };
}

// ── Upload ──
export const uploadImportMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    fileBase64: z.string().min(100), fileName: z.string().min(1), mimeType: z.string().min(1),
  }).parse(input))
  .handler(async ({ data }) => {
    const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `temp/${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safeName}`;
    const binary = Buffer.from(data.fileBase64, "base64");
    for (const bucket of ["imports", "product-images"]) {
      const { error } = await supabase.storage.from(bucket).upload(path, binary, { contentType: data.mimeType, upsert: false });
      if (!error) { const { data: u } = supabase.storage.from(bucket).getPublicUrl(path); return { url: u.publicUrl, path }; }
    }
    throw new Error("Upload failed");
  });

// ── Extract video frames with fallback ──
export const extractVideoFrames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    videoUrl: z.string().url(),
    maxFrames: z.number().int().min(1).max(MAX_VIDEO_FRAMES).default(MAX_VIDEO_FRAMES),
  }).parse(input))
  .handler(async ({ data }) => {
    const logs: string[] = [];
    log(logs, `Extraction video: ${data.videoUrl.slice(0, 50)}`);

    let frameUrls: string[] = [];
    let frameCount = 0;
    let error = "";

    try {
      const fs = await import("fs");
      const path = await import("path");
      const { execSync } = await import("child_process");
      const os = await import("os");

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vai-"));
      const videoPath = path.join(tempDir, "v.mp4");

      // Download video
      log(logs, "Download video...");
      const res = await fetch(data.videoUrl, { signal: AbortSignal.timeout(30000) });
      fs.writeFileSync(videoPath, Buffer.from(await res.arrayBuffer()));

      const dur = parseFloat(
        execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
          { encoding: "utf-8", timeout: 10000 }).trim()
      ) || 60;
      log(logs, `Duration: ${dur.toFixed(1)}s`);

      // Scene detection
      try {
        execSync(`ffmpeg -i "${videoPath}" -vf "select='gt(scene,0.3)'" -vsync vfr -q:v 2 "${tempDir}/s_%04d.jpg" 2>/dev/null`, { timeout: 30000 });
      } catch { /* fallback */ }

      const scenes = fs.readdirSync(tempDir).filter(f => f.startsWith("s_")).sort();
      const frames: string[] = [];

      if (scenes.length < 3) {
        const interval = Math.min(dur, 60) / (data.maxFrames + 1);
        for (let i = 1; i <= data.maxFrames; i++) {
          const out = path.join(tempDir, `f_${i}.jpg`);
          try {
            execSync(`ffmpeg -ss ${(interval * i).toFixed(1)} -i "${videoPath}" -vf "scale=720:-1" -vframes 1 -q:v 2 "${out}"`, { timeout: 10000 });
            if (fs.existsSync(out) && fs.statSync(out).size > 1000) frames.push(out);
          } catch { }
        }
      } else {
        for (const s of scenes.slice(0, data.maxFrames)) frames.push(path.join(tempDir, s));
      }

      // Upload frames
      const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
      for (let i = 0; i < frames.length; i++) {
        const buf = fs.readFileSync(frames[i]);
        const up = `temp/f/${Date.now()}_${i}.jpg`;
        for (const b of ["imports", "product-images"]) {
          const { error: e } = await supabase.storage.from(b).upload(up, buf, { contentType: "image/jpeg", upsert: false });
          if (!e) { const { data: u } = supabase.storage.from(b).getPublicUrl(up); frameUrls.push(u.publicUrl); break; }
        }
      }

      frameCount = frameUrls.length;
      log(logs, `${frameCount} frames extracted`);

      try { fs.rmSync(tempDir, { recursive: true }); } catch { }

    } catch (e: any) {
      error = e.message;
      log(logs, `Video extraction failed: ${error}`);
    }

    return { frameUrls, frameCount, error };
  });

// ── AI Vision Analysis with media groups ──
export const analyzeVisualMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    imageUrls: z.array(z.string().url()).max(30).default([]),
    videoFrameUrls: z.array(z.string().url()).max(MAX_VIDEO_FRAMES).default([]),
    mediaNotation: z.string().default(""),
  }).parse(input))
  .handler(async ({ data }) => {
    const logs: string[] = [];
    log(logs, "=== Analyse IA Visuelle ===");

    const allUrls = [...data.imageUrls, ...data.videoFrameUrls];
    if (allUrls.length === 0) {
      return { success: false, draft: null, logs, errors: ["Aucun media"], mediaProcessed: 0 };
    }

    // Parse media groups from notation
    const mediaGroup = parseMediaNotation(data.mediaNotation, allUrls);
    log(logs, `Media: ${allUrls.length} total | Info: ${mediaGroup.infoImages.length} | Produit: ${mediaGroup.productImages.length} | Variantes: ${mediaGroup.variantImages.length}`);

    // Load categories
    const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { data: allCats } = await supabase.from("categories").select("id, name, level, parent_id, name_i18n").order("position");
    const cats = (allCats || []) as CatRow[];

    const catNamesL3 = cats.filter(c => c.level === 3).map(c => {
      const l2 = cats.find(p => p.id === c.parent_id && p.level === 2);
      const l1 = l2 ? cats.find(p => p.id === l2.parent_id && p.level === 1) : null;
      return `${l1?.name || ""}>${l2?.name || ""}>${c.name}`;
    }).slice(0, 50).join("\n");

    // Build AI prompt with media group context
    const infoImagesDesc = mediaGroup.infoImages.length > 0
      ? `Images INFO (contiennent prix/details): ${mediaGroup.infoImages.length}`
      : "Aucune image INFO";
    const variantImagesDesc = mediaGroup.variantImages.length > 0
      ? `Images VARIANTES: ${mediaGroup.variantImages.length}`
      : "Aucune image variante";

    const prompt = `Analyse ces images de produit e-commerce. EXTRAIS UNIQUEMENT ce qui est visible.

${infoImagesDesc}
${variantImagesDesc}

REGLES PRIX:
- Si prix visible avec devise (¥, $, €) → convertis en FCFA (1 CNY=85 FCFA, 1 USD=605 FCFA)
- Si prix non visible → price: null
- Chaque variante DOIT avoir son propre prix si visible
- Le prix "from" = le prix MINIMUM parmi toutes les variantes

REGLES VARIANTES:
- Si images de variantes fournies → chaque variante a une image_url correspondante
- Format variant: {"size":"","color":"","color_hex":"","price":0,"image_url":"","confidence":80}

Reponds JSON strict:
{
  "name":"nom FR 60c","designation":"80c","description":"300c max",
  "originalPrice":123,"originalCurrency":"CNY","priceInFcfa":10455,
  "detectedCurrency":"CNY",
  "variants":[
    {"size":"M","color":"Rouge","color_hex":"#FF0000","price":10000,"image_url":"","confidence":90}
  ],
  "colors":[""],"materials":[""],"detectedBrand":null,
  "detectedText":[""],"tags":[""],"features":[""],
  "categoryHint":"","productType":"","confidence":70,
  "uncertainties":[""]
}

Categories:\n${catNamesL3}`;

    // Select images: info first, then some product, then variants
    const analysisImages = [
      ...mediaGroup.infoImages.slice(0, 4),
      ...mediaGroup.productImages.slice(0, 4),
      ...mediaGroup.variantImages.slice(0, 4),
    ].slice(0, 10);

    // If no specific grouping, use all
    const selected = analysisImages.length > 0 ? analysisImages : allUrls.slice(0, 10);

    const contentParts: any[] = [{ type: "text", text: prompt }];
    for (const url of selected) contentParts.push({ type: "image_url", image_url: { url, detail: "high" } });

    let aiResult: any = null;
    try {
      const apiKey = process.env.LOVABLE_API_KEY || "";
      const res = await fetch(IA_ENDPOINT, {
        method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "system", content: "Tu es un expert analyse visuelle produits e-commerce." }, { role: "user", content: contentParts }], max_tokens: 4096, temperature: 0.2 }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`IA HTTP ${res.status}`);
      const json = await res.json();
      const raw = json.choices?.[0]?.message?.content?.trim() || "";
      try { const c = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim(); aiResult = JSON.parse(c); }
      catch { const m = raw.match(/\{[\s\S]*\}/); if (m) aiResult = JSON.parse(m[0]); else throw new Error("JSON invalide"); }
      log(logs, `IA: "${aiResult?.name?.slice(0, 40)}"`);
    } catch (e: any) {
      log(logs, `Erreur IA: ${e.message}`);
      return { success: false, draft: null, logs, errors: [`IA: ${e.message}`], mediaProcessed: allUrls.length };
    }

    // Currency detection & conversion
    const detectedCurrency = aiResult?.detectedCurrency || aiResult?.originalCurrency || detectCurrency(JSON.stringify(aiResult));
    const originalPrice = aiResult?.originalPrice && Number(aiResult.originalPrice) > 0 ? Number(aiResult.originalPrice) : null;
    let priceInFcfa: number | null = null;
    if (originalPrice && originalPrice > 0) {
      priceInFcfa = convertToFcfa(originalPrice, detectedCurrency);
      log(logs, `Prix: ${originalPrice} ${detectedCurrency} → ${priceInFcfa} FCFA`);
    }

    // Build variants with prices and images
    const rawVariants = Array.isArray(aiResult?.variants) ? aiResult.variants : [];
    const variantImages = mediaGroup.variantImages;

    const variants: ProductVariant[] = rawVariants.map((v: any, i: number) => {
      const vPrice = v.price && Number(v.price) > 0 ? Number(v.price) : null;
      const vPriceFcfa = vPrice ? convertToFcfa(vPrice, detectedCurrency) : priceInFcfa;
      return {
        id: `v-${Date.now()}-${i}`,
        size: String(v.size || "").slice(0, 40),
        color: String(v.color || "").slice(0, 60),
        color_hex: /^#[0-9a-fA-F]{6}$/.test(v.color_hex) ? v.color_hex : "",
        stock: 0,
        price: vPriceFcfa,
        image_url: variantImages[i] || null,
        label: v.color && v.size ? `${v.color} - ${v.size}` : (v.color || v.size || `Variante ${i + 1}`),
      };
    }).filter((v: ProductVariant) => v.size || v.color);

    // If no variants extracted but we have variant images, create basic variants
    if (variants.length === 0 && variantImages.length > 0) {
      for (let i = 0; i < variantImages.length; i++) {
        variants.push({
          id: `v-auto-${i}`, size: "", color: `Option ${i + 1}`,
          color_hex: "", stock: 0, price: priceInFcfa,
          image_url: variantImages[i], label: `Option ${i + 1}`,
        });
      }
    }

    // Calculate "from" price = minimum variant price or main price
    let fromPrice = priceInFcfa;
    const variantPrices = variants.map(v => v.price).filter((p): p is number => p !== null && p > 0);
    if (variantPrices.length > 0) {
      fromPrice = Math.min(...variantPrices);
    }

    // Category matching
    const catMatch = findBestCategory(
      aiResult?.name || "",
      aiResult?.productType || aiResult?.categoryHint || "",
      Array.isArray(aiResult?.tags) ? aiResult.tags : [],
      cats
    );
    if (catMatch) log(logs, `Cat: ${catMatch.l3Name} (${catMatch.score}%)`);

    // Uncertainties
    const uncertainties: string[] = Array.isArray(aiResult?.uncertainties) ? aiResult.uncertainties : [];
    if (!originalPrice) uncertainties.push("Prix non visible - a completer en FCFA");
    else uncertainties.push(`Prix converti: ${originalPrice} ${detectedCurrency} → ${priceInFcfa} FCFA (verifiez)`);
    if (!catMatch) uncertainties.push("Aucune categorie proche - selectionnez manuellement");
    else if (catMatch.score < 50) uncertainties.push(`Categorie incertaine (${catMatch.score}%)`);

    const draft: VisualDraft = {
      id: `vd-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: String(aiResult?.name || "Produit").slice(0, 100),
      designation: String(aiResult?.designation || aiResult?.name || "").slice(0, 120),
      description: String(aiResult?.description || "").slice(0, 2000),
      price: fromPrice,
      originalCurrency: detectedCurrency,
      originalPrice: originalPrice,
      priceNote: originalPrice
        ? `${originalPrice} ${detectedCurrency} → ${fromPrice} FCFA`
        : "Prix a completer en FCFA",
      images: mediaGroup.productImages.length > 0 ? mediaGroup.productImages : allUrls.slice(2),
      allMedia: allUrls,
      mediaGroup,
      variants,
      categoryId: catMatch?.l3Id || null,
      categoryName: catMatch ? `${catMatch.l1Name} > ${catMatch.l2Name} > ${catMatch.l3Name}` : null,
      categoryMatch: catMatch,
      tags: Array.isArray(aiResult?.tags) ? aiResult.tags.map((t: any) => String(t).slice(0, 30)) : [],
      features: Array.isArray(aiResult?.features) ? aiResult.features.map((f: any) => String(f).slice(0, 100)) : [],
      materials: Array.isArray(aiResult?.materials) ? aiResult.materials.map((m: any) => String(m).slice(0, 40)) : [],
      colors: Array.isArray(aiResult?.colors) ? aiResult.colors.map((c: any) => String(c).slice(0, 30)) : [],
      detectedBrand: aiResult?.detectedBrand || null,
      detectedText: Array.isArray(aiResult?.detectedText) ? aiResult.detectedText.map((t: any) => String(t).slice(0, 100)) : [],
      confidence: Math.min(95, Math.max(10, Number(aiResult?.confidence) || 50)),
      uncertainties: [...new Set(uncertainties)],
      status: "draft", createdAt: Date.now(),
    };

    log(logs, `=== Draft: "${draft.name}" | Prix from: ${fromPrice} FCFA | ${variants.length} variantes ===`);
    return { success: true, draft, logs, errors: [], mediaProcessed: allUrls.length };
  });

// ── Publish draft (IDENTICAL to admin form) ──
export const publishDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    draft: z.object({
      name: z.string().min(1), designation: z.string().optional(),
      description: z.string().optional(), price: z.number().min(0),
      categoryId: z.string().nullable(), images: z.array(z.string()),
      variants: z.array(z.object({
        size: z.string(), color: z.string(), color_hex: z.string(),
        stock: z.number(), price: z.number().nullable(), image_url: z.string().nullable(),
      })),
    }),
  }).parse(input))
  .handler(async ({ data }) => {
    const logs: string[] = [];
    const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;

    // 1. Find admin shop
    let adminShop: any;
    const { data: s } = await supabase.from("profiles").select("id, shop_name").eq("is_admin_shop", true).maybeSingle();
    if (s) adminShop = s;
    else { const { data: a } = await supabase.from("profiles").select("id, shop_name").eq("role", "admin").limit(1).single(); adminShop = a; }
    if (!adminShop) throw new Error("Boutique admin introuvable");
    const shopId = adminShop.id;

    // 2. Generate code
    const ts = Date.now().toString(36).toUpperCase();
    let code = `VIS-${ts}`;
    for (let i = 0; i < 10; i++) { const { data: dup } = await supabase.from("products").select("id").eq("vendor_id", shopId).eq("code", code).maybeSingle(); if (!dup) break; code = `VIS-${ts}-${i}`; }

    // 3. Transaction
    let productId: string | null = null;
    const uploadedPaths: string[] = [];
    try {
      const { data: prod, error: pErr } = await supabase.from("products").insert({
        vendor_id: shopId, name: data.draft.name.trim(), code,
        designation: data.draft.designation?.trim() || null,
        description: data.draft.description?.trim() || null,
        price: data.draft.price, category_id: data.draft.categoryId,
        pending_category_request_id: null,
        requires_international_shipping: false, status: "approved",
      }).select("id").single();
      if (pErr) throw pErr;
      productId = prod.id;

      // Images
      if (data.draft.images.length > 0) {
        const imgRows: any[] = [];
        for (let i = 0; i < data.draft.images.length; i++) {
          try {
            const r = await fetch(data.draft.images[i], { signal: AbortSignal.timeout(15000) });
            if (!r.ok) continue;
            const buf = Buffer.from(await r.arrayBuffer());
            const ext = data.draft.images[i].split("?")[0].split(".").pop() || "jpg";
            const p = `${shopId}/${productId}/${Date.now()}-${i}.${ext}`;
            const { error: uErr } = await supabase.storage.from("product-images").upload(p, buf);
            if (uErr) continue;
            uploadedPaths.push(p);
            const { data: pub } = supabase.storage.from("product-images").getPublicUrl(p);
            imgRows.push({ product_id: productId, url: pub.publicUrl, position: i });
          } catch { }
        }
        if (imgRows.length > 0) await supabase.from("product_images").insert(imgRows);
      }

      // Variants
      if (data.draft.variants.length > 0) {
        const vRows = data.draft.variants.map(v => ({
          product_id: productId!, size: v.size.trim() || null, color: v.color.trim() || null,
          color_hex: v.color_hex || null, stock: v.stock || 0,
          price_override: v.price, image_url: v.image_url,
        }));
        await supabase.from("product_variants").insert(vRows);
      }

      // Auto-translate
      try { const { autoTranslateProduct } = await import("@/lib/auto-translate"); void autoTranslateProduct({ productId, name: data.draft.name.trim(), designation: data.draft.designation?.trim() || null, description: data.draft.description?.trim() || null }); } catch { }

      return { success: true, productId, code, logs };
    } catch (e: any) {
      if (productId) {
        await supabase.from("product_variants").delete().eq("product_id", productId);
        await supabase.from("product_images").delete().eq("product_id", productId);
        await supabase.from("products").delete().eq("id", productId);
      }
      if (uploadedPaths.length > 0) await supabase.storage.from("product-images").remove(uploadedPaths);
      throw new Error(e.message || "Publication echouee");
    }
  });
