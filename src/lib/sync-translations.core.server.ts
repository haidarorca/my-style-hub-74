import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ============================================================
// Translation sync core. Hash-based: only processes rows whose
// content has changed since last successful translation.
// ============================================================

export type Report = {
  products: { translated: number; skipped: number; errors: number };
  categories: { translated: number; skipped: number; errors: number };
  countries: { translated: number; skipped: number; errors: number };
  shops: { translated: number; skipped: number; errors: number };
  durationMs: number;
};

const LANGS = ["fr", "en", "ar"] as const;
type Lang = (typeof LANGS)[number];

const MAX_PER_TABLE = 60;

async function callGateway(prompt: string, apiKey: string): Promise<string | null> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? null;
}

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function parseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const cleaned = stripFences(raw);
  try { return JSON.parse(cleaned) as Record<string, unknown>; } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; } }
    return null;
  }
}

async function translateShort(canonical: string, sources: Partial<Record<Lang, string>>, targets: Lang[], apiKey: string) {
  const out: Partial<Record<Lang, string>> = {};
  if (targets.length === 0) return out;
  const prompt = [
    "Translate this short e-commerce label.",
    "Auto-detect source language (French, English, Arabic).",
    "Keep brand/numbers exact. 1-4 words. No quotes. For Arabic, output MSA.",
    `Return ONLY strict JSON with these exact keys: ${JSON.stringify(targets)}`,
    "Known inputs:", JSON.stringify({ canonical, ...sources }),
  ].join("\n");
  const raw = await callGateway(prompt, apiKey);
  if (!raw) return out;
  const parsed = parseJson(raw);
  if (!parsed) return out;
  for (const l of targets) {
    const v = parsed[l];
    if (typeof v === "string" && v.trim().length > 0) out[l] = v.trim();
  }
  return out;
}

async function translateLong(canonical: string, sources: Partial<Record<Lang, string>>, targets: Lang[], apiKey: string) {
  const out: Partial<Record<Lang, string>> = {};
  if (targets.length === 0) return out;
  const prompt = [
    "Translate this e-commerce description.",
    "Auto-detect source (French, English, Arabic). Preserve line breaks, brands, numbers.",
    "For Arabic, output MSA.",
    `Return ONLY strict JSON with these exact keys: ${JSON.stringify(targets)}`,
    "Known inputs:", JSON.stringify({ canonical, ...sources }),
  ].join("\n");
  const raw = await callGateway(prompt, apiKey);
  if (!raw) return out;
  const parsed = parseJson(raw);
  if (!parsed) return out;
  for (const l of targets) {
    const v = parsed[l];
    if (typeof v === "string" && v.trim().length > 0) out[l] = v.trim();
  }
  return out;
}

type ProductTrio = Record<Lang, { name?: string; designation?: string; description?: string }>;

async function translateProduct(
  canonical: { name: string; designation: string; description: string },
  apiKey: string,
): Promise<ProductTrio> {
  const empty = { fr: {}, en: {}, ar: {} } as ProductTrio;
  const prompt = [
    "You translate e-commerce product copy. Auto-detect source (French, English, Arabic).",
    "Keep brands/codes/prices/numbers EXACTLY. Titles short, descriptions natural.",
    "For Arabic, output MSA. Empty input → empty string output.",
    `Return ONLY strict JSON with top-level keys: ${JSON.stringify(LANGS)}`,
    'Each value: {"name":"","designation":"","description":""}',
    "Canonical:", JSON.stringify(canonical),
  ].join("\n");
  const raw = await callGateway(prompt, apiKey);
  if (!raw) return empty;
  const parsed = parseJson(raw);
  if (!parsed) return empty;
  const result = { fr: {}, en: {}, ar: {} } as ProductTrio;
  for (const l of LANGS) {
    const node = parsed[l];
    if (!node || typeof node !== "object") continue;
    const n = node as Record<string, unknown>;
    for (const k of ["name", "designation", "description"] as const) {
      const v = n[k];
      if (typeof v === "string" && v.trim().length > 0) result[l][k] = v.trim();
    }
  }
  return result;
}

/**
 * Run translation sync. Uses content_hash/translated_hash to skip
 * rows that haven't changed. After successful translation, stores
 * translated_hash = content_hash so the next run skips it.
 */
export async function runTranslationSync(): Promise<Report> {
  const start = Date.now();
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Lovable AI Gateway non configuré");

  const report: Report = {
    products: { translated: 0, skipped: 0, errors: 0 },
    categories: { translated: 0, skipped: 0, errors: 0 },
    countries: { translated: 0, skipped: 0, errors: 0 },
    shops: { translated: 0, skipped: 0, errors: 0 },
    durationMs: 0,
  };

  // ---------- PRODUCTS — only rows where content changed ----------
  const { data: products } = await supabaseAdmin
    .from("products")
    .select("id, name, designation, description, name_i18n, designation_i18n, description_i18n, content_hash, translated_hash")
    .or("translated_hash.is.null,translated_hash.neq.content_hash")
    .order("updated_at", { ascending: false })
    .limit(MAX_PER_TABLE);

  for (const p of products ?? []) {
    try {
      const row = p as {
        id: string; name: string; designation: string | null; description: string | null;
        name_i18n: Record<string, string> | null; designation_i18n: Record<string, string> | null; description_i18n: Record<string, string> | null;
        content_hash: string;
      };
      const nameI18n: Record<string, string> = { ...(row.name_i18n ?? {}) };
      const desigI18n: Record<string, string> = { ...(row.designation_i18n ?? {}) };
      const descI18n: Record<string, string> = { ...(row.description_i18n ?? {}) };

      const res = await translateProduct(
        { name: row.name ?? "", designation: row.designation ?? "", description: row.description ?? "" },
        apiKey,
      );
      for (const l of LANGS) {
        if (res[l].name) nameI18n[l] = res[l].name!;
        if (res[l].designation !== undefined) desigI18n[l] = res[l].designation ?? "";
        if (res[l].description !== undefined) descI18n[l] = res[l].description ?? "";
      }

      const { error } = await supabaseAdmin
        .from("products")
        .update({
          name_i18n: nameI18n,
          designation_i18n: desigI18n,
          description_i18n: descI18n,
          translated_hash: row.content_hash,
        })
        .eq("id", row.id);
      if (error) report.products.errors++;
      else report.products.translated++;
    } catch {
      report.products.errors++;
    }
  }

  // ---------- CATEGORIES ----------
  const { data: cats } = await supabaseAdmin
    .from("categories")
    .select("id, name, name_i18n, content_hash, translated_hash")
    .or("translated_hash.is.null,translated_hash.neq.content_hash")
    .limit(MAX_PER_TABLE);

  for (const c of cats ?? []) {
    try {
      const row = c as { id: string; name: string; name_i18n: Record<string, string> | null; content_hash: string };
      const merged: Record<string, string> = { ...(row.name_i18n ?? {}) };
      const res = await translateShort(row.name ?? "", {}, [...LANGS], apiKey);
      for (const l of LANGS) if (res[l]) merged[l] = res[l]!;
      const { error } = await supabaseAdmin
        .from("categories")
        .update({ name_i18n: merged, translated_hash: row.content_hash })
        .eq("id", row.id);
      if (error) report.categories.errors++;
      else report.categories.translated++;
    } catch { report.categories.errors++; }
  }

  // ---------- COUNTRIES ----------
  const { data: ctys } = await supabaseAdmin
    .from("countries")
    .select("id, name, name_i18n, content_hash, translated_hash")
    .or("translated_hash.is.null,translated_hash.neq.content_hash")
    .limit(MAX_PER_TABLE);

  for (const c of ctys ?? []) {
    try {
      const row = c as { id: string; name: string; name_i18n: Record<string, string> | null; content_hash: string };
      const merged: Record<string, string> = { ...(row.name_i18n ?? {}) };
      const res = await translateShort(row.name ?? "", {}, [...LANGS], apiKey);
      for (const l of LANGS) if (res[l]) merged[l] = res[l]!;
      const { error } = await supabaseAdmin
        .from("countries")
        .update({ name_i18n: merged, translated_hash: row.content_hash })
        .eq("id", row.id);
      if (error) report.countries.errors++;
      else report.countries.translated++;
    } catch { report.countries.errors++; }
  }

  // ---------- SHOP DESCRIPTIONS (no hash column — basic missing-lang check) ----------
  const { data: shops } = await supabaseAdmin
    .from("profiles")
    .select("id, shop_description, shop_description_i18n")
    .not("shop_description", "is", null)
    .limit(MAX_PER_TABLE);

  for (const s of shops ?? []) {
    try {
      const row = s as { id: string; shop_description: string | null; shop_description_i18n: Record<string, string> | null };
      const merged: Record<string, string> = { ...(row.shop_description_i18n ?? {}) };
      const missing = LANGS.filter((l) => !merged[l] || merged[l].trim().length === 0);
      if (missing.length === 0) { report.shops.skipped++; continue; }
      const res = await translateLong(row.shop_description ?? "", {}, missing, apiKey);
      let changed = false;
      for (const l of missing) if (res[l]) { merged[l] = res[l]!; changed = true; }
      if (!changed) { report.shops.errors++; continue; }
      const { error } = await supabaseAdmin.from("profiles").update({ shop_description_i18n: merged }).eq("id", row.id);
      if (error) report.shops.errors++;
      else report.shops.translated++;
    } catch { report.shops.errors++; }
  }

  report.durationMs = Date.now() - start;
  return report;
}
