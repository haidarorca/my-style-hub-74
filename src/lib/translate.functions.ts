import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TARGETS: Record<string, string> = {
  fr: "French",
  en: "English",
  ar: "Arabic",
};

const inputSchema = z.object({
  text: z.string().min(1).max(4000),
  from: z.enum(["fr", "en", "ar"]),
  to: z.enum(["fr", "en", "ar"]),
});

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

/**
 * Translate a short piece of e-commerce text via Lovable AI Gateway.
 */
export const translateText = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.from === data.to) return { text: data.text };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { text: data.text, error: "AI gateway not configured" as const };

    const prompt = [
      `Translate the following e-commerce text from ${TARGETS[data.from]} to ${TARGETS[data.to]}.`,
      "Rules:",
      "- Keep brand names, product codes, references, prices, numbers and proper nouns EXACTLY as written.",
      "- Do NOT add quotes, prefixes, suffixes or explanations.",
      "- Output ONLY the translated text, nothing else.",
      "",
      "Text:",
      data.text,
    ].join("\n");

    try {
      const out = await callGateway(prompt, apiKey);
      return { text: out && out.length > 0 ? out : data.text };
    } catch (e) {
      console.error("translateText failed", e);
      return { text: data.text, error: "network" as const };
    }
  });

const productSchema = z.object({
  name: z.string().min(1).max(500),
  designation: z.string().max(2000).optional().nullable(),
  description: z.string().max(8000).optional().nullable(),
});

type FieldMap = { name: string; designation: string; description: string };

function safeParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  // Strip code fences if model wraps in ```json ... ```
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // Try to extract first {...}
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
    }
    return null;
  }
}

/**
 * Translate a product's FR fields into EN + AR in a single AI call.
 * Returns a partial map per language. Empty strings are dropped.
 */
export const translateProductFields = createServerFn({ method: "POST" })
  .inputValidator((input) => productSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    const empty = { en: {} as Partial<FieldMap>, ar: {} as Partial<FieldMap> };
    if (!apiKey) return { ...empty, error: "no_key" as const };

    const payload = {
      name: data.name,
      designation: data.designation ?? "",
      description: data.description ?? "",
    };

    const prompt = [
      "You translate e-commerce product copy from French to English and Arabic.",
      "Rules:",
      "- Keep brand names, model references, codes, prices, units and numbers EXACTLY as written.",
      "- Translate naturally for an online store (titles short, descriptions fluid).",
      "- For Arabic, output Modern Standard Arabic, naturally right-to-left.",
      "- If an input field is empty, return an empty string for it.",
      'Return ONLY a strict JSON object of shape: {"en":{"name":"","designation":"","description":""},"ar":{"name":"","designation":"","description":""}}',
      "No markdown, no comments, no extra keys.",
      "",
      "Input (French):",
      JSON.stringify(payload),
    ].join("\n");

    try {
      const raw = await callGateway(prompt, apiKey);
      if (!raw) return { ...empty, error: "api_error" as const };
      const parsed = safeParseJson(raw);
      if (!parsed) return { ...empty, error: "parse_error" as const };

      const pickLang = (langKey: "en" | "ar"): Partial<FieldMap> => {
        const node = parsed[langKey];
        if (!node || typeof node !== "object") return {};
        const n = node as Record<string, unknown>;
        const out: Partial<FieldMap> = {};
        for (const k of ["name", "designation", "description"] as const) {
          const v = n[k];
          if (typeof v === "string" && v.trim().length > 0) out[k] = v.trim();
        }
        return out;
      };

      return { en: pickLang("en"), ar: pickLang("ar") };
    } catch (e) {
      console.error("translateProductFields failed", e);
      return { ...empty, error: "network" as const };
    }
  });

const categorySchema = z.object({ name: z.string().min(1).max(200) });

/**
 * Translate a category name into EN + AR in a single AI call.
 */
export const translateCategoryName = createServerFn({ method: "POST" })
  .inputValidator((input) => categorySchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    const empty = { en: "", ar: "" };
    if (!apiKey) return { ...empty, error: "no_key" as const };

    const prompt = [
      "Translate this French e-commerce category name into English and Modern Standard Arabic.",
      "Rules: keep it short (1-3 words), natural for a store menu, no quotes, no explanation.",
      'Return ONLY strict JSON of shape: {"en":"","ar":""}',
      "",
      "French:",
      data.name,
    ].join("\n");

    try {
      const raw = await callGateway(prompt, apiKey);
      if (!raw) return { ...empty, error: "api_error" as const };
      const parsed = safeParseJson(raw);
      if (!parsed) return { ...empty, error: "parse_error" as const };
      const en = typeof parsed.en === "string" ? parsed.en.trim() : "";
      const ar = typeof parsed.ar === "string" ? parsed.ar.trim() : "";
      return { en, ar };
    } catch (e) {
      console.error("translateCategoryName failed", e);
      return { ...empty, error: "network" as const };
    }
  });
