/**
 * visual-ai-import.service.ts
 * ---------------------------
 * Moteur IA Visuel + Edition complete + Publication boutique admin.
 *
 * - Upload media (images/videos)
 * - Extraction frames video (ffmpeg)
 * - Analyse IA vision (OCR + detection + classification)
 * - Scoring intelligent categories EXISTANTES uniquement
 * - Publication vers boutique admin automatique
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── Types ──
export interface VisualDraft {
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

export interface CategoryMatch {
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
const IA_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

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

// ── Extract video frames ──
export const extractVideoFrames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    videoUrl: z.string().url(), maxFrames: z.number().int().min(1).max(MAX_VIDEO_FRAMES).default(MAX_VIDEO_FRAMES),
  }).parse(input))
  .handler(async ({ data }) => {
    const fs = await import("fs");
    const path = await import("path");
    const { execSync } = await import("child_process");
    const os = await import("os");
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vai-"));
    const videoPath = path.join(tempDir, "v.mp4");
    try {
      const res = await fetch(data.videoUrl, { signal: AbortSignal.timeout(30000) });
      fs.writeFileSync(videoPath, Buffer.from(await res.arrayBuffer()));
      const dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`, { encoding: "utf-8", timeout: 10000 }).trim()) || 60;
      try { execSync(`ffmpeg -i "${videoPath}" -vf "select='gt(scene,0.3)'" -vsync vfr -q:v 2 "${tempDir}/s_%04d.jpg" 2>/dev/null`, { timeout: 30000 }); } catch { /* ignore */ }
      const scenes = fs.readdirSync(tempDir).filter(f => f.startsWith("s_")).sort();
      const frames: string[] = [];
      if (scenes.length < 3) {
        const interval = Math.min(dur, 60) / (data.maxFrames + 1);
        for (let i = 1; i <= data.maxFrames; i++) {
          const out = path.join(tempDir, `f_${i}.jpg`);
          try { execSync(`ffmpeg -ss ${(interval * i).toFixed(1)} -i "${videoPath}" -vf "scale=720:-1" -vframes 1 -q:v 2 "${out}"`, { timeout: 10000 }); if (fs.existsSync(out) && fs.statSync(out).size > 1000) frames.push(out); } catch { }
        }
      } else { for (const s of scenes.slice(0, data.maxFrames)) frames.push(path.join(tempDir, s)); }
      const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
      const urls: string[] = [];
      for (let i = 0; i < frames.length; i++) {
        const buf = fs.readFileSync(frames[i]);
        const up = `temp/f/${Date.now()}_${i}.jpg`;
        for (const b of ["imports", "product-images"]) {
          const { error } = await supabase.storage.from(b).upload(up, buf, { contentType: "image/jpeg", upsert: false });
          if (!error) { const { data: u } = supabase.storage.from(b).getPublicUrl(up); urls.push(u.publicUrl); break; }
        }
      }
      return { frameUrls: urls, frameCount: urls.length };
    } finally { try { fs.rmSync(tempDir, { recursive: true }); } catch { } }
  });

// ── AI Vision Analysis ──
export const analyzeVisualMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    imageUrls: z.array(z.string().url()).max(20).default([]),
    videoFrameUrls: z.array(z.string().url()).max(MAX_VIDEO_FRAMES).default([]),
  }).parse(input))
  .handler(async ({ data }) => {
    const logs: string[] = [];
    log(logs, "=== Analyse IA Visuelle ===");
    const allUrls = [...data.imageUrls, ...data.videoFrameUrls];
    if (allUrls.length === 0) return { success: false, draft: null, logs, errors: ["Aucun media"], mediaProcessed: 0, framesExtracted: 0 };

    const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { data: allCats } = await supabase.from("categories").select("id, name, level, parent_id, name_i18n").order("position");
    const cats = (allCats || []) as CatRow[];
    log(logs, `${cats.length} categories chargees`);

    const catNamesL3 = cats.filter(c => c.level === 3).map(c => {
      const l2 = cats.find(p => p.id === c.parent_id && p.level === 2);
      const l1 = l2 ? cats.find(p => p.id === l2.parent_id && p.level === 1) : null;
      return `${l1?.name || ""}>${l2?.name || ""}>${c.name}`;
    }).slice(0, 50).join("\n");

    const prompt = `Tu es un expert analyse visuelle produits e-commerce. Analyse les images et extrais UNIQUEMENT ce qui est visible.
REGLES:
- Prix non visible → "price": null
- Variante incertaine → confidence < 50
- Ne cree pas de categories

Reponds JSON strict:
{"name":"nom FR 60c","designation":"80c","description":"300c","price":null,"colors":[""],"materials":[""],"detectedBrand":null,"detectedText":[""],"variants":[{"type":"color|size|style","value":"","hex":"#000000","confidence":80}],"tags":[""],"features":[""],"categoryHint":"","productType":"","confidence":70,"uncertainties":[""]}

Categories existantes:\n${catNamesL3}`;

    const selected = allUrls.slice(0, 10);
    const contentParts: any[] = [{ type: "text", text: "Analyse ces images de produit. JSON strict uniquement." }];
    for (const url of selected) contentParts.push({ type: "image_url", image_url: { url, detail: "high" } });

    let aiResult: any = null;
    try {
      const apiKey = process.env.LOVABLE_API_KEY || "";
      const res = await fetch(IA_ENDPOINT, {
        method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "system", content: prompt }, { role: "user", content: contentParts }], max_tokens: 4096, temperature: 0.2 }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`IA HTTP ${res.status}`);
      const json = await res.json();
      const raw = json.choices?.[0]?.message?.content?.trim() || "";
      try { const c = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim(); aiResult = JSON.parse(c); }
      catch { const m = raw.match(/\{[\s\S]*\}/); if (m) aiResult = JSON.parse(m[0]); else throw new Error("JSON invalide"); }
      log(logs, `IA: "${aiResult?.name?.slice(0, 40)}" conf=${aiResult?.confidence}`);
    } catch (e: any) {
      log(logs, `Erreur IA: ${e.message}`);
      return { success: false, draft: null, logs, errors: [`IA: ${e.message}`], mediaProcessed: allUrls.length, framesExtracted: data.videoFrameUrls.length };
    }

    const catMatch = findBestCategory(aiResult?.name || "", aiResult?.productType || aiResult?.categoryHint || "", Array.isArray(aiResult?.tags) ? aiResult.tags : [], cats);
    if (catMatch) log(logs, `Cat: ${catMatch.l3Name} (${catMatch.score}%)`); else log(logs, "Aucune categorie proche");

    const uncertainties: string[] = Array.isArray(aiResult?.uncertainties) ? aiResult.uncertainties : [];
    if (!aiResult?.price) uncertainties.push("Prix non visible - a completer");
    if (!catMatch) uncertainties.push("Aucune categorie suffisamment proche - selectionnez manuellement");
    else if (catMatch.score < 50) uncertainties.push(`Categorie suggeree peu certaine (${catMatch.score}%)`);
    for (const v of (aiResult?.variants || [])) if (v.confidence < 50) uncertainties.push(`Variante "${v.value}" incertaine`);

    const draft: VisualDraft = {
      id: `vd-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: String(aiResult?.name || "Produit").slice(0, 100),
      designation: String(aiResult?.designation || aiResult?.name || "").slice(0, 120),
      description: String(aiResult?.description || "").slice(0, 2000),
      price: aiResult?.price && Number(aiResult.price) > 0 ? Number(aiResult.price) : null,
      priceNote: aiResult?.price && Number(aiResult.price) > 0 ? `Prix detecte: ${aiResult.price}` : "Prix a completer",
      images: data.imageUrls.slice(0, 5), gallery: allUrls,
      variants: (Array.isArray(aiResult?.variants) ? aiResult.variants : []).map((v: any) => ({
        size: v.type === "size" ? String(v.value || "").slice(0, 40) : "",
        color: v.type === "color" || v.type === "style" ? String(v.value || "").slice(0, 60) : "",
        color_hex: /^#[0-9a-fA-F]{6}$/.test(v.hex) ? v.hex : "",
        stock: 0, price_override: null,
      })).filter((v: any) => v.size || v.color),
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
      sourceMedia: allUrls, status: "draft", createdAt: Date.now(),
    };

    log(logs, `=== Draft: "${draft.name}" | Cat: ${catMatch?.l3Name || "?"} | Conf: ${draft.confidence}% ===`);
    return { success: true, draft, logs, errors: [], mediaProcessed: allUrls.length, framesExtracted: data.videoFrameUrls.length };
  });

// ── Get admin shop (auto-detect) ──
export const getAdminShop = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    // Try to find admin shop by is_admin_shop flag
    let { data: adminShop } = await supabase
      .from("profiles")
      .select("id, shop_name, full_name")
      .eq("is_admin_shop", true)
      .maybeSingle();
    if (!adminShop) {
      // Fallback: first admin user
      const { data: admin } = await supabase.from("profiles").select("id, shop_name, full_name").eq("role", "admin").limit(1).single();
      adminShop = admin;
    }
    if (!adminShop) throw new Error("Aucune boutique admin trouvee");
    return { id: adminShop.id, name: adminShop.shop_name || adminShop.full_name || "Admin" };
  });

// ── Publish draft to admin shop (IDENTICAL to admin product form) ──
export const publishDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
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
      })),
    }),
  }).parse(input))
  .handler(async ({ data }) => {
    const logs: string[] = [];
    log(logs, "=== Publication draft ===");

    const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;

    // 1. Get admin shop
    let adminShop: any;
    try {
      const { data: s } = await supabase.from("profiles").select("id, shop_name").eq("is_admin_shop", true).maybeSingle();
      if (s) adminShop = s;
      else {
        const { data: a } = await supabase.from("profiles").select("id, shop_name").eq("role", "admin").limit(1).single();
        adminShop = a;
      }
    } catch { throw new Error("Boutique admin introuvable"); }
    if (!adminShop) throw new Error("Boutique admin introuvable");
    const shopId = adminShop.id;
    log(logs, `Boutique: ${adminShop.shop_name || shopId}`);

    // 2. Generate unique code
    const ts = Date.now().toString(36).toUpperCase();
    let code = `VIS-${ts}`;
    for (let i = 0; i < 10; i++) {
      const { data: dup } = await supabase.from("products").select("id").eq("vendor_id", shopId).eq("code", code).maybeSingle();
      if (!dup) break;
      code = `VIS-${ts}-${i}`;
    }
    log(logs, `Code: ${code}`);

    // 3. TRANSACTION
    let productId: string | null = null;
    const uploadedPaths: string[] = [];

    try {
      // Insert product (IDENTICAL to admin form)
      log(logs, "Insertion produit...");
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
      log(logs, `Produit: ${productId}`);

      // Upload images + insert product_images
      if (data.draft.images.length > 0) {
        log(logs, `Upload ${data.draft.images.length} images...`);
        const imgRows: Array<{ product_id: string; url: string; position: number }> = [];
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
          } catch (e: any) { log(logs, `Img ${i}: ${e.message}`); }
        }
        if (imgRows.length > 0) {
          const { error: iErr } = await supabase.from("product_images").insert(imgRows);
          if (iErr) throw iErr;
          log(logs, `${imgRows.length} images OK`);
        }
      }

      // Insert variants (IDENTICAL structure)
      if (data.draft.variants.length > 0) {
        log(logs, `${data.draft.variants.length} variantes...`);
        const vRows = data.draft.variants.map(v => ({
          product_id: productId!, size: v.size.trim() || null, color: v.color.trim() || null,
          color_hex: v.color_hex || null, stock: v.stock || 0, price_override: v.price_override, image_url: null,
        }));
        const { error: vErr } = await supabase.from("product_variants").insert(vRows);
        if (vErr) throw vErr;
        log(logs, "Variantes OK");
      }

      // Auto-translate
      const { autoTranslateProduct } = await import("@/lib/auto-translate");
      void autoTranslateProduct({ productId, name: data.draft.name.trim(), designation: data.draft.designation?.trim() || null, description: data.draft.description?.trim() || null });

      log(logs, "=== PUBLIE ===");
      return { success: true, productId, code, logs };

    } catch (e: any) {
      log(logs, `ERREUR: ${e.message}`);
      if (productId) {
        await supabase.from("product_variants").delete().eq("product_id", productId);
        await supabase.from("product_images").delete().eq("product_id", productId);
        await supabase.from("products").delete().eq("id", productId);
      }
      if (uploadedPaths.length > 0) await supabase.storage.from("product-images").remove(uploadedPaths);
      throw new Error(e.message || "Publication echouee");
    }
  });
