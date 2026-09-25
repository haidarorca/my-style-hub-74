// Appel IA (Lovable AI Gateway, Responses API, streaming) pour le Centre de traduction.
import { TRANSLATION_LANGS } from "./langs";

export class AiHalt extends Error {
  constructor(public kind: "rate" | "credits" | "denied" | "config", message: string) {
    super(message);
  }
}

const MODEL = "openai/gpt-6-astra";

export async function callAi(prompt: string): Promise<string | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new AiHalt("config", "Service IA non configuré");
  let res: Response;
  try {
    res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        input: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    throw new AiHalt("rate", "Service IA momentanément injoignable");
  }
  if (res.status === 429 || res.status >= 500) throw new AiHalt("rate", "Service IA saturé, reprise automatique");
  if (res.status === 402) throw new AiHalt("credits", "Crédits IA épuisés — rechargez puis cliquez sur Reprendre");
  if (res.status === 403) {
    const txt = await res.text().catch(() => "");
    throw new AiHalt(/credit|limit/i.test(txt) ? "credits" : "denied", "Accès IA refusé — vérifiez les paramètres de l'espace puis cliquez sur Reprendre");
  }
  if (res.status === 401) throw new AiHalt("config", "Clé du service IA invalide");
  if (!res.ok || !res.body) return null;

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload) as { type?: string; delta?: string };
        if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") out += ev.delta;
        if (ev.type === "response.failed" || ev.type === "error") return null;
      } catch { /* ligne partielle */ }
    }
  }
  return out.trim() || null;
}

export function parseJson<T = Record<string, unknown>>(raw: string | null): T | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned) as T; } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]) as T; } catch { return null; } }
    return null;
  }
}

export function langNames(langs: string[]): string {
  return langs.map((l) => `${l} = ${TRANSLATION_LANGS.find((x) => x.code === l)?.english ?? l}`).join(", ");
}

/** Traduit une liste de libellés courts. Retourne, par index, un objet {lang: texte}. */
export async function translateLabels(items: string[], langs: string[], context: string) {
  if (items.length === 0 || langs.length === 0) return [] as Array<Record<string, string>>;
  const prompt = [
    `You translate short e-commerce ${context}.`,
    "Each input may be in ANY language (English, Chinese, French, ...). Detect it per item — never assume French.",
    `Translate every item into each target language: ${langNames(langs)}.`,
    "Keep brand names, model codes, numbers, sizes (S, M, XL, 42...) and units exactly. Natural shop wording. No quotes.",
    `Return ONLY strict JSON: {"items":[{"i":0, ${langs.map((l) => `"${l}":""`).join(", ")}}, ...]} with one entry per input index.`,
    "Input:",
    JSON.stringify(items.map((t, i) => ({ i, t }))),
  ].join("\n");
  const parsed = parseJson<{ items?: Array<Record<string, unknown>> }>(await callAi(prompt));
  const out: Array<Record<string, string>> = items.map(() => ({}));
  for (const it of parsed?.items ?? []) {
    const i = Number(it.i);
    if (!Number.isInteger(i) || i < 0 || i >= items.length) continue;
    for (const l of langs) {
      const v = it[l];
      if (typeof v === "string" && v.trim()) out[i][l] = v.trim();
    }
  }
  return out;
}

/** Traduit un texte libre (long ou court). */
export async function translateFree(text: string, langs: string[]) {
  const out: Record<string, string> = {};
  if (!text.trim() || langs.length === 0) return out;
  const prompt = [
    "Translate this e-commerce text. The source may be in any language (English, Chinese, French, Arabic...) — detect it, never assume French.",
    `Targets: ${langNames(langs)}. Preserve line breaks, HTML tags, brands and numbers.`,
    `Return ONLY strict JSON with exactly these keys: ${JSON.stringify(langs)}`,
    "Text:",
    JSON.stringify(text),
  ].join("\n");
  const parsed = parseJson(await callAi(prompt));
  for (const l of langs) {
    const v = parsed?.[l];
    if (typeof v === "string" && v.trim()) out[l] = v.trim();
  }
  return out;
}

export type ProductSource = {
  name: string;
  designation: string;
  description: string;
  material: string;
  group_option_label: string;
  specs: Array<{ label: string; value: string }>;
};
export type ProductTranslation = {
  source_lang: string | null;
  byLang: Record<string, Partial<Omit<ProductSource, "specs">> & { specs?: Array<{ label: string; value: string }> }>;
};

export async function translateProductAll(src: ProductSource, langs: string[]): Promise<ProductTranslation | null> {
  const shape = `{"name":"","designation":"","description":"","material":"","group_option_label":"","specs":[{"label":"","value":""}]}`;
  const prompt = [
    "You translate a complete e-commerce product sheet.",
    "IMPORTANT: every field may be in a DIFFERENT language (often English or Chinese from the supplier, sometimes French). Detect the language of each field yourself — never assume the text is French.",
    `Translate ALL fields into each target language: ${langNames(langs)}. If a field is already in the target language, return it cleaned up but unchanged in meaning.`,
    "Rules: keep brand names, model references, codes, prices, numbers, sizes and units EXACTLY.",
    "The description may contain HTML: keep every tag and attribute unchanged, translate only visible text.",
    "specs: same number of items, same order; translate both label and value (keep codes/sizes/numbers).",
    "Empty input field → empty string. Titles short and natural for an online shop.",
    `Also return "source_lang": the ISO 639-1 code of the main language of "name" (e.g. "en", "zh", "fr").`,
    `Return ONLY strict JSON: {"source_lang":"", ${langs.map((l) => `"${l}":${shape}`).join(", ")}}`,
    "Product:",
    JSON.stringify(src),
  ].join("\n");
  const parsed = parseJson(await callAi(prompt));
  if (!parsed) return null;
  const byLang: ProductTranslation["byLang"] = {};
  let any = false;
  for (const l of langs) {
    const node = parsed[l];
    if (!node || typeof node !== "object") continue;
    const n = node as Record<string, unknown>;
    const entry: ProductTranslation["byLang"][string] = {};
    for (const k of ["name", "designation", "description", "material", "group_option_label"] as const) {
      const v = n[k];
      if (typeof v === "string" && v.trim()) { entry[k] = v.trim(); any = true; }
    }
    if (Array.isArray(n.specs) && n.specs.length === src.specs.length && src.specs.length > 0) {
      entry.specs = (n.specs as Array<Record<string, unknown>>).map((s, i) => ({
        label: typeof s?.label === "string" && s.label.trim() ? s.label.trim() : src.specs[i].label,
        value: typeof s?.value === "string" ? s.value.trim() : src.specs[i].value,
      }));
    }
    byLang[l] = entry;
  }
  if (!any) return null;
  const sl = typeof parsed.source_lang === "string" ? parsed.source_lang.trim().toLowerCase().slice(0, 5) : "";
  return { source_lang: /^[a-z]{2}(-[a-z]{2})?$/.test(sl) ? sl : null, byLang };
}
