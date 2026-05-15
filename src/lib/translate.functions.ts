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

/**
 * Translate a short piece of e-commerce text via Lovable AI Gateway.
 * Used by the multilingual input "Translate" helper. Returns the translation
 * as a plain string. Brand names, product codes, references and prices must
 * be preserved verbatim — the prompt enforces this.
 */
export const translateText = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.from === data.to) return { text: data.text };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { text: data.text, error: "AI gateway not configured" as const };
    }

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
      if (!res.ok) {
        const status = res.status;
        return {
          text: data.text,
          error: status === 429 ? ("rate_limited" as const) : status === 402 ? ("credits" as const) : ("api_error" as const),
        };
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const out = json.choices?.[0]?.message?.content?.trim();
      return { text: out && out.length > 0 ? out : data.text };
    } catch (e) {
      console.error("translateText failed", e);
      return { text: data.text, error: "network" as const };
    }
  });
