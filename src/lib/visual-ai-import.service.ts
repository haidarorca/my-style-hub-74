/**
 * visual-ai-import.service.ts
 * ---------------------------
 * Moteur IA Visuel autonome pour l'import de produits.
 * Zero dependance aux liens Taobao/1688/Tmall.
 *
 * Pipeline :
 *   1. Upload media (images / videos) → Supabase Storage
 *   2. Extraction frames video (ffmpeg, scene detection)
 *   3. Analyse IA vision (Gemini 2.5 Flash) → OCR + detection + classification
 *   4. Generation brouillon produit FR
 *
 * Regles strictes :
 *   - Ne JAMAIS inventer de donnees non visibles
 *   - "prix a completer" si prix invisible
 *   - "a confirmer" si incertain
 *   - Validation admin obligatoire avant publication
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
  currency: string;
  images: string[];
  gallery: string[];
  variants: VisualVariant[];
  categoryId: string | null;
  categoryName: string | null;
  categoryConfidence: number;
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

export interface VisualVariant {
  type: "color" | "size" | "style" | "material" | "other";
  value: string;
  hex?: string;
  confidence: number;
  note?: string;
}

export interface VisualImportResult {
  success: boolean;
  draft: VisualProductDraft | null;
  logs: string[];
  errors: string[];
  mediaProcessed: number;
  framesExtracted: number;
  creditsUsed: number;
}

interface FrameExtraction {
  framePath: string;
  timestamp: number;
  isKeyFrame: boolean;
}

// ── Logger ──
function log(logs: string[], msg: string) {
  const t = new Date().toISOString().slice(11, 19);
  logs.push(`[${t}] ${msg}`);
  console.log(`[VISUAL-AI] ${msg}`);
}

// ── Consts ──
const MAX_VIDEO_FRAMES = 8;
const MAX_VIDEO_DURATION_SEC = 60;
const FRAME_SIMILARITY_THRESHOLD = 0.85;
const IA_MODEL = "google/gemini-2.5-flash";
const IA_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ── Upload media to Supabase Storage ──
export const uploadImportMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    fileBase64: z.string().min(100),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
  }).parse(input))
  .handler(async ({ data }) => {
    const logs: string[] = [];
    log(logs, `Upload ${data.fileName} (${data.mimeType})`);

    try {
      const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;

      // Clean filename
      const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `temp/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

      const binary = Buffer.from(data.fileBase64, "base64");
      log(logs, `Buffer: ${binary.length} bytes`);

      const { error } = await supabase.storage
        .from("imports")
        .upload(path, binary, { contentType: data.mimeType, upsert: false });

      if (error) {
        // Try product-images bucket if imports doesn't exist
        const { error: err2 } = await supabase.storage
          .from("product-images")
          .upload(path, binary, { contentType: data.mimeType, upsert: false });

        if (err2) {
          log(logs, `Erreur upload: ${err2.message}`);
          throw new Error(`Upload failed: ${err2.message}`);
        }

        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
        log(logs, `Uploaded to product-images: ${urlData.publicUrl.slice(0, 60)}...`);
        return { url: urlData.publicUrl, path, logs };
      }

      const { data: urlData } = supabase.storage.from("imports").getPublicUrl(path);
      log(logs, `Uploaded to imports: ${urlData.publicUrl.slice(0, 60)}...`);
      return { url: urlData.publicUrl, path, logs };

    } catch (e: any) {
      log(logs, `Erreur: ${e.message}`);
      throw e;
    }
  });

// ── Extract keyframes from video (ffmpeg) ──
export const extractVideoFrames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    videoUrl: z.string().url(),
    maxFrames: z.number().int().min(1).max(MAX_VIDEO_FRAMES).default(MAX_VIDEO_FRAMES),
  }).parse(input))
  .handler(async ({ data }) => {
    const logs: string[] = [];
    log(logs, `Extraction frames: ${data.videoUrl.slice(0, 60)}`);

    const frames: FrameExtraction[] = [];
    let tempVideoPath = "";
    let tempDir = "";

    try {
      const fs = await import("fs");
      const path = await import("path");
      const { execSync } = await import("child_process");
      const os = await import("os");

      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "visual-ai-"));
      tempVideoPath = path.join(tempDir, "input.mp4");

      // Download video
      log(logs, "Telechargement video...");
      const videoRes = await fetch(data.videoUrl, { signal: AbortSignal.timeout(30000) });
      if (!videoRes.ok) throw new Error(`HTTP ${videoRes.status}`);
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      fs.writeFileSync(tempVideoPath, videoBuffer);
      log(logs, `Video: ${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB`);

      // Get video duration
      const durationStr = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${tempVideoPath}"`,
        { encoding: "utf-8", timeout: 10000 }
      ).trim();
      const duration = parseFloat(durationStr) || 0;
      log(logs, `Duree: ${duration.toFixed(1)}s`);

      if (duration > MAX_VIDEO_DURATION_SEC) {
        log(logs, `Video trop longue, limite ${MAX_VIDEO_DURATION_SEC}s`);
      }
      const effectiveDuration = Math.min(duration, MAX_VIDEO_DURATION_SEC);

      // Scene detection + frame extraction
      log(logs, "Detection scenes + extraction frames...");
      const sceneFile = path.join(tempDir, "scenes.txt");

      try {
        execSync(
          `ffmpeg -i "${tempVideoPath}" -vf "select='gt(scene,0.3)',showinfo" -vsync vfr -frame_pts 1 -q:v 2 -f image2 "${tempDir}/scene_%04d.jpg" 2>&1 | tail -20`,
          { timeout: 30000 }
        );
      } catch {
        // Scene detection may fail, fallback to uniform sampling
      }

      const sceneFrames = fs.readdirSync(tempDir)
        .filter(f => f.startsWith("scene_"))
        .sort();

      log(logs, `Scenes detectees: ${sceneFrames.length}`);

      if (sceneFrames.length < 3) {
        // Fallback: uniform sampling
        log(logs, "Fallback: echantillonnage uniforme");
        const interval = effectiveDuration / (data.maxFrames + 1);
        for (let i = 1; i <= data.maxFrames; i++) {
          const ts = interval * i;
          const outPath = path.join(tempDir, `frame_${String(i).padStart(4, "0")}.jpg`);
          try {
            execSync(
              `ffmpeg -ss ${ts.toFixed(2)} -i "${tempVideoPath}" -vf "scale=720:-1" -vframes 1 -q:v 2 "${outPath}"`,
              { timeout: 15000 }
            );
            if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
              frames.push({ framePath: outPath, timestamp: ts, isKeyFrame: false });
            }
          } catch { /* skip bad frames */ }
        }
      } else {
        // Use scene detection frames, limit to maxFrames
        const selected = sceneFrames.slice(0, data.maxFrames);
        for (let i = 0; i < selected.length; i++) {
          frames.push({
            framePath: path.join(tempDir, selected[i]),
            timestamp: (effectiveDuration / selected.length) * i,
            isKeyFrame: true,
          });
        }
      }

      log(logs, `Frames extraites: ${frames.length}`);

      // Upload frames to storage and return URLs
      const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
      const frameUrls: string[] = [];

      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const buffer = fs.readFileSync(frame.framePath);
        const uploadPath = `temp/frames/${Date.now()}_${i}.jpg`;

        let uploaded = false;
        for (const bucket of ["imports", "product-images"]) {
          const { error } = await supabase.storage.from(bucket).upload(uploadPath, buffer, {
            contentType: "image/jpeg",
            upsert: false,
          });
          if (!error) {
            const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(uploadPath);
            frameUrls.push(urlData.publicUrl);
            uploaded = true;
            break;
          }
        }
        if (!uploaded) {
          log(logs, `Frame ${i}: upload echoue`);
        }
      }

      // Cleanup
      try { fs.rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }

      log(logs, `Frames uploadées: ${frameUrls.length}`);
      return { frameUrls, frameCount: frameUrls.length, logs };

    } catch (e: any) {
      log(logs, `Erreur extraction: ${e.message}`);
      // Cleanup
      if (tempDir) {
        try { (await import("fs")).rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
      }
      throw e;
    }
  });

// ── Core: Analyze images with AI Vision ──
export const analyzeVisualMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    imageUrls: z.array(z.string().url()).max(20).default([]),
    videoFrameUrls: z.array(z.string().url()).max(MAX_VIDEO_FRAMES).default([]),
  }).parse(input))
  .handler(async ({ data }): Promise<VisualImportResult> => {
    const logs: string[] = [];
    const errors: string[] = [];

    log(logs, "=== Analyse IA Visuelle ===");
    log(logs, `Images: ${data.imageUrls.length} | Frames video: ${data.videoFrameUrls.length}`);

    const allImageUrls = [...data.imageUrls, ...data.videoFrameUrls];
    if (allImageUrls.length === 0) {
      errors.push("Aucun media a analyser");
      return { success: false, draft: null, logs, errors, mediaProcessed: 0, framesExtracted: 0, creditsUsed: 0 };
    }

    // Load categories from DB for matching
    log(logs, "Chargement categories...");
    const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { data: cats } = await supabase
      .from("categories")
      .select("id, name")
      .eq("level", 3)
      .limit(200);
    const catNames = (cats || []).map(c => c.name).join(", ");
    log(logs, `${(cats || []).length} categories chargees`);

    // Build AI prompt
    const systemPrompt = `Tu es un expert en analyse visuelle de produits e-commerce. Analyse les images fournies et extrais UNIQUEMENT ce qui est visible. Ne invente JAMAIS de donnees.

REGLES STRICTES:
- Si le prix n'est PAS visible dans les images → "price": null, "priceNote": "prix a completer"
- Si une variante est incertaine → ajoute-la avec "confidence": 30 et "note": "a confirmer"
- Ne cree PAS de categories qui n'existent pas dans la liste fournie
- N'invente PAS de marque si le logo n'est pas lisible
- N'invente PAS de materiau si tu n'es pas sur
- Decris UNIQUEMENT ce qui est visible

Reponds en JSON strict (pas de markdown):
{
  "name": "Nom produit en francais, 60 caracteres max",
  "designation": "Designation courte 80c max",
  "description": "Description marketing basee sur le visible, 300c max",
  "price": null ou nombre si prix visible,
  "priceNote": "prix a completer" ou "prix detecte: X",
  "currency": "CNY",
  "colors": ["couleur1", "couleur2"],
  "materials": ["materiau1"],
  "detectedBrand": "marque si visible sur l'image, sinon null",
  "detectedText": ["texte visible 1", "texte visible 2"],
  "variants": [
    {"type": "color", "value": "Rouge", "hex": "#FF0000", "confidence": 90, "note": ""},
    {"type": "size", "value": "M", "confidence": 60, "note": "a confirmer"}
  ],
  "tags": ["tag1", "tag2"],
  "features": ["feature1", "feature2"],
  "categorySuggestion": "categorie exacte parmi la liste",
  "productType": "type de produit detecte",
  "packaging": "description packaging si visible",
  "style": "style detecte",
  "accessories": ["accessoire1"],
  "confidence": 75,
  "uncertainties": ["liste des choses incertaines"]
}

Categories disponibles: ${catNames || "Non disponible"}`;

    // Build messages with images
    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add images (up to 10 for cost efficiency)
    const selectedUrls = allImageUrls.slice(0, 10);
    const contentParts: any[] = [
      { type: "text", text: "Analyse ces images de produit et extrais toutes les informations visibles. Ne reponds qu'en JSON strict." },
    ];

    for (const url of selectedUrls) {
      contentParts.push({
        type: "image_url",
        image_url: { url, detail: "high" },
      });
    }

    messages.push({ role: "user", content: contentParts });

    log(logs, `Envoi IA: ${selectedUrls.length} images`);

    // Call AI
    let aiResult: any = null;
    try {
      const apiKey = process.env.LOVABLE_API_KEY || "";
      if (!apiKey) throw new Error("LOVABLE_API_KEY non configuree");

      const res = await fetch(IA_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: IA_MODEL,
          messages,
          max_tokens: 4096,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`IA HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      const json = await res.json();
      const raw = json.choices?.[0]?.message?.content?.trim() || "";

      // Parse JSON
      try {
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
        aiResult = JSON.parse(cleaned);
      } catch {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) aiResult = JSON.parse(m[0]);
        else throw new Error("IA n'a pas retourne de JSON valide");
      }

      log(logs, `IA: nom="${aiResult?.name?.slice(0, 40)}" confiance=${aiResult?.confidence}`);

    } catch (e: any) {
      log(logs, `Erreur IA: ${e.message}`);
      errors.push(`Analyse IA: ${e.message}`);
      return { success: false, draft: null, logs, errors, mediaProcessed: allImageUrls.length, framesExtracted: data.videoFrameUrls.length, creditsUsed: 1 };
    }

    // Match category
    let categoryId: string | null = null;
    let categoryName: string | null = null;
    let categoryConfidence = 0;

    if (aiResult?.categorySuggestion && cats) {
      const suggestion = String(aiResult.categorySuggestion).toLowerCase();
      const match = cats.find(c =>
        c.name.toLowerCase().includes(suggestion.slice(0, 20)) ||
        suggestion.includes(c.name.toLowerCase().slice(0, 15))
      );
      if (match) {
        categoryId = match.id;
        categoryName = match.name;
        categoryConfidence = 85;
      } else {
        // Try fuzzy match
        const words = suggestion.split(/\s+/);
        for (const word of words) {
          if (word.length < 3) continue;
          const fuzzy = cats.find(c => c.name.toLowerCase().includes(word));
          if (fuzzy) {
            categoryId = fuzzy.id;
            categoryName = fuzzy.name;
            categoryConfidence = 50;
            break;
          }
        }
      }
    }

    // Build variants
    const variants: VisualVariant[] = [];
    if (Array.isArray(aiResult?.variants)) {
      for (const v of aiResult.variants) {
        variants.push({
          type: ["color", "size", "style", "material", "other"].includes(v.type) ? v.type : "other",
          value: String(v.value || "").slice(0, 60),
          hex: /^#[0-9a-fA-F]{6}$/.test(v.hex) ? v.hex : undefined,
          confidence: Math.min(100, Math.max(0, Number(v.confidence) || 50)),
          note: v.note || (Number(v.confidence) < 60 ? "a confirmer" : undefined),
        });
      }
    }

    // Build draft
    const uncertainties: string[] = Array.isArray(aiResult?.uncertainties)
      ? aiResult.uncertainties
      : [];

    // Auto-add uncertainties for low confidence items
    for (const v of variants) {
      if (v.confidence < 50) uncertainties.push(`Variante "${v.value}" incertaine (${v.confidence}%)`);
    }
    if (!aiResult?.price && !aiResult?.priceNote?.includes("detecte")) {
      uncertainties.push("Prix non visible - a completer");
    }
    if (categoryConfidence < 60) {
      uncertainties.push(`Categorie suggeree: "${categoryName || aiResult?.categorySuggestion}" - a verifier`);
    }

    const draft: VisualProductDraft = {
      id: `visual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: String(aiResult?.name || "Produit detecte").slice(0, 100),
      designation: String(aiResult?.designation || aiResult?.name || "").slice(0, 120),
      description: String(aiResult?.description || "").slice(0, 2000),
      price: aiResult?.price && Number(aiResult.price) > 0 ? Number(aiResult.price) : null,
      priceNote: aiResult?.priceNote || (aiResult?.price ? `prix detecte: ${aiResult.price}` : "prix a completer"),
      currency: "CNY",
      images: data.imageUrls.slice(0, 5),
      gallery: allImageUrls,
      variants,
      categoryId,
      categoryName,
      categoryConfidence,
      tags: Array.isArray(aiResult?.tags) ? aiResult.tags.map((t: any) => String(t).slice(0, 30)) : [],
      features: Array.isArray(aiResult?.features) ? aiResult.features.map((f: any) => String(f).slice(0, 100)) : [],
      materials: Array.isArray(aiResult?.materials) ? aiResult.materials.map((m: any) => String(m).slice(0, 40)) : [],
      colors: Array.isArray(aiResult?.colors) ? aiResult.colors.map((c: any) => String(c).slice(0, 30)) : [],
      detectedBrand: aiResult?.detectedBrand || null,
      detectedText: Array.isArray(aiResult?.detectedText) ? aiResult.detectedText.map((t: any) => String(t).slice(0, 100)) : [],
      confidence: Math.min(95, Math.max(10, Number(aiResult?.confidence) || 50)),
      uncertainties: [...new Set(uncertainties)],
      sourceMedia: allImageUrls,
      status: "draft",
      createdAt: Date.now(),
    };

    log(logs, `=== Brouillon cree: "${draft.name}" (${draft.confidence}%) ===`);
    log(logs, `Incertitudes: ${draft.uncertainties.length}`);

    return {
      success: true,
      draft,
      logs,
      errors,
      mediaProcessed: allImageUrls.length,
      framesExtracted: data.videoFrameUrls.length,
      creditsUsed: 1,
    };
  });

// ── Check duplicate by visual similarity (name + brand + category) ──
export const checkVisualDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    name: z.string(),
    brand: z.string().nullable(),
    categoryId: z.string().nullable(),
  }).parse(input))
  .handler(async ({ data }) => {
    const supabase = (await import("@/integrations/supabase/client.server")).supabaseAdmin;

    // Check by name similarity
    const { data: nameMatches } = await supabase
      .from("products")
      .select("id, name, category_id")
      .ilike("name", `%${data.name.slice(0, 20)}%`)
      .limit(5);

    // Check in existing drafts
    const { data: draftMatches } = await supabase
      .from("import_products")
      .select("id, name")
      .ilike("name", `%${data.name.slice(0, 20)}%`)
      .limit(5);

    const matches = [
      ...(nameMatches || []).map(m => ({ id: m.id, name: m.name, type: "produit" as const })),
      ...(draftMatches || []).map(m => ({ id: m.id, name: m.name, type: "brouillon" as const })),
    ];

    return {
      isDuplicate: matches.length > 0,
      matches: matches.slice(0, 5),
    };
  });
