/**
 * File OpenAI Vision (arrière-plan) — image par image, cache, limite horaire.
 * OpenAI DIRECT uniquement (voir openai.server.ts).
 */
import { fromAi } from "./classify";
import { OpenAiError, VISION_SCHEMA, openAiJson, type SensitivityAnswer } from "./openai.server";

export async function sbAdmin(): Promise<any> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function getSettings(sb: any) {
  const { data } = await sb.from("sensitive_ai_settings").select("*").eq("id", 1).single();
  return data as {
    vision_hourly_limit: number; text_model: string; vision_model: string; vision_enabled: boolean;
    paused_reason: string | null; paused_until: string | null; lock_until: string | null;
  };
}

export async function activePrompt(sb: any, kind: "text" | "vision") {
  const { data } = await sb.from("sensitive_prompts").select("version, content").eq("kind", kind).eq("is_active", true).maybeSingle();
  if (!data) throw new Error(`Aucun prompt ${kind} actif`);
  return data as { version: number; content: string };
}

export async function logCall(sb: any, row: Record<string, unknown>) {
  await sb.from("sensitive_ai_calls").insert(row);
}

/** Ajoute les images d'un produit à la file Vision. force = relancer même si déjà analysé. */
export async function enqueueProduct(sb: any, productId: string, force = false): Promise<number> {
  const { data: imgs } = await sb.from("product_images").select("id, url, position").eq("product_id", productId).order("position");
  const list = (imgs ?? []) as Array<{ id: string; url: string; position: number }>;
  if (!list.length) return 0;
  const { data: existing } = await sb.from("sensitive_image_status").select("id, image_url, vision_status, manual_decision").eq("product_id", productId);
  const byUrl = new Map<string, any>((existing ?? []).map((r: any) => [r.image_url, r]));
  let n = 0;
  for (const [i, im] of list.entries()) {
    const ex = byUrl.get(im.url);
    if (!ex) {
      await sb.from("sensitive_image_status").insert({ product_id: productId, image_id: im.id, image_url: im.url, position: i, vision_status: "PENDING" });
      n++;
    } else if (force || (ex.vision_status === "SKIPPED" && !ex.manual_decision)) {
      await sb.from("sensitive_image_status").update({ vision_status: "PENDING", attempts: 0, next_attempt_at: null, last_error: null, position: i }).eq("id", ex.id);
      n++;
    }
  }
  return n;
}

async function sha256Hex(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64(buf: ArrayBuffer) {
  return Buffer.from(buf).toString("base64");
}

async function categoryPath(sb: any, categoryId: string | null) {
  if (!categoryId) return "";
  const { data } = await sb.from("categories").select("id, name, parent_id");
  const byId = new Map<string, any>((data ?? []).map((c: any) => [c.id, c]));
  const out: string[] = [];
  let cur = byId.get(categoryId);
  let g = 0;
  while (cur && g++ < 10) { out.unshift(cur.name); cur = cur.parent_id ? byId.get(cur.parent_id) : null; }
  return out.join(" > ");
}

/** Analyse Vision d'une image (sans écriture en base). */
export async function visionAnalyze(opts: { imageBytes: ArrayBuffer; mime: string; prompt: string; model: string; context: string }) {
  const dataUrl = `data:${opts.mime};base64,${b64(opts.imageBytes)}`;
  return openAiJson({
    model: opts.model,
    system: opts.prompt,
    user: [
      { type: "text", text: `Contexte produit (indicatif, vérifie l'image elle-même) : ${opts.context}` },
      { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
    ],
    schemaName: "image_sensitivity",
    schema: VISION_SCHEMA,
  });
}

export async function fetchImage(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Image inaccessible (${r.status})`);
  const mime = (r.headers.get("content-type") ?? "image/jpeg").split(";")[0]!;
  if (!mime.startsWith("image/")) throw new Error("Le fichier n'est pas une image");
  const buf = await r.arrayBuffer();
  if (buf.byteLength > 15 * 1024 * 1024) throw new Error("Image trop lourde");
  return { buf, mime: mime === "image/jpg" ? "image/jpeg" : mime };
}

function applyAnswer(a: SensitivityAnswer) {
  const m = fromAi(a);
  return {
    vision_decision: m.decision,
    vision_audience: m.audience,
    vision_confidence: a.confidence,
    vision_reason: String(a.reason ?? "").slice(0, 300),
    vision_concepts: (a.detected_concepts ?? []).slice(0, 8),
  };
}

export type TickResult = { processed: number; cached: number; apiCalls: number; errors: number; stopped: string | null };

/** Un passage du travailleur : borné en temps, limite horaire, verrou exclusif. */
export async function runVisionTick(budgetMs = 45_000): Promise<TickResult> {
  const sb = await sbAdmin();
  const out: TickResult = { processed: 0, cached: 0, apiCalls: 0, errors: 0, stopped: null };
  const s = await getSettings(sb);
  if (!s.vision_enabled) return { ...out, stopped: "Vision désactivée" };
  if (s.paused_reason) return { ...out, stopped: `En pause : ${s.paused_reason}` };
  if (s.paused_until && new Date(s.paused_until) > new Date()) return { ...out, stopped: "Pause temporaire (429)" };

  const now = new Date();
  const { data: lock } = await sb
    .from("sensitive_ai_settings")
    .update({ lock_until: new Date(now.getTime() + budgetMs + 10_000).toISOString() })
    .eq("id", 1)
    .or(`lock_until.is.null,lock_until.lt.${now.toISOString()}`)
    .select("id");
  if (!lock?.length) return { ...out, stopped: "Déjà en cours" };

  const start = Date.now();
  try {
    // Reprise après crash : PROCESSING bloqué > 10 min → PENDING
    await sb.from("sensitive_image_status").update({ vision_status: "PENDING" })
      .eq("vision_status", "PROCESSING").lt("updated_at", new Date(Date.now() - 600_000).toISOString());

    const prompt = await activePrompt(sb, "vision");
    const model = s.vision_model;
    const catCache = new Map<string, string>();

    while (Date.now() - start < budgetMs && out.processed < 30) {
      const { count: used } = await sb.from("sensitive_ai_calls").select("id", { count: "exact", head: true })
        .eq("kind", "vision").neq("outcome", "cached").gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
      if ((used ?? 0) >= s.vision_hourly_limit) { out.stopped = `Limite horaire atteinte (${s.vision_hourly_limit}/h)`; break; }

      const { data: rows } = await sb.from("sensitive_image_status").select("id, product_id, image_url, attempts")
        .eq("vision_status", "PENDING")
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
        .order("created_at").limit(1);
      const row = rows?.[0];
      if (!row) break;
      await sb.from("sensitive_image_status").update({ vision_status: "PROCESSING" }).eq("id", row.id);
      out.processed++;

      let hash: string;
      let img: { buf: ArrayBuffer; mime: string };
      try {
        img = await fetchImage(row.image_url);
        hash = await sha256Hex(img.buf);
      } catch (e) {
        const attempts = row.attempts + 1;
        await sb.from("sensitive_image_status").update({
          vision_status: attempts >= 3 ? "ERROR" : "PENDING", attempts,
          next_attempt_at: new Date(Date.now() + 2 ** attempts * 60_000).toISOString(),
          last_error: e instanceof Error ? e.message : "Image illisible",
        }).eq("id", row.id);
        out.errors++;
        continue;
      }

      // Cache : image identique + prompt identique + modèle identique → aucun appel
      const { data: hit } = await sb.from("sensitive_vision_cache").select("result")
        .eq("content_hash", hash).eq("prompt_version", prompt.version).eq("model", model).maybeSingle();
      if (hit) {
        await sb.from("sensitive_image_status").update({
          ...applyAnswer(hit.result), content_hash: hash, vision_status: "COMPLETED", vision_model: model,
          vision_prompt_version: prompt.version, vision_at: new Date().toISOString(), vision_cached: true, last_error: null,
        }).eq("id", row.id);
        await logCall(sb, { kind: "vision", outcome: "cached", model, product_id: row.product_id, image_status_id: row.id, prompt_version: prompt.version });
        out.cached++;
        continue;
      }

      const { data: prod } = await sb.from("products").select("name, category_id").eq("id", row.product_id).single();
      const cid = prod?.category_id ?? "";
      if (!catCache.has(cid)) catCache.set(cid, await categoryPath(sb, cid || null));
      try {
        out.apiCalls++;
        const r = await visionAnalyze({ imageBytes: img.buf, mime: img.mime, prompt: prompt.content, model, context: `${prod?.name ?? ""} — ${catCache.get(cid) || "sans catégorie"}` });
        if (!r.json) throw new OpenAiError("Réponse OpenAI illisible", 200, "server");
        await sb.from("sensitive_vision_cache").upsert({ content_hash: hash, prompt_version: prompt.version, model, result: r.json });
        await sb.from("sensitive_image_status").update({
          ...applyAnswer(r.json), content_hash: hash, vision_status: "COMPLETED", vision_model: model,
          vision_prompt_version: prompt.version, vision_at: new Date().toISOString(), vision_cached: false, last_error: null,
        }).eq("id", row.id);
        await logCall(sb, { kind: "vision", outcome: "ok", http_status: 200, model, product_id: row.product_id, image_status_id: row.id, prompt_version: prompt.version, tokens_in: r.tokensIn, tokens_out: r.tokensOut });
      } catch (e) {
        const err = e instanceof OpenAiError ? e : new OpenAiError("Erreur OpenAI", 0, "network");
        const attempts = row.attempts + 1;
        await logCall(sb, { kind: "vision", outcome: err.kind === "rate_limit" ? "rate_limited" : "error", http_status: err.status || null, model, product_id: row.product_id, image_status_id: row.id, prompt_version: prompt.version, error: err.message.slice(0, 200) });
        const terminal = err.kind === "auth" || err.kind === "quota" || err.kind === "bad_request";
        await sb.from("sensitive_image_status").update({
          vision_status: terminal && err.kind === "bad_request" ? "ERROR" : attempts >= 5 ? "ERROR" : "PENDING",
          attempts: err.kind === "auth" || err.kind === "quota" ? row.attempts : attempts,
          next_attempt_at: new Date(Date.now() + Math.min(2 ** attempts, 60) * 60_000).toISOString(),
          last_error: err.message,
        }).eq("id", row.id);
        out.errors++;
        if (err.kind === "auth" || err.kind === "quota") {
          await sb.from("sensitive_ai_settings").update({ paused_reason: err.message }).eq("id", 1);
          out.stopped = err.message;
          break;
        }
        if (err.kind === "rate_limit") {
          // Pas de boucle : pause jusqu'au prochain passage (Retry-After ou 10 min)
          const wait = Math.max(err.retryAfterSec ?? 600, 60);
          await sb.from("sensitive_ai_settings").update({ paused_until: new Date(Date.now() + wait * 1000).toISOString() }).eq("id", 1);
          out.stopped = "429 : pause temporaire";
          break;
        }
      }
    }
  } finally {
    await sb.from("sensitive_ai_settings").update({ lock_until: null }).eq("id", 1);
  }
  return out;
}
