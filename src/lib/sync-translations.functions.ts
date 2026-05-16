import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Report = {
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
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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

/**
 * Build a payload of known-language values (canonical text + any existing i18n entries),
 * so the AI can pick the best source and fill in missing langs.
 */
function buildSources(canonical: string, i18n: Record<string, string> | null | undefined): Partial<Record<Lang, string>> {
  const out: Partial<Record<Lang, string>> = {};
  const obj = (i18n ?? {}) as Record<string, string>;
  for (const l of LANGS) {
    const v = obj[l];
    if (typeof v === "string" && v.trim().length > 0) out[l] = v.trim();
  }
  // canonical column has unknown language — pass it under a separate key
  if (canonical && canonical.trim().length > 0 && Object.keys(out).length === 0) {
    // we still need a hint; use it as fallback in prompt
  }
  return out;
}

function hasAnyText(s: string | null | undefined, i18n: Record<string, string> | null | undefined): boolean {
  if (s && s.trim().length > 0) return true;
  if (i18n) {
    for (const v of Object.values(i18n)) if (typeof v === "string" && v.trim().length > 0) return true;
  }
  return false;
}

function missingLangs(i18n: Record<string, string> | null | undefined, sources: Partial<Record<Lang, string>>): Lang[] {
  const obj = (i18n ?? {}) as Record<string, string>;
  return LANGS.filter((l) => {
    const inI18n = obj[l] && obj[l].trim().length > 0;
    const inSources = sources[l] && sources[l]!.trim().length > 0;
    return !inI18n && !inSources;
  });
}

/**
 * Detect i18n entries that are trivial copies (all values identical) — typical
 * sign that translations were never actually generated and the canonical value
 * was just duplicated across languages. In that case we want to retranslate.
 */
function looksUntranslated(i18n: Record<string, string> | null | undefined): boolean {
  const obj = (i18n ?? {}) as Record<string, string>;
  const vals = LANGS.map((l) => (obj[l] ?? "").trim().toLowerCase()).filter((v) => v.length > 0);
  if (vals.length < 2) return false;
  return vals.every((v) => v === vals[0]);
}

/** Langs that are missing OR look like trivial copies (need real translation). */
function langsNeedingTranslation(i18n: Record<string, string> | null | undefined): Lang[] {
  const obj = (i18n ?? {}) as Record<string, string>;
  if (looksUntranslated(obj)) {
    // keep one as source (the one matching canonical preferred — caller passes canonical separately)
    // Return all langs; the caller decides which to overwrite based on detected source.
    return [...LANGS];
  }
  return missingLangs(obj, {});
}

async function translateShort(
  canonical: string,
  sources: Partial<Record<Lang, string>>,
  targets: Lang[],
  apiKey: string,
): Promise<Partial<Record<Lang, string>>> {
  const out: Partial<Record<Lang, string>> = {};
  if (targets.length === 0) return out;
  const prompt = [
    "Translate this short e-commerce label.",
    "Auto-detect the source language from the provided inputs (French, English or Arabic).",
    "Rules: keep brand names/numbers exact, 1-4 words, no quotes, no explanation.",
    `For Arabic, output Modern Standard Arabic.`,
    `Return ONLY strict JSON with these exact keys: ${JSON.stringify(targets)}`,
    'Example shape: {"fr":"","en":"","ar":""}',
    "",
    "Known inputs (any subset of fr/en/ar may be present, plus a canonical source of unknown language):",
    JSON.stringify({ canonical, ...sources }),
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

async function translateLong(
  canonical: string,
  sources: Partial<Record<Lang, string>>,
  targets: Lang[],
  apiKey: string,
): Promise<Partial<Record<Lang, string>>> {
  const out: Partial<Record<Lang, string>> = {};
  if (targets.length === 0) return out;
  const prompt = [
    "Translate this e-commerce description.",
    "Auto-detect the source language (French, English or Arabic).",
    "Keep brand names/numbers/units exact. Preserve line breaks. Natural store tone.",
    "For Arabic, output Modern Standard Arabic.",
    `Return ONLY strict JSON with these exact keys: ${JSON.stringify(targets)}`,
    "",
    "Known inputs:",
    JSON.stringify({ canonical, ...sources }),
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
  i18n: { name: Record<string, string>; designation: Record<string, string>; description: Record<string, string> },
  targets: Lang[],
  apiKey: string,
): Promise<ProductTrio> {
  const empty = { fr: {}, en: {}, ar: {} } as ProductTrio;
  if (targets.length === 0) return empty;
  const prompt = [
    "You translate e-commerce product copy. Auto-detect the source language (French, English or Arabic) from the inputs below.",
    "Rules:",
    "- Keep brand names, codes, prices, units and numbers EXACTLY as written.",
    "- Titles short, descriptions natural for an online store.",
    "- For Arabic, output Modern Standard Arabic.",
    "- If a field is empty in all inputs, return an empty string for it.",
    `Return ONLY strict JSON with these exact top-level keys: ${JSON.stringify(targets)}`,
    'Each value is an object: {"name":"","designation":"","description":""}',
    "",
    "Known inputs (canonical + any existing translations per language):",
    JSON.stringify({
      canonical,
      fr: { name: i18n.name.fr, designation: i18n.designation.fr, description: i18n.description.fr },
      en: { name: i18n.name.en, designation: i18n.designation.en, description: i18n.description.en },
      ar: { name: i18n.name.ar, designation: i18n.designation.ar, description: i18n.description.ar },
    }),
  ].join("\n");
  const raw = await callGateway(prompt, apiKey);
  if (!raw) return empty;
  const parsed = parseJson(raw);
  if (!parsed) return empty;
  const result = { fr: {}, en: {}, ar: {} } as ProductTrio;
  for (const l of targets) {
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

export const syncTranslations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Report> => {
    const start = Date.now();

    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "super_admin"]);
    if (roleErr) throw new Error(`Erreur vérification rôle: ${roleErr.message}`);
    if (!roleRows || roleRows.length === 0) throw new Error("Accès refusé : admin requis");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Lovable AI Gateway non configuré");

    const report: Report = {
      products: { translated: 0, skipped: 0, errors: 0 },
      categories: { translated: 0, skipped: 0, errors: 0 },
      countries: { translated: 0, skipped: 0, errors: 0 },
      shops: { translated: 0, skipped: 0, errors: 0 },
      durationMs: 0,
    };

    // ---------- PRODUCTS ----------
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, name, designation, description, name_i18n, designation_i18n, description_i18n")
      .order("updated_at", { ascending: false })
      .limit(MAX_PER_TABLE * 3);

    const productsNeeding = (products ?? []).filter((p) => {
      const nameI18n = (p.name_i18n as Record<string, string> | null) ?? {};
      const desigI18n = (p.designation_i18n as Record<string, string> | null) ?? {};
      const descI18n = (p.description_i18n as Record<string, string> | null) ?? {};
      const nm = langsNeedingTranslation(nameI18n);
      const dm = hasAnyText(p.designation as string | null, desigI18n) ? langsNeedingTranslation(desigI18n) : [];
      const desm = hasAnyText(p.description as string | null, descI18n) ? langsNeedingTranslation(descI18n) : [];
      return nm.length || dm.length || desm.length;
    }).slice(0, MAX_PER_TABLE);

    report.products.skipped = (products?.length ?? 0) - productsNeeding.length;

    for (const p of productsNeeding) {
      try {
        const nameI18n = { ...((p.name_i18n as Record<string, string>) ?? {}) };
        const desigI18n = { ...((p.designation_i18n as Record<string, string>) ?? {}) };
        const descI18n = { ...((p.description_i18n as Record<string, string>) ?? {}) };

        const nameTrivial = looksUntranslated(nameI18n);
        const desigTrivial = looksUntranslated(desigI18n);
        const descTrivial = looksUntranslated(descI18n);

        const desigHas = hasAnyText(p.designation as string | null, desigI18n);
        const descHas = hasAnyText(p.description as string | null, descI18n);
        const missing = new Set<Lang>();
        for (const l of langsNeedingTranslation(nameI18n)) missing.add(l);
        if (desigHas) for (const l of langsNeedingTranslation(desigI18n)) missing.add(l);
        if (descHas) for (const l of langsNeedingTranslation(descI18n)) missing.add(l);
        const targets = LANGS.filter((l) => missing.has(l));
        if (targets.length === 0) continue;

        const res = await translateProduct(
          {
            name: p.name ?? "",
            designation: (p.designation as string | null) ?? "",
            description: (p.description as string | null) ?? "",
          },
          { name: nameI18n, designation: desigI18n, description: descI18n },
          targets,
          apiKey,
        );
        let changed = false;
        for (const l of targets) {
          if ((nameTrivial || !nameI18n[l]) && res[l].name) { nameI18n[l] = res[l].name!; changed = true; }
          if (desigHas && (desigTrivial || !desigI18n[l]) && res[l].designation) { desigI18n[l] = res[l].designation!; changed = true; }
          if (descHas && (descTrivial || !descI18n[l]) && res[l].description) { descI18n[l] = res[l].description!; changed = true; }
        }
        if (!changed) { report.products.errors++; continue; }
        const { error } = await supabaseAdmin
          .from("products")
          .update({ name_i18n: nameI18n, designation_i18n: desigI18n, description_i18n: descI18n })
          .eq("id", p.id);
        if (error) report.products.errors++;
        else report.products.translated++;
      } catch {
        report.products.errors++;
      }
    }

    // ---------- CATEGORIES ----------
    const { data: cats } = await supabaseAdmin
      .from("categories")
      .select("id, name, name_i18n")
      .limit(MAX_PER_TABLE * 3);
    const catsNeeding = (cats ?? []).filter((c) => {
      const i18n = (c.name_i18n as Record<string, string> | null) ?? {};
      return langsNeedingTranslation(i18n).length > 0;
    }).slice(0, MAX_PER_TABLE);
    report.categories.skipped = (cats?.length ?? 0) - catsNeeding.length;

    for (const c of catsNeeding) {
      try {
        const merged = { ...((c.name_i18n as Record<string, string>) ?? {}) };
        const trivial = looksUntranslated(merged);
        const targets = langsNeedingTranslation(merged);
        if (targets.length === 0) continue;
        const sources: Partial<Record<Lang, string>> = {};
        if (!trivial) for (const l of LANGS) if (merged[l]) sources[l] = merged[l];
        const res = await translateShort(c.name ?? "", sources, targets, apiKey);
        let changed = false;
        for (const l of targets) if ((trivial || !merged[l]) && res[l]) { merged[l] = res[l]!; changed = true; }
        if (!changed) { report.categories.errors++; continue; }
        const { error } = await supabaseAdmin.from("categories").update({ name_i18n: merged }).eq("id", c.id);
        if (error) report.categories.errors++; else report.categories.translated++;
      } catch { report.categories.errors++; }
    }

    // ---------- COUNTRIES ----------
    const { data: ctys } = await supabaseAdmin.from("countries").select("id, name, name_i18n");
    const ctysNeeding = (ctys ?? []).filter((c) => missingLangs((c.name_i18n as Record<string, string> | null) ?? {}, {}).length > 0).slice(0, MAX_PER_TABLE);
    report.countries.skipped = (ctys?.length ?? 0) - ctysNeeding.length;
    for (const c of ctysNeeding) {
      try {
        const merged = { ...((c.name_i18n as Record<string, string>) ?? {}) };
        const targets = missingLangs(merged, {});
        if (targets.length === 0) continue;
        const sources: Partial<Record<Lang, string>> = {};
        for (const l of LANGS) if (merged[l]) sources[l] = merged[l];
        const res = await translateShort(c.name ?? "", sources, targets, apiKey);
        let changed = false;
        for (const l of targets) if (!merged[l] && res[l]) { merged[l] = res[l]!; changed = true; }
        if (!changed) { report.countries.errors++; continue; }
        const { error } = await supabaseAdmin.from("countries").update({ name_i18n: merged }).eq("id", c.id);
        if (error) report.countries.errors++; else report.countries.translated++;
      } catch { report.countries.errors++; }
    }

    // ---------- SHOP DESCRIPTIONS ----------
    const { data: shops } = await supabaseAdmin
      .from("profiles")
      .select("id, shop_description, shop_description_i18n")
      .not("shop_description", "is", null)
      .limit(MAX_PER_TABLE * 3);
    const shopsNeeding = (shops ?? []).filter((s) => {
      const i18n = (s.shop_description_i18n as Record<string, string> | null) ?? {};
      const txt = (s.shop_description as string | null) ?? "";
      return hasAnyText(txt, i18n) && missingLangs(i18n, {}).length > 0;
    }).slice(0, MAX_PER_TABLE);
    report.shops.skipped = (shops?.length ?? 0) - shopsNeeding.length;
    for (const s of shopsNeeding) {
      try {
        const merged = { ...((s.shop_description_i18n as Record<string, string>) ?? {}) };
        const targets = missingLangs(merged, {});
        if (targets.length === 0) continue;
        const sources: Partial<Record<Lang, string>> = {};
        for (const l of LANGS) if (merged[l]) sources[l] = merged[l];
        const res = await translateLong((s.shop_description as string) ?? "", sources, targets, apiKey);
        let changed = false;
        for (const l of targets) if (!merged[l] && res[l]) { merged[l] = res[l]!; changed = true; }
        if (!changed) { report.shops.errors++; continue; }
        const { error } = await supabaseAdmin.from("profiles").update({ shop_description_i18n: merged }).eq("id", s.id);
        if (error) report.shops.errors++; else report.shops.translated++;
      } catch { report.shops.errors++; }
    }

    report.durationMs = Date.now() - start;
    return report;
  });
