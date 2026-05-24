/**
 * visual-ai-import.service.ts
 * ---------------------------
 * Moteur IA Visuel autonome pour l'import de produits.
 *
 * ZERO creation automatique de categories.
 * Scoring de similarite intelligent pour reutiliser les categories existantes.
 * Publication identique au formulaire admin (meme structure DB, memes validations).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── Types ──
export interface VisualProductDraft {
  id: string;
  name: string;
  designation: string;
  description: string;
  price: number | null;
  priceNote: string;
  images: string[];
  gallery: string[];
  variants: Array<{
    size: string; color: string; color_hex: string;
    stock: number; price_override: number | null;
    image_url: string | null;
  }>;
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
  sourceMedia: string[];
  status: "draft";
  createdAt: number;
}

interface CategoryMatch {
  l1Id: string; l1Name: string;
  l2Id: string; l2Name: string;
  l3Id: string; l3Name: string;
  score: number;
  reason: string;
}

interface CatRow {
  id: string; name: string; level: number;
  parent_id: string | null; name_i18n: unknown;
}

// ── Logger ──
function log(logs: string[], msg: string) {
  const t = new Date().toISOString().slice(11, 19);
  logs.push(`[${t}] ${msg}`);
  console.log(`[VISUAL-AI] ${msg}`);
}

const MAX_VIDEO_FRAMES = 8;
const IA_MODEL = "google/gemini-2.5-flash";
const IA_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ── Similarity scoring ──
function normalize(str: string): string {
  return str.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(normalize(a).split(" ").filter(w => w.length > 2));
  const wordsB = normalize(b).split(" ").filter(w => w.length > 2);
  if (wordsA.size === 0 || wordsB.length === 0) return 0;
  let match = 0;
  for (const w of wordsB) {
    if (wordsA.has(w)) match++;
    // Check plurals / singulars
    else if (wordsA.has(w + "s")) match += 0.8;
    else if (w.endsWith("s") && wordsA.has(w.slice(0, -1))) match += 0.8;
  }
  return match / Math.max(wordsA.size, wordsB.length);
}

function similarityScore(source: string, target: string): number {
  const s = normalize(source);
  const t = normalize(target);
  if (s === t) return 1.0;
  if (t.includes(s) || s.includes(t)) return 0.9;

  const words = wordOverlap(source, target);

  // Word-by-word partial matching
  const sWords = s.split(" ").filter(w => w.length > 2);
  const tWords = t.split(" ").filter(w => w.length > 2);
  let partialMatch = 0;
  for (const sw of sWords) {
    for (const tw of tWords) {
      if (sw === tw) { partialMatch += 1; break; }
      else if (sw.length > 4 && tw.length > 4 && (sw.startsWith(tw) || tw.startsWith(sw))) {
        partialMatch += 0.6; break;
      }
    }
  }
  const partialScore = sWords.length > 0 ? partialMatch / sWords.length : 0;

  return Math.max(words * 0.7 + partialScore * 0.3, partialScore * 0.5);
}

// Find the best matching category from existing categories
function findBestCategory(
  productName: string,
  productType: string,
  productTags: string[],
  cats: CatRow[]
): CategoryMatch | null {
  const l3s = cats.filter(c => c.level === 3);
  if (l3s.length === 0) return null;

  const queryText = [productName, productType, ...productTags].join(" ");
  let best: { cat: CatRow; score: number; reason: string } | null = null;

  for (const l3 of l3s) {
    // Build full path name
    const l2 = cats.find(c => c.id === l3.parent_id && c.level === 2);
    const l1 = l2 ? cats.find(c => c.id === l2.parent_id && c.level === 1) : null;
    const fullName = [l1?.name, l2?.name, l3.name].filter(Boolean).join(" > ");

    const score = similarityScore(queryText, fullName);

    if (!best || score > best.score) {
      best = { cat: l3, score, reason: `Match "${fullName}" à ${Math.round(score * 100)}%` };
    }
  }

  // Also try matching against just L3 names
  for (const l3 of l3s) {
    const score = similarityScore(queryText, l3.name);
    if (best && score > best.score) {
      const l2 = cats.find(c => c.id === l3.parent_id && c.level === 2);
      const l1 = l2 ? cats.find(c => c.id === l2.parent_id && c.level === 1) : null;
      best = {
        cat: l3,
        score,
        reason: `Match L3 "${l3.name}" à ${Math.round(score * 100)}%`,
      };
    }
  }

  if (!best || best.score < 0.15) return null;

  const l2 = cats.find(c => c.id === best.cat.parent_id && c.level === 2);
  const l1 = l2 ? cats.find(c => c.id === l2.parent_id && c.level === 1) : null;

  return {
    l1Id: l1?.id || "",
    l1Name: l1?.name || "",
    l2Id: l2?.id || "",
    l2Name: l2?.name || "",
    l3Id: best.cat.id,
    l3Name: best.cat.name,
    score: Math.round(best.score * 100),
    reason: best.reason,
  };
}

// ── Upload media ──
export const uploadImportMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    fileBase64: z.string().min(100),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
  }).parse(input))
  .handler(async ({ data }) => {
    const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `temp/${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safeName}`;
    const binary = Buffer.from(data.fileBase64, "base64");

    for (const bucket of ["imports", "product-images"]) {
      const { error } = await supabase.storage.from(bucket).upload(path, binary, {
        contentType: data.mimeType, upsert: false,
      });
      if (!error) {
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
        return { url: urlData.publicUrl, path };
      }
    }
    throw new Error("Upload failed: no bucket available");
  });

// ── Extract video frames ──
export const extractVideoFrames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    videoUrl: z.string().url(),
    maxFrames: z.number().int().min(1).max(MAX_VIDEO_FRAMES).default(MAX_VIDEO_FRAMES),
  }).parse(input))
  .handler(async ({ data }) => {
    const fs = await import("fs");
    const path = await import("path");
    const { execSync } = await import("child_process");
    const os = await import("os");

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "visual-ai-"));
    const videoPath = path.join(tempDir, "input.mp4");

    try {
      const res = await fetch(data.videoUrl, { signal: AbortSignal.timeout(30000) });
      fs.writeFileSync(videoPath, Buffer.from(await res.arrayBuffer()));

      const duration = parseFloat(
        execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
          { encoding: "utf-8", timeout: 10000 }).trim()
      ) || 60;

      // Scene detection
      try {
        execSync(
          `ffmpeg -i "${videoPath}" -vf "select='gt(scene,0.3)',showinfo" -vsync vfr -q:v 2 -f image2 "${tempDir}/scene_%04d.jpg" 2>/dev/null`,
          { timeout: 30000 }
        );
      } catch { /* fallback below */ }

      const scenes = fs.readdirSync(tempDir).filter(f => f.startsWith("scene_")).sort();
      const frames: string[] = [];

      if (scenes.length < 3) {
        const interval = Math.min(duration, 60) / (data.maxFrames + 1);
        for (let i = 1; i <= data.maxFrames; i++) {
          const out = path.join(tempDir, `frame_${i}.jpg`);
          try {
            execSync(`ffmpeg -ss ${(interval * i).toFixed(1)} -i "${videoPath}" -vf "scale=720:-1" -vframes 1 -q:v 2 "${out}"`,
              { timeout: 10000 });
            if (fs.existsSync(out) && fs.statSync(out).size > 1000) frames.push(out);
          } catch { }
        }
      } else {
        for (const s of scenes.slice(0, data.maxFrames)) {
          frames.push(path.join(tempDir, s));
        }
      }

      // Upload frames
      const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
      const urls: string[] = [];
      for (let i = 0; i < frames.length; i++) {
        const buf = fs.readFileSync(frames[i]);
        const upath = `temp/frames/${Date.now()}_${i}.jpg`;
        for (const bucket of ["imports", "product-images"]) {
          const { error } = await supabase.storage.from(bucket).upload(upath, buf, {
            contentType: "image/jpeg", upsert: false,
          });
          if (!error) {
            const { data: u } = supabase.storage.from(bucket).getPublicUrl(upath);
            urls.push(u.publicUrl); break;
          }
        }
      }

      return { frameUrls: urls, frameCount: urls.length };
    } finally {
      try { fs.rmSync(tempDir, { recursive: true }); } catch { }
    }
  });

// ── Core: Analyze images with AI Vision ──
export const analyzeVisualMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    imageUrls: z.array(z.string().url()).max(20).default([]),
    videoFrameUrls: z.array(z.string().url()).max(MAX_VIDEO_FRAMES).default([]),
  }).parse(input))
  .handler(async ({ data }) => {
    const logs: string[] = [];
    const errors: string[] = [];
    log(logs, "=== Analyse IA Visuelle ===");

    const allUrls = [...data.imageUrls, ...data.videoFrameUrls];
    if (allUrls.length === 0) {
      errors.push("Aucun media");
      return { success: false, draft: null, logs, errors, mediaProcessed: 0, framesExtracted: 0 };
    }

    // Load ALL categories (all levels) for similarity scoring
    log(logs, "Chargement categories existantes...");
    const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { data: allCats } = await supabase
      .from("categories")
      .select("id, name, level, parent_id, name_i18n")
      .order("position");
    const cats = (allCats || []) as CatRow[];
    log(logs, `${cats.length} categories chargees (L1:${cats.filter(c=>c.level===1).length} L2:${cats.filter(c=>c.level===2).length} L3:${cats.filter(c=>c.level===3).length})`);

    const catNamesL3 = cats.filter(c => c.level === 3).map(c => {
      const l2 = cats.find(p => p.id === c.parent_id && p.level === 2);
      const l1 = l2 ? cats.find(p => p.id === l2.parent_id && p.level === 1) : null;
      return `${l1?.name || ""} > ${l2?.name || ""} > ${c.name}`;
    }).slice(0, 50).join("\n");

    // AI prompt
    const systemPrompt = `Tu es un expert analyse visuelle produits e-commerce. Analyse les images et extrais UNIQUEMENT ce qui est visible. Ne invente JAMAIS.

REGLES:
- Prix non visible → "price": null
- Variante incertaine → confidence < 50
- Ne cree pas de categories

Reponds en JSON strict:
{
  "name": "nom FR 60c max",
  "designation": "designation 80c",
  "description": "description 300c max",
  "price": null ou nombre,
  "colors": ["couleur1"],
  "materials": ["materiau1"],
  "detectedBrand": "marque si visible",
  "detectedText": ["texte OCR"],
  "variants": [
    {"type": "color|size|style", "value": "...", "hex": "#RRGGBB", "confidence": 85}
  ],
  "tags": ["tag1"],
  "features": ["feature1"],
  "categoryHint": "description pour categorisation",
  "productType": "type de produit",
  "confidence": 75,
  "uncertainties": ["liste incertitudes"]
}

Categories existantes:\n${catNamesL3}`;

    const selected = allUrls.slice(0, 10);
    const contentParts: any[] = [
      { type: "text", text: "Analyse ces images de produit. JSON strict uniquement." },
    ];
    for (const url of selected) {
      contentParts.push({ type: "image_url", image_url: { url, detail: "high" } });
    }

    log(logs, `Envoi IA: ${selected.length} images`);

    let aiResult: any = null;
    try {
      const apiKey = process.env.LOVABLE_API_KEY || "";
      if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");

      const res = await fetch(IA_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: IA_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: contentParts },
          ],
          max_tokens: 4096,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) throw new Error(`IA HTTP ${res.status}`);
      const json = await res.json();
      const raw = json.choices?.[0]?.message?.content?.trim() || "";

      try {
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
        aiResult = JSON.parse(cleaned);
      } catch {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) aiResult = JSON.parse(m[0]);
        else throw new Error("JSON invalide");
      }

      log(logs, `IA: "${aiResult?.name?.slice(0, 40)}" confiance=${aiResult?.confidence}`);
    } catch (e: any) {
      log(logs, `Erreur IA: ${e.message}`);
      errors.push(`IA: ${e.message}`);
      return { success: false, draft: null, logs, errors, mediaProcessed: allUrls.length, framesExtracted: data.videoFrameUrls.length };
    }

    // Find best category using intelligent similarity scoring
    log(logs, "Scoring categories existantes...");
    const categoryMatch = findBestCategory(
      aiResult?.name || "",
      aiResult?.productType || aiResult?.categoryHint || "",
      Array.isArray(aiResult?.tags) ? aiResult.tags : [],
      cats
    );

    if (categoryMatch) {
      log(logs, `Categorie trouvee: ${categoryMatch.l3Name} (${categoryMatch.score}%) - ${categoryMatch.reason}`);
    } else {
      log(logs, "Aucune categorie suffisamment proche trouvee");
    }

    // Build uncertainties
    const uncertainties: string[] = Array.isArray(aiResult?.uncertainties) ? aiResult.uncertainties : [];
    if (!aiResult?.price) uncertainties.push("Prix non visible - a completer");
    if (!categoryMatch) uncertainties.push("Aucune categorie suffisamment proche trouvee - selectionnez manuellement");
    else if (categoryMatch.score < 50) uncertainties.push(`Categorie suggeree peu certaine (${categoryMatch.score}%) - verifiez`);

    for (const v of (aiResult?.variants || [])) {
      if (v.confidence < 50) uncertainties.push(`Variante "${v.value}" incertaine (${v.confidence}%)`);
    }

    // Build draft
    const draft: VisualProductDraft = {
      id: `visual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: String(aiResult?.name || "Produit detecte").slice(0, 100),
      designation: String(aiResult?.designation || aiResult?.name || "").slice(0, 120),
      description: String(aiResult?.description || "").slice(0, 2000),
      price: aiResult?.price && Number(aiResult.price) > 0 ? Number(aiResult.price) : null,
      priceNote: aiResult?.price && Number(aiResult.price) > 0 ? `Prix detecte: ${aiResult.price}` : "Prix a completer",
      images: data.imageUrls.slice(0, 5),
      gallery: allUrls,
      variants: (Array.isArray(aiResult?.variants) ? aiResult.variants : []).map((v: any) => ({
        size: v.type === "size" ? String(v.value || "").slice(0, 40) : "",
        color: v.type === "color" || v.type === "style" ? String(v.value || "").slice(0, 60) : "",
        color_hex: /^#[0-9a-fA-F]{6}$/.test(v.hex) ? v.hex : "",
        stock: 0,
        price_override: null,
        image_url: null,
      })).filter((v: any) => v.size || v.color),
      categoryId: categoryMatch?.l3Id || null,
      categoryName: categoryMatch ? `${categoryMatch.l1Name} > ${categoryMatch.l2Name} > ${categoryMatch.l3Name}` : null,
      categoryMatch,
      tags: Array.isArray(aiResult?.tags) ? aiResult.tags.map((t: any) => String(t).slice(0, 30)) : [],
      features: Array.isArray(aiResult?.features) ? aiResult.features.map((f: any) => String(f).slice(0, 100)) : [],
      materials: Array.isArray(aiResult?.materials) ? aiResult.materials.map((m: any) => String(m).slice(0, 40)) : [],
      colors: Array.isArray(aiResult?.colors) ? aiResult.colors.map((c: any) => String(c).slice(0, 30)) : [],
      detectedBrand: aiResult?.detectedBrand || null,
      detectedText: Array.isArray(aiResult?.detectedText) ? aiResult.detectedText.map((t: any) => String(t).slice(0, 100)) : [],
      confidence: Math.min(95, Math.max(10, Number(aiResult?.confidence) || 50)),
      uncertainties: [...new Set(uncertainties)],
      sourceMedia: allUrls,
      status: "draft",
      createdAt: Date.now(),
    };

    log(logs, `=== Brouillon: "${draft.name}" | Cat: ${categoryMatch?.l3Name || "?"} | Conf: ${draft.confidence}% ===`);
    return {
      success: true,
      draft,
      logs,
      errors,
      mediaProcessed: allUrls.length,
      framesExtracted: data.videoFrameUrls.length,
    };
  });

// ── PUBLISH: Identical to admin product form ──
export const publishVisualProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    shopId: z.string().uuid(),
    draft: z.object({
      name: z.string().min(1),
      designation: z.string().optional(),
      description: z.string().optional(),
      price: z.number().min(0),
      categoryId: z.string().nullable(),
      images: z.array(z.string()),
      variants: z.array(z.object({
        size: z.string(), color: z.string(), color_hex: z.string(),
        stock: z.number(), price_override: z.number().nullable(),
        image_url: z.string().nullable(),
      })),
    }),
  }).parse(input))
  .handler(async ({ data }) => {
    const logs: string[] = [];
    log(logs, "=== Publication produit IA ===");

    const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { shopId, draft } = data;

    // Generate unique code
    const timestamp = Date.now().toString(36).toUpperCase();
    const baseCode = "VIS-" + timestamp;
    let code = baseCode;
    let attempts = 0;
    while (attempts < 10) {
      const { data: dup } = await supabase.from("products").select("id").eq("vendor_id", shopId).eq("code", code).maybeSingle();
      if (!dup) break;
      code = `${baseCode}-${attempts}`;
      attempts++;
    }

    log(logs, `Code: ${code}`);

    // ── TRANSACTION: insert product → images → variants ──
    let productId: string | null = null;
    const uploadedPaths: string[] = [];

    try {
      // 1. Insert product (IDENTICAL to admin form)
      log(logs, "Insertion produit...");
      const { data: prod, error: prodErr } = await supabase
        .from("products")
        .insert({
          vendor_id: shopId,
          name: draft.name.trim(),
          code: code,
          designation: draft.designation?.trim() || null,
          description: draft.description?.trim() || null,
          price: draft.price,
          category_id: draft.categoryId,
          pending_category_request_id: null,
          requires_international_shipping: false,
          status: "approved",
        })
        .select("id")
        .single();

      if (prodErr) {
        if (prodErr.message.includes("unique") || prodErr.message.includes("duplicate")) {
          throw new Error("Ce code produit existe deja.");
        }
        throw prodErr;
      }
      productId = prod.id;
      log(logs, `Produit cree: ${productId}`);

      // 2. Upload images to Supabase Storage + insert product_images
      if (draft.images.length > 0) {
        log(logs, `Upload ${draft.images.length} images...`);
        const imageRows: Array<{ product_id: string; url: string; position: number }> = [];

        for (let i = 0; i < draft.images.length; i++) {
          const imgUrl = draft.images[i];
          try {
            // Download image from URL
            const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(15000) });
            if (!imgRes.ok) continue;
            const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

            const ext = imgUrl.split("?")[0].split(".").pop() || "jpg";
            const path = `${shopId}/${productId}/${Date.now()}-${i}.${ext}`;

            const { error: upErr } = await supabase.storage.from("product-images").upload(path, imgBuffer);
            if (upErr) continue;
            uploadedPaths.push(path);

            const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
            imageRows.push({ product_id: productId, url: pub.publicUrl, position: i });
          } catch (e: any) {
            log(logs, `Image ${i} erreur: ${e.message}`);
          }
        }

        if (imageRows.length > 0) {
          const { error: imgErr } = await supabase.from("product_images").insert(imageRows);
          if (imgErr) throw imgErr;
          log(logs, `${imageRows.length} images enregistrees`);
        }
      }

      // 3. Insert variants (IDENTICAL structure to admin form)
      if (draft.variants.length > 0) {
        log(logs, `Insertion ${draft.variants.length} variantes...`);
        const variantRows = draft.variants.map(v => ({
          product_id: productId!,
          size: v.size.trim() || null,
          color: v.color.trim() || null,
          color_hex: v.color_hex || null,
          stock: v.stock || 0,
          price_override: v.price_override,
          image_url: v.image_url,
        }));

        const { error: varErr } = await supabase.from("product_variants").insert(variantRows);
        if (varErr) throw varErr;
        log(logs, "Variantes enregistrees");
      }

      // 4. Auto-translate
      const { autoTranslateProduct } = await import("@/lib/auto-translate");
      void autoTranslateProduct({
        productId,
        name: draft.name.trim(),
        designation: draft.designation?.trim() || null,
        description: draft.description?.trim() || null,
      });

      log(logs, "=== Publication OK ===");
      return { success: true, productId, code, logs };

    } catch (e: any) {
      log(logs, `ERREUR: ${e.message}`);
      // ROLLBACK
      if (productId) {
        await supabase.from("product_variants").delete().eq("product_id", productId);
        await supabase.from("product_images").delete().eq("product_id", productId);
        await supabase.from("product_admin_metadata").delete().eq("product_id", productId);
        await supabase.from("products").delete().eq("id", productId);
      }
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("product-images").remove(uploadedPaths);
      }
      throw new Error(e.message || "Publication echouee");
    }
  });

// ── Load shops for target selection ──
export const listAdminShops = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { data } = await supabase
      .from("profiles")
      .select("id, shop_name, full_name, is_admin_shop")
      .or("role.eq.vendor,role.eq.admin")
      .order("shop_name");
    return (data || []).map(s => ({
      id: s.id,
      name: s.shop_name || s.full_name || "Sans nom",
      isAdminShop: s.is_admin_shop,
    }));
  });
