import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ============================================================
// Translation sync core. Hash-based for tables with hash columns
// (products, categories, countries) so unchanged rows are skipped.
// For tables without hash columns (profiles shop_*, home_banners,
// site_settings), we detect missing target languages instead.
// Scope-aware so the admin can run a partial or global sync.
// Paginated until done, with a hard per-run cap to stay safe.
// ============================================================

export type Scope =
  | "all"
  | "products"
  | "categories"
  | "countries"
  | "shops"
  | "banners"
  | "settings";

export type BucketReport = { translated: number; skipped: number; errors: number; pending: number };

export type Report = {
  scope: Scope;
  products: BucketReport;
  categories: BucketReport;
  countries: BucketReport;
  shops: BucketReport;
  banners: BucketReport;
  settings: BucketReport;
  errorSamples: string[];
  durationMs: number;
};

const LANGS = ["fr", "en", "ar"] as const;
type Lang = (typeof LANGS)[number];

const BATCH = 25;
const HARD_CAP_PER_RUN = 300; // total items processed per invocation
const MAX_ERROR_SAMPLES = 10;

function emptyBucket(): BucketReport {
  return { translated: 0, skipped: 0, errors: 0, pending: 0 };
}

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

async function translateShort(canonical: string, targets: Lang[], apiKey: string) {
  const out: Partial<Record<Lang, string>> = {};
  if (targets.length === 0 || !canonical.trim()) return out;
  const prompt = [
    "Translate this short e-commerce label.",
    "Auto-detect source language (French, English, Arabic).",
    "Keep brand/numbers exact. 1-6 words. No quotes. For Arabic, output MSA.",
    `Return ONLY strict JSON with these exact keys: ${JSON.stringify(targets)}`,
    "Input:", JSON.stringify({ canonical }),
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

async function translateLong(canonical: string, targets: Lang[], apiKey: string) {
  const out: Partial<Record<Lang, string>> = {};
  if (targets.length === 0 || !canonical.trim()) return out;
  const prompt = [
    "Translate this e-commerce description.",
    "Auto-detect source (French, English, Arabic). Preserve line breaks, brands, numbers.",
    "For Arabic, output MSA.",
    `Return ONLY strict JSON with these exact keys: ${JSON.stringify(targets)}`,
    "Input:", JSON.stringify({ canonical }),
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

function missingLangs(map: Record<string, string> | null | undefined): Lang[] {
  const m = map ?? {};
  return LANGS.filter((l) => !m[l] || m[l].trim().length === 0);
}

function pushError(samples: string[], msg: string) {
  if (samples.length < MAX_ERROR_SAMPLES) samples.push(msg);
}

// ---------- Per-table runners ----------

async function syncProducts(report: Report, apiKey: string, budget: { left: number }) {
  if (budget.left <= 0) return;
  const { data: pendingHead, count } = await supabaseAdmin
    .from("products")
    .select("id", { count: "exact", head: true })
    .or("translated_hash.is.null,translated_hash.neq.content_hash");
  void pendingHead;
  report.products.pending = count ?? 0;

  while (budget.left > 0) {
    const limit = Math.min(BATCH, budget.left);
    const { data } = await supabaseAdmin
      .from("products")
      .select("id, name, designation, description, name_i18n, designation_i18n, description_i18n, content_hash, translated_hash")
      .or("translated_hash.is.null,translated_hash.neq.content_hash")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (!data || data.length === 0) break;

    for (const p of data) {
      budget.left--;
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
        if (error) { report.products.errors++; pushError(report.errorSamples, `produit ${row.id.slice(0, 8)}: ${error.message}`); }
        else report.products.translated++;
      } catch (e) {
        report.products.errors++;
        pushError(report.errorSamples, `produit: ${e instanceof Error ? e.message : "erreur"}`);
      }
      if (budget.left <= 0) break;
    }
    if (data.length < limit) break;
  }
}

async function syncHashTable(
  table: "categories" | "countries",
  bucket: BucketReport,
  report: Report,
  apiKey: string,
  budget: { left: number },
) {
  if (budget.left <= 0) return;
  const { count } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true })
    .or("translated_hash.is.null,translated_hash.neq.content_hash");
  bucket.pending = count ?? 0;

  while (budget.left > 0) {
    const limit = Math.min(BATCH, budget.left);
    const { data } = await supabaseAdmin
      .from(table)
      .select("id, name, name_i18n, content_hash, translated_hash")
      .or("translated_hash.is.null,translated_hash.neq.content_hash")
      .limit(limit);
    if (!data || data.length === 0) break;

    for (const c of data) {
      budget.left--;
      try {
        const row = c as { id: string; name: string; name_i18n: Record<string, string> | null; content_hash: string };
        const merged: Record<string, string> = { ...(row.name_i18n ?? {}) };
        const res = await translateShort(row.name ?? "", [...LANGS], apiKey);
        for (const l of LANGS) if (res[l]) merged[l] = res[l]!;
        const { error } = await supabaseAdmin
          .from(table)
          .update({ name_i18n: merged, translated_hash: row.content_hash })
          .eq("id", row.id);
        if (error) { bucket.errors++; pushError(report.errorSamples, `${table} ${row.id.slice(0, 8)}: ${error.message}`); }
        else bucket.translated++;
      } catch (e) {
        bucket.errors++;
        pushError(report.errorSamples, `${table}: ${e instanceof Error ? e.message : "erreur"}`);
      }
      if (budget.left <= 0) break;
    }
    if (data.length < limit) break;
  }
}

async function syncShops(report: Report, apiKey: string, budget: { left: number }) {
  if (budget.left <= 0) return;
  // Shops use missing-lang detection across shop_description + shop_hours.
  let offset = 0;
  while (budget.left > 0) {
    const limit = Math.min(BATCH, budget.left);
    const pageSize = limit * 4; // overscan since many rows are already-complete
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, shop_description, shop_description_i18n, shop_hours, shop_hours_i18n")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (!data || data.length === 0) break;
    offset += data.length;

    let touched = 0;
    for (const s of data) {
      if (budget.left <= 0) break;
      const row = s as {
        id: string;
        shop_description: string | null; shop_description_i18n: Record<string, string> | null;
        shop_hours: string | null; shop_hours_i18n: Record<string, string> | null;
      };
      const missDesc = row.shop_description ? missingLangs(row.shop_description_i18n) : [];
      const missHours = row.shop_hours ? missingLangs(row.shop_hours_i18n) : [];
      if (missDesc.length === 0 && missHours.length === 0) { report.shops.skipped++; continue; }

      budget.left--;
      touched++;
      try {
        const patch: Record<string, Record<string, string>> = {};
        if (missDesc.length > 0 && row.shop_description) {
          const merged = { ...(row.shop_description_i18n ?? {}) };
          const res = await translateLong(row.shop_description, missDesc, apiKey);
          let changed = false;
          for (const l of missDesc) if (res[l]) { merged[l] = res[l]!; changed = true; }
          if (changed) patch.shop_description_i18n = merged;
        }
        if (missHours.length > 0 && row.shop_hours) {
          const merged = { ...(row.shop_hours_i18n ?? {}) };
          const res = await translateShort(row.shop_hours, missHours, apiKey);
          let changed = false;
          for (const l of missHours) if (res[l]) { merged[l] = res[l]!; changed = true; }
          if (changed) patch.shop_hours_i18n = merged;
        }
        if (Object.keys(patch).length === 0) { report.shops.errors++; continue; }
        const { error } = await supabaseAdmin.from("profiles").update(patch as never).eq("id", row.id);
        if (error) { report.shops.errors++; pushError(report.errorSamples, `boutique ${row.id.slice(0, 8)}: ${error.message}`); }
        else report.shops.translated++;
      } catch (e) {
        report.shops.errors++;
        pushError(report.errorSamples, `boutique: ${e instanceof Error ? e.message : "erreur"}`);
      }
    }
    if (touched === 0) break; // no candidates in this page
    if (data.length < limit * 4) break;
  }
}

async function syncBanners(report: Report, apiKey: string, budget: { left: number }) {
  if (budget.left <= 0) return;
  const { data } = await supabaseAdmin
    .from("home_banners")
    .select("id, title, subtitle, cta_label, title_i18n, subtitle_i18n, cta_label_i18n");
  if (!data) return;

  for (const b of data) {
    if (budget.left <= 0) break;
    const row = b as {
      id: string;
      title: string | null; subtitle: string | null; cta_label: string | null;
      title_i18n: Record<string, string> | null;
      subtitle_i18n: Record<string, string> | null;
      cta_label_i18n: Record<string, string> | null;
    };
    const fields: Array<{ key: "title" | "subtitle" | "cta_label"; src: string | null; i18n: Record<string, string> | null; long: boolean }> = [
      { key: "title", src: row.title, i18n: row.title_i18n, long: false },
      { key: "subtitle", src: row.subtitle, i18n: row.subtitle_i18n, long: true },
      { key: "cta_label", src: row.cta_label, i18n: row.cta_label_i18n, long: false },
    ];
    const patch: Record<string, Record<string, string>> = {};
    let needs = false;
    try {
      for (const f of fields) {
        if (!f.src || !f.src.trim()) continue;
        const miss = missingLangs(f.i18n);
        if (miss.length === 0) continue;
        needs = true;
        if (budget.left <= 0) break;
        budget.left--;
        const res = f.long
          ? await translateLong(f.src, miss, apiKey)
          : await translateShort(f.src, miss, apiKey);
        const merged = { ...(f.i18n ?? {}) };
        let changed = false;
        for (const l of miss) if (res[l]) { merged[l] = res[l]!; changed = true; }
        if (changed) patch[`${f.key}_i18n`] = merged;
      }
      if (!needs) { report.banners.skipped++; continue; }
      if (Object.keys(patch).length === 0) { report.banners.errors++; continue; }
      const { error } = await supabaseAdmin.from("home_banners").update(patch as never).eq("id", row.id);
      if (error) { report.banners.errors++; pushError(report.errorSamples, `bannière ${row.id.slice(0, 8)}: ${error.message}`); }
      else report.banners.translated++;
    } catch (e) {
      report.banners.errors++;
      pushError(report.errorSamples, `bannière: ${e instanceof Error ? e.message : "erreur"}`);
    }
  }
}

async function syncSettings(report: Report, apiKey: string, budget: { left: number }) {
  if (budget.left <= 0) return;
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("id, hero_title, hero_subtitle, footer_text, promo_bar_text, hero_title_i18n, hero_subtitle_i18n, footer_text_i18n, promo_bar_text_i18n")
    .eq("id", "main")
    .maybeSingle();
  if (!data) return;
  const row = data as {
    id: string;
    hero_title: string | null; hero_subtitle: string | null; footer_text: string | null; promo_bar_text: string | null;
    hero_title_i18n: Record<string, string> | null;
    hero_subtitle_i18n: Record<string, string> | null;
    footer_text_i18n: Record<string, string> | null;
    promo_bar_text_i18n: Record<string, string> | null;
  };
  const fields: Array<{ key: "hero_title" | "hero_subtitle" | "footer_text" | "promo_bar_text"; src: string | null; i18n: Record<string, string> | null; long: boolean }> = [
    { key: "hero_title", src: row.hero_title, i18n: row.hero_title_i18n, long: false },
    { key: "hero_subtitle", src: row.hero_subtitle, i18n: row.hero_subtitle_i18n, long: true },
    { key: "footer_text", src: row.footer_text, i18n: row.footer_text_i18n, long: true },
    { key: "promo_bar_text", src: row.promo_bar_text, i18n: row.promo_bar_text_i18n, long: false },
  ];
  const patch: Record<string, Record<string, string>> = {};
  let needs = false;
  try {
    for (const f of fields) {
      if (!f.src || !f.src.trim()) continue;
      const miss = missingLangs(f.i18n);
      if (miss.length === 0) continue;
      needs = true;
      if (budget.left <= 0) break;
      budget.left--;
      const res = f.long
        ? await translateLong(f.src, miss, apiKey)
        : await translateShort(f.src, miss, apiKey);
      const merged = { ...(f.i18n ?? {}) };
      let changed = false;
      for (const l of miss) if (res[l]) { merged[l] = res[l]!; changed = true; }
      if (changed) patch[`${f.key}_i18n`] = merged;
    }
    if (!needs) { report.settings.skipped++; return; }
    if (Object.keys(patch).length === 0) { report.settings.errors++; return; }
    const { error } = await supabaseAdmin.from("site_settings").update(patch as never).eq("id", "main");
    if (error) { report.settings.errors++; pushError(report.errorSamples, `paramètres: ${error.message}`); }
    else report.settings.translated++;
  } catch (e) {
    report.settings.errors++;
    pushError(report.errorSamples, `paramètres: ${e instanceof Error ? e.message : "erreur"}`);
  }
}

/**
 * Run translation sync. Paginates within a hard per-run budget so the
 * Worker stays within its timeout. Re-run the action (or wait for the
 * Inngest cron) to drain remaining backlog — the `pending` counters in
 * the report tell the admin if more rows are queued.
 */
export async function runTranslationSync(scope: Scope = "all"): Promise<Report> {
  const start = Date.now();
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Lovable AI Gateway non configuré");

  const report: Report = {
    scope,
    products: emptyBucket(),
    categories: emptyBucket(),
    countries: emptyBucket(),
    shops: emptyBucket(),
    banners: emptyBucket(),
    settings: emptyBucket(),
    errorSamples: [],
    durationMs: 0,
  };

  const budget = { left: HARD_CAP_PER_RUN };
  const runAll = scope === "all";

  if (runAll || scope === "products") await syncProducts(report, apiKey, budget);
  if (runAll || scope === "categories") await syncHashTable("categories", report.categories, report, apiKey, budget);
  if (runAll || scope === "countries") await syncHashTable("countries", report.countries, report, apiKey, budget);
  if (runAll || scope === "shops") await syncShops(report, apiKey, budget);
  if (runAll || scope === "banners") await syncBanners(report, apiKey, budget);
  if (runAll || scope === "settings") await syncSettings(report, apiKey, budget);

  report.durationMs = Date.now() - start;
  return report;
}
