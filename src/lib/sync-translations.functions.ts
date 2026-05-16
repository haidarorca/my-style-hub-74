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

const LANGS = ["en", "ar"] as const;
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

const TARGET_NAME: Record<Lang, string> = { en: "English", ar: "Modern Standard Arabic" };

async function translateShort(text: string, apiKey: string): Promise<Partial<Record<Lang, string>>> {
  const out: Partial<Record<Lang, string>> = {};
  const prompt = [
    "Translate this short French e-commerce label into English and Modern Standard Arabic.",
    "Rules: keep brand names/numbers exact, 1-4 words, no quotes, no explanation.",
    'Return ONLY strict JSON of shape: {"en":"","ar":""}',
    "",
    "French:",
    text,
  ].join("\n");
  const raw = await callGateway(prompt, apiKey);
  if (!raw) return out;
  const parsed = parseJson(raw);
  if (!parsed) return out;
  for (const l of LANGS) {
    const v = parsed[l];
    if (typeof v === "string" && v.trim().length > 0) out[l] = v.trim();
  }
  return out;
}

async function translateProduct(
  name: string,
  designation: string,
  description: string,
  apiKey: string,
): Promise<Record<Lang, { name?: string; designation?: string; description?: string }>> {
  const empty = { en: {}, ar: {} } as Record<Lang, { name?: string; designation?: string; description?: string }>;
  const prompt = [
    "You translate e-commerce product copy from French to English and Arabic.",
    "Rules:",
    "- Keep brand names, codes, prices, units and numbers EXACTLY as written.",
    "- Translate naturally for an online store (titles short, descriptions fluid).",
    "- For Arabic, output Modern Standard Arabic.",
    "- If an input field is empty, return an empty string for it.",
    'Return ONLY strict JSON of shape: {"en":{"name":"","designation":"","description":""},"ar":{"name":"","designation":"","description":""}}',
    "",
    "Input (French):",
    JSON.stringify({ name, designation, description }),
  ].join("\n");
  const raw = await callGateway(prompt, apiKey);
  if (!raw) return empty;
  const parsed = parseJson(raw);
  if (!parsed) return empty;
  const result = { en: {}, ar: {} } as Record<Lang, { name?: string; designation?: string; description?: string }>;
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

async function translateLongHTML(text: string, apiKey: string): Promise<Partial<Record<Lang, string>>> {
  const out: Partial<Record<Lang, string>> = {};
  const prompt = [
    `Translate this French e-commerce description into ${LANGS.map((l) => TARGET_NAME[l]).join(" and ")}.`,
    "Keep brand names/numbers/units exact. Preserve line breaks.",
    'Return ONLY strict JSON of shape: {"en":"","ar":""}',
    "",
    "French:",
    text,
  ].join("\n");
  const raw = await callGateway(prompt, apiKey);
  if (!raw) return out;
  const parsed = parseJson(raw);
  if (!parsed) return out;
  for (const l of LANGS) {
    const v = parsed[l];
    if (typeof v === "string" && v.trim().length > 0) out[l] = v.trim();
  }
  return out;
}

function missingLangs(i18n: Record<string, string> | null | undefined): Lang[] {
  const obj = (i18n ?? {}) as Record<string, string>;
  return LANGS.filter((l) => !obj[l] || obj[l].trim().length === 0);
}

export const syncTranslations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Report> => {
    const start = Date.now();

    // Verify admin
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();
    if (!roleRow) throw new Error("Accès refusé : admin requis");

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
      const nm = missingLangs(p.name_i18n as Record<string, string> | null);
      const dm = p.designation ? missingLangs(p.designation_i18n as Record<string, string> | null) : [];
      const desm = p.description ? missingLangs(p.description_i18n as Record<string, string> | null) : [];
      return nm.length || dm.length || desm.length;
    }).slice(0, MAX_PER_TABLE);

    report.products.skipped = (products?.length ?? 0) - productsNeeding.length;

    for (const p of productsNeeding) {
      try {
        const res = await translateProduct(
          p.name ?? "",
          (p.designation as string | null) ?? "",
          (p.description as string | null) ?? "",
          apiKey,
        );
        const nameI18n = { ...((p.name_i18n as Record<string, string>) ?? {}) };
        const desigI18n = { ...((p.designation_i18n as Record<string, string>) ?? {}) };
        const descI18n = { ...((p.description_i18n as Record<string, string>) ?? {}) };
        let changed = false;
        for (const l of LANGS) {
          if (!nameI18n[l] && res[l].name) { nameI18n[l] = res[l].name!; changed = true; }
          if (p.designation && !desigI18n[l] && res[l].designation) { desigI18n[l] = res[l].designation!; changed = true; }
          if (p.description && !descI18n[l] && res[l].description) { descI18n[l] = res[l].description!; changed = true; }
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
    const catsNeeding = (cats ?? []).filter((c) => missingLangs(c.name_i18n as Record<string, string> | null).length > 0).slice(0, MAX_PER_TABLE);
    report.categories.skipped = (cats?.length ?? 0) - catsNeeding.length;

    for (const c of catsNeeding) {
      try {
        const res = await translateShort(c.name ?? "", apiKey);
        const merged = { ...((c.name_i18n as Record<string, string>) ?? {}) };
        let changed = false;
        for (const l of LANGS) if (!merged[l] && res[l]) { merged[l] = res[l]!; changed = true; }
        if (!changed) { report.categories.errors++; continue; }
        const { error } = await supabaseAdmin.from("categories").update({ name_i18n: merged }).eq("id", c.id);
        if (error) report.categories.errors++; else report.categories.translated++;
      } catch { report.categories.errors++; }
    }

    // ---------- COUNTRIES ----------
    const { data: ctys } = await supabaseAdmin.from("countries").select("id, name, name_i18n");
    const ctysNeeding = (ctys ?? []).filter((c) => missingLangs(c.name_i18n as Record<string, string> | null).length > 0).slice(0, MAX_PER_TABLE);
    report.countries.skipped = (ctys?.length ?? 0) - ctysNeeding.length;
    for (const c of ctysNeeding) {
      try {
        const res = await translateShort(c.name ?? "", apiKey);
        const merged = { ...((c.name_i18n as Record<string, string>) ?? {}) };
        let changed = false;
        for (const l of LANGS) if (!merged[l] && res[l]) { merged[l] = res[l]!; changed = true; }
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
      const txt = (s.shop_description as string | null) ?? "";
      return txt.trim().length > 0 && missingLangs(s.shop_description_i18n as Record<string, string> | null).length > 0;
    }).slice(0, MAX_PER_TABLE);
    report.shops.skipped = (shops?.length ?? 0) - shopsNeeding.length;
    for (const s of shopsNeeding) {
      try {
        const res = await translateLongHTML((s.shop_description as string) ?? "", apiKey);
        const merged = { ...((s.shop_description_i18n as Record<string, string>) ?? {}) };
        let changed = false;
        for (const l of LANGS) if (!merged[l] && res[l]) { merged[l] = res[l]!; changed = true; }
        if (!changed) { report.shops.errors++; continue; }
        const { error } = await supabaseAdmin.from("profiles").update({ shop_description_i18n: merged }).eq("id", s.id);
        if (error) report.shops.errors++; else report.shops.translated++;
      } catch { report.shops.errors++; }
    }

    report.durationMs = Date.now() - start;
    return report;
  });
