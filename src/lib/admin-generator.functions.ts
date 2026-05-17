import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Accès refusé : admin requis");
}

// ───────────────────────────────────────────────────────────
// 1) FX rates (cached in admin_stats_cache 12h, source open.er-api.com)
// ───────────────────────────────────────────────────────────

type RatePayload = { base: string; rates: Record<string, number>; fetched_at: string };

async function fetchRates(base: string): Promise<RatePayload> {
  const cacheKey = `fx_rates_${base.toUpperCase()}`;
  const { data: cached } = await supabaseAdmin
    .from("admin_stats_cache")
    .select("value, updated_at")
    .eq("key", cacheKey)
    .maybeSingle();
  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs < 12 * 60 * 60 * 1000) {
      return cached.value as unknown as RatePayload;
    }
  }
  const res = await fetch(`https://open.er-api.com/v6/latest/${base.toUpperCase()}`);
  if (!res.ok) throw new Error(`Erreur API devises (${res.status})`);
  const json = (await res.json()) as { result?: string; base_code?: string; rates?: Record<string, number> };
  if (json.result !== "success" || !json.rates) throw new Error("Réponse devises invalide");
  const payload: RatePayload = { base: json.base_code ?? base, rates: json.rates, fetched_at: new Date().toISOString() };
  await supabaseAdmin
    .from("admin_stats_cache")
    .upsert({ key: cacheKey, value: payload as never, updated_at: new Date().toISOString() });
  return payload;
}

export const getExchangeRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ from: z.string().length(3), to: z.string().length(3) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.from.toUpperCase() === data.to.toUpperCase()) {
      return { rate: 1, fetched_at: new Date().toISOString(), base: data.from.toUpperCase() };
    }
    const payload = await fetchRates(data.from);
    const rate = payload.rates[data.to.toUpperCase()];
    if (!rate) throw new Error(`Taux ${data.from}→${data.to} indisponible`);
    return { rate, fetched_at: payload.fetched_at, base: payload.base };
  });

// ───────────────────────────────────────────────────────────
// 2) AI analysis of pasted product text
// ───────────────────────────────────────────────────────────

function safeParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
    }
    return null;
  }
}

const AnalyzeSchema = z.object({
  raw_text: z.string().min(5).max(20000),
  source_currency: z.enum(["CNY", "USD", "EUR", "XOF"]),
});

export const analyzeSourceProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyzeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway non configuré");

    // Load category names for guidance
    const { data: cats } = await supabaseAdmin
      .from("categories")
      .select("id, name, level")
      .eq("level", 3)
      .order("position")
      .limit(200);
    const catNames = (cats ?? []).map((c) => c.name).slice(0, 120).join(", ");

    const prompt = [
      "You analyse a product listing (often copy-pasted from Taobao/1688/AliExpress, may contain Chinese/English/mixed text and image URLs).",
      "Extract a clean French e-commerce product. Translate any Chinese/English to natural French.",
      "Rules:",
      "- name_fr: short product title in French (max 80 chars)",
      "- description_fr: clean paragraph in French (max 500 chars), no marketing fluff",
      `- source_price: extract the unit price as a number in ${data.source_currency} (no currency symbol). If multiple prices, pick the most plausible retail unit price.`,
      "- image_urls: array of image URLs found in the text (http/https only, deduplicated)",
      `- suggested_category: pick the BEST match from this list (return the exact string), or null if none fits: ${catNames}`,
      "- suggested_variants: array of {size, color, color_hex, stock, image_url} extracted from the text. Conventions: size = clothing/shoe size or dimension as a short string (e.g. 'S', 'M', 'L', '42', '10x15cm') or empty string if none. color = French color name (e.g. 'Rouge', 'Bleu marine') or empty string. color_hex = matching 6-digit hex like '#1e3a8a' or empty string. stock = integer estimate or 0 if unknown. image_url = http(s) image URL for this variant from the text or empty string. Deduplicate. Return [] if no variants are explicit.",
      'Return ONLY strict JSON: {"name_fr":"","description_fr":"","source_price":0,"image_urls":[],"suggested_category":null,"suggested_variants":[{"size":"","color":"","color_hex":"","stock":0,"image_url":""}]}',
      "",
      "Input:",
      data.raw_text,
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("Limite IA atteinte, réessayez dans un instant.");
      if (res.status === 402) throw new Error("Crédits IA épuisés. Ajoutez du crédit dans les paramètres Lovable AI.");
      throw new Error(`Erreur IA (${res.status})`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = safeParseJson(raw);
    if (!parsed) throw new Error("Réponse IA illisible");

    let suggestedCategoryId: string | null = null;
    if (typeof parsed.suggested_category === "string" && parsed.suggested_category.trim()) {
      const match = (cats ?? []).find(
        (c) => c.name.toLowerCase() === (parsed.suggested_category as string).toLowerCase().trim(),
      );
      suggestedCategoryId = match?.id ?? null;
    }

    const rawVariants = Array.isArray(parsed.suggested_variants) ? (parsed.suggested_variants as unknown[]) : [];
    const cleanVariants = rawVariants
      .map((v) => {
        if (!v || typeof v !== "object") return null;
        const o = v as Record<string, unknown>;
        const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
        const num = (k: string) => {
          const n = typeof o[k] === "number" ? (o[k] as number) : Number(o[k]);
          return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
        };
        const hex = str("color_hex");
        const url = str("image_url");
        return {
          size: str("size").slice(0, 40),
          color: str("color").slice(0, 60),
          color_hex: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "",
          stock: num("stock"),
          image_url: /^https?:\/\//.test(url) ? url : "",
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null && (v.size !== "" || v.color !== ""))
      .slice(0, 30);

    return {
      name_fr: typeof parsed.name_fr === "string" ? parsed.name_fr.trim() : "",
      description_fr: typeof parsed.description_fr === "string" ? parsed.description_fr.trim() : "",
      source_price: typeof parsed.source_price === "number" ? parsed.source_price : Number(parsed.source_price) || 0,
      image_urls: Array.isArray(parsed.image_urls)
        ? (parsed.image_urls as unknown[]).filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
        : [],
      suggested_category_id: suggestedCategoryId,
      suggested_category_name: typeof parsed.suggested_category === "string" ? parsed.suggested_category : null,
      suggested_variants: cleanVariants,
    };
  });

// ───────────────────────────────────────────────────────────
// 3) Publish generated product into an admin shop
// ───────────────────────────────────────────────────────────

const VariantSchema = z.object({
  size: z.string().trim().max(40).optional().default(""),
  color: z.string().trim().max(60).optional().default(""),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")).default(""),
  stock: z.number().int().min(0).max(1_000_000).default(0),
  price_override: z.number().min(0).max(50_000_000).nullable().optional(),
  image_url: z.string().url().optional().or(z.literal("")).default(""),
});

const PublishSchema = z.object({
  shop_id: z.string().uuid(),
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  price_xof: z.number().min(0).max(50_000_000),
  category_id: z.string().uuid().nullable(),
  image_urls: z.array(z.string().url()).min(1).max(10),
  variants: z.array(VariantSchema).max(50).default([]),
});

export const publishGeneratedProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PublishSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Verify shop exists and is admin shop
    const { data: shop, error: sErr } = await supabaseAdmin
      .from("profiles")
      .select("id, is_admin_shop")
      .eq("id", data.shop_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!shop || !(shop as { is_admin_shop: boolean }).is_admin_shop) {
      throw new Error("Boutique admin introuvable");
    }

    // Insert product (auto-approved since admin)
    const { data: prod, error: pErr } = await supabaseAdmin
      .from("products")
      .insert({
        vendor_id: data.shop_id,
        name: data.name,
        code: data.code,
        description: data.description ?? null,
        price: data.price_xof,
        category_id: data.category_id,
        status: "approved",
      })
      .select("id")
      .single();
    if (pErr) {
      if (pErr.message.includes("unique") || pErr.message.includes("duplicate")) {
        throw new Error("Ce code produit existe déjà dans cette boutique.");
      }
      throw new Error(pErr.message);
    }
    const productId = prod.id as string;

    const imageRows = data.image_urls.map((url, i) => ({ product_id: productId, url, position: i }));
    const { error: iErr } = await supabaseAdmin.from("product_images").insert(imageRows);
    if (iErr) throw new Error(`Images : ${iErr.message}`);

    if (data.variants.length > 0) {
      const variantRows = data.variants.map((v) => ({
        product_id: productId,
        size: v.size?.trim() || null,
        color: v.color?.trim() || null,
        color_hex: v.color_hex && v.color_hex.length > 0 ? v.color_hex : null,
        stock: v.stock ?? 0,
        price_override: v.price_override ?? null,
        image_url: v.image_url && v.image_url.length > 0 ? v.image_url : null,
      }));
      const { error: vErr } = await supabaseAdmin.from("product_variants").insert(variantRows);
      if (vErr) throw new Error(`Variantes : ${vErr.message}`);
    }

    return { id: productId };
  });
