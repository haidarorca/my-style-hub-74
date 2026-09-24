/**
 * Images sensibles — contrôle administrateur image par image, prompts
 * versionnés, réglages Vision et statistiques OpenAI DIRECT.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./admin-auth.core";

const Choice = z.enum(["normal", "homme", "femme", "review", "auto"]);

async function sb(): Promise<any> {
  return (await import("./sensitive/vision.server")).sbAdmin();
}

function manualFields(choice: z.infer<typeof Choice>, userId: string) {
  if (choice === "auto") return { manual_decision: null, manual_audience: null, manual_by: null, manual_at: null };
  return {
    manual_decision: choice === "normal" ? "normal" : choice === "review" ? "review" : "sensitive",
    manual_audience: choice === "homme" || choice === "femme" ? choice : null,
    manual_by: userId,
    manual_at: new Date().toISOString(),
  };
}

async function categoryIndex(s: any) {
  const { data } = await s.from("categories").select("id, name, parent_id");
  const rows = (data ?? []) as Array<{ id: string; name: string; parent_id: string | null }>;
  const byId = new Map(rows.map((c) => [c.id, c]));
  const path = (id: string | null | undefined) => {
    const out: string[] = [];
    let cur = id ? byId.get(id) : undefined;
    let g = 0;
    while (cur && g++ < 10) { out.unshift(cur.name); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    return out.join(" > ");
  };
  const descendants = (id: string) => {
    const out = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of rows) if (c.parent_id && out.has(c.parent_id) && !out.has(c.id)) { out.add(c.id); changed = true; }
    }
    return [...out];
  };
  return { rows, path, descendants };
}

const IMG_COLS =
  "id, product_id, image_url, position, vision_status, vision_decision, vision_audience, vision_confidence, vision_reason, vision_model, vision_prompt_version, vision_at, vision_cached, attempts, last_error, manual_decision, manual_audience, manual_at, final_decision, final_audience, final_source";

export const listSensitiveImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      search: z.string().max(100).default(""),
      categoryId: z.string().uuid().nullable().default(null),
      status: z.enum(["all", "normal", "homme", "femme", "review"]).default("all"),
      source: z.enum(["all", "MANUAL", "RULE_VALIDATED", "VISION", "AI", "RULE", "NONE"]).default("all"),
      vision: z.enum(["all", "PENDING", "PROCESSING", "COMPLETED", "ERROR", "SKIPPED"]).default("all"),
      page: z.number().int().min(0).default(0),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await sb();
    const cats = await categoryIndex(s);
    let q: any = s.from("sensitive_image_status")
      .select(`${IMG_COLS}, products!inner(name, category_id)`, { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(data.page * 48, data.page * 48 + 47);
    if (data.search.trim()) q = q.ilike("products.name", `%${data.search.trim().replace(/[%_,()]/g, " ")}%`);
    if (data.categoryId) q = q.in("products.category_id", cats.descendants(data.categoryId));
    if (data.status === "homme" || data.status === "femme") q = q.eq("final_decision", "sensitive").eq("final_audience", data.status);
    else if (data.status !== "all") q = q.eq("final_decision", data.status);
    if (data.source !== "all") q = q.eq("final_source", data.source);
    if (data.vision !== "all") q = q.eq("vision_status", data.vision);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return {
      total: count ?? 0,
      items: ((rows ?? []) as any[]).map((r) => ({ ...r, productName: r.products?.name ?? "", category: cats.path(r.products?.category_id), products: undefined })),
      categories: cats.rows.map((c) => ({ id: c.id, label: cats.path(c.id) })).sort((a, b) => a.label.localeCompare(b.label)),
    };
  });

/** Fiche produit (admin) : crée au besoin une ligne par image puis renvoie tout. */
export const getProductImageClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ productId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await sb();
    const { data: imgs } = await s.from("product_images").select("id, url, position").eq("product_id", data.productId).order("position");
    const { data: existing } = await s.from("sensitive_image_status").select("image_url").eq("product_id", data.productId);
    const have = new Set((existing ?? []).map((r: any) => r.image_url));
    const missing = ((imgs ?? []) as any[]).filter((im) => !have.has(im.url));
    if (missing.length)
      await s.from("sensitive_image_status").upsert(
        missing.map((im, i) => ({ product_id: data.productId, image_id: im.id, image_url: im.url, position: im.position ?? i, vision_status: "SKIPPED" })),
        { onConflict: "product_id,image_url", ignoreDuplicates: true },
      );
    const order = new Map(((imgs ?? []) as any[]).map((im, i) => [im.url, i]));
    const [{ data: rows }, { data: prod }] = await Promise.all([
      s.from("sensitive_image_status").select(IMG_COLS).eq("product_id", data.productId),
      s.from("product_image_sensitivity").select("decision, audience, source, confidence, reason, rule_id").eq("product_id", data.productId).maybeSingle(),
    ]);
    return {
      product: prod ?? null,
      images: ((rows ?? []) as any[])
        .map((r) => ({ ...r, current: order.has(r.image_url) }))
        .sort((a, b) => (order.get(a.image_url) ?? 999) - (order.get(b.image_url) ?? 999)),
    };
  });

export const setImageManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), choice: Choice }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await sb();
    const { error } = await s.from("sensitive_image_status").update(manualFields(data.choice, context.userId)).eq("id", data.id);
    if (error) throw new Error(error.message);
    const { data: r } = await s.from("sensitive_image_status").select("final_decision, final_audience, final_source").eq("id", data.id).single();
    return r;
  });

export const requeueVision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ productId: z.string().uuid().optional(), imageId: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await sb();
    if (data.imageId) {
      await s.from("sensitive_image_status").update({ vision_status: "PENDING", attempts: 0, next_attempt_at: null, last_error: null }).eq("id", data.imageId);
      return { queued: 1 };
    }
    if (!data.productId) throw new Error("Produit ou image requis");
    const { enqueueProduct } = await import("./sensitive/vision.server");
    return { queued: await enqueueProduct(s, data.productId, true) };
  });

export const runVisionNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { runVisionTick } = await import("./sensitive/vision.server");
    return runVisionTick(40_000);
  });

export const getVisionDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const s = await sb();
    const cnt = async (table: string, f: (q: any) => any) => {
      const { count } = await f(s.from(table).select("*", { count: "exact", head: true }));
      return count ?? 0;
    };
    const img = (f: (q: any) => any) => cnt("sensitive_image_status", f);
    const calls = (f: (q: any) => any) => cnt("sensitive_ai_calls", f);
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const [settings, prompts, productsAnalyzed, imagesAnalyzed, pending, processing, errors, retries, normal, homme, femme, review,
      apiCalls, cached, callErrors, rateLimited, textCalls, lastHour] = await Promise.all([
      s.from("sensitive_ai_settings").select("vision_hourly_limit, text_model, vision_model, vision_enabled, paused_reason, paused_until").eq("id", 1).single(),
      s.from("sensitive_prompts").select("id, kind, version, content, note, is_active, created_at").order("version", { ascending: false }),
      cnt("product_image_sensitivity", (q) => q),
      img((q) => q.eq("vision_status", "COMPLETED")),
      img((q) => q.eq("vision_status", "PENDING")),
      img((q) => q.eq("vision_status", "PROCESSING")),
      img((q) => q.eq("vision_status", "ERROR")),
      img((q) => q.gt("attempts", 0)),
      img((q) => q.eq("final_decision", "normal")),
      img((q) => q.eq("final_decision", "sensitive").eq("final_audience", "homme")),
      img((q) => q.eq("final_decision", "sensitive").eq("final_audience", "femme")),
      img((q) => q.eq("final_decision", "review")),
      calls((q) => q.neq("outcome", "cached")),
      calls((q) => q.eq("outcome", "cached")),
      calls((q) => q.eq("outcome", "error")),
      calls((q) => q.eq("outcome", "rate_limited")),
      calls((q) => q.in("kind", ["text", "test_text"]).neq("outcome", "cached")),
      calls((q) => q.eq("kind", "vision").neq("outcome", "cached").gte("created_at", hourAgo)),
    ]);
    return {
      provider: "OPENAI_DIRECT" as const,
      endpoint: "https://api.openai.com/v1/chat/completions",
      keyConfigured: !!process.env.OPENAI_API_KEY,
      settings: settings.data,
      prompts: prompts.data ?? [],
      stats: { productsAnalyzed, imagesAnalyzed, pending, processing, errors, retries, normal, homme, femme, review, apiCalls, cached, callErrors, rateLimited, textCalls, lastHour },
    };
  });

export const updateVisionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      vision_hourly_limit: z.number().int().min(1).max(1000),
      text_model: z.string().regex(/^[a-z0-9.\-]+$/).max(60),
      vision_model: z.string().regex(/^[a-z0-9.\-]+$/).max(60),
      vision_enabled: z.boolean(),
      resume: z.boolean().default(false),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await sb();
    const { resume, ...rest } = data;
    await s.from("sensitive_ai_settings").update({ ...rest, ...(resume ? { paused_reason: null, paused_until: null } : {}), updated_at: new Date().toISOString() }).eq("id", 1);
    return { ok: true };
  });

export const savePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ kind: z.enum(["text", "vision"]), content: z.string().min(20).max(8000), note: z.string().max(200).default("") }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await sb();
    const { data: last } = await s.from("sensitive_prompts").select("version").eq("kind", data.kind).order("version", { ascending: false }).limit(1).maybeSingle();
    const version = (last?.version ?? 0) + 1;
    await s.from("sensitive_prompts").update({ is_active: false }).eq("kind", data.kind).eq("is_active", true);
    const { error } = await s.from("sensitive_prompts").insert({ kind: data.kind, version, content: data.content, note: data.note || null, is_active: true, created_by: context.userId });
    if (error) throw new Error(error.message);
    return { version };
  });

export const restorePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await sb();
    const { data: p } = await s.from("sensitive_prompts").select("kind, version").eq("id", data.id).single();
    if (!p) throw new Error("Version introuvable");
    await s.from("sensitive_prompts").update({ is_active: false }).eq("kind", p.kind).eq("is_active", true);
    await s.from("sensitive_prompts").update({ is_active: true }).eq("id", data.id);
    return { version: p.version };
  });

export const testTextPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ content: z.string().min(20).max(8000), name: z.string().min(1).max(300), category: z.string().max(300).default(""), description: z.string().max(2000).default("") }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await sb();
    const { askAi } = await import("./sensitive.functions");
    const r = await askAi(s, [{ id: "test", category: data.category, name: data.name, description: data.description, material: "" }], { content: data.content, version: null, kind: "test_text" });
    return r[0] ?? null;
  });

export const testVisionPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ content: z.string().min(20).max(8000), imageUrl: z.string().url(), context: z.string().max(300).default("") }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await sb();
    const { fetchImage, visionAnalyze, getSettings, logCall } = await import("./sensitive/vision.server");
    const { OpenAiError } = await import("./sensitive/openai.server");
    const st = await getSettings(s);
    const img = await fetchImage(data.imageUrl);
    try {
      const r = await visionAnalyze({ imageBytes: img.buf, mime: img.mime, prompt: data.content, model: st.vision_model, context: data.context || "(aucun)" });
      await logCall(s, { kind: "test_vision", outcome: "ok", http_status: 200, model: st.vision_model, tokens_in: r.tokensIn, tokens_out: r.tokensOut });
      return r.json;
    } catch (e) {
      await logCall(s, { kind: "test_vision", outcome: e instanceof OpenAiError && e.kind === "rate_limit" ? "rate_limited" : "error", http_status: e instanceof OpenAiError ? e.status : null, model: st.vision_model, error: (e instanceof Error ? e.message : "").slice(0, 200) });
      throw e;
    }
  });
