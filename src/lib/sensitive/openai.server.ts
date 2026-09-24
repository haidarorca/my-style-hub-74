/**
 * OpenAI DIRECT — module Images sensibles.
 * -----------------------------------------
 * Appelle UNIQUEMENT l'API officielle https://api.openai.com avec la clé
 * OPENAI_API_KEY (secret serveur). Aucun passage par le service IA Lovable :
 * ce fichier n'utilise ni LOVABLE_API_KEY ni ai.gateway.lovable.dev.
 * La clé n'est jamais renvoyée, journalisée ni stockée.
 */

export const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export class OpenAiError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind: "rate_limit" | "quota" | "auth" | "bad_request" | "server" | "network",
    public retryAfterSec: number | null = null,
  ) {
    super(message);
  }
}

export type SensitivityAnswer = {
  sensitive: boolean;
  hidden_for: "male" | "female" | "none";
  confidence: "high" | "medium" | "low";
  reason: string;
  detected_concepts: string[];
};

const itemProps = {
  sensitive: { type: "boolean" },
  hidden_for: { type: "string", enum: ["male", "female", "none"] },
  confidence: { type: "string", enum: ["high", "medium", "low"] },
  reason: { type: "string" },
  detected_concepts: { type: "array", items: { type: "string" } },
};
const itemReq = ["sensitive", "hidden_for", "confidence", "reason", "detected_concepts"];

export const VISION_SCHEMA = { type: "object", additionalProperties: false, required: itemReq, properties: itemProps };
export const TEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", ...itemReq],
        properties: { id: { type: "string" }, ...itemProps },
      },
    },
  },
};

function key(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new OpenAiError("Clé OpenAI non configurée (OPENAI_API_KEY).", 401, "auth");
  return k;
}

export async function openAiJson(opts: {
  model: string;
  system: string;
  user: unknown[] | string;
  schemaName: string;
  schema: object;
}): Promise<{ json: any; tokensIn: number | null; tokensOut: number | null; status: number }> {
  let res: Response;
  try {
    res = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: { type: "json_schema", json_schema: { name: opts.schemaName, strict: true, schema: opts.schema } },
      }),
    });
  } catch (e) {
    if (e instanceof OpenAiError) throw e;
    throw new OpenAiError("Réseau OpenAI indisponible", 0, "network");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let code = "";
    let msg = "";
    try {
      const j = JSON.parse(body);
      code = j?.error?.code ?? j?.error?.type ?? "";
      msg = j?.error?.message ?? "";
    } catch { /* ignore */ }
    const ra = Number(res.headers.get("retry-after"));
    const safe = msg.replace(/sk-[A-Za-z0-9_-]+/g, "sk-***").slice(0, 200);
    if (res.status === 429 && code === "insufficient_quota")
      throw new OpenAiError("Quota OpenAI épuisé sur votre compte OpenAI.", 429, "quota");
    if (res.status === 429) throw new OpenAiError("Limite OpenAI atteinte (429).", 429, "rate_limit", Number.isFinite(ra) && ra > 0 ? ra : null);
    if (res.status === 401 || res.status === 403) throw new OpenAiError(`Clé OpenAI refusée (${res.status}). ${safe}`, res.status, "auth");
    if (res.status >= 500) throw new OpenAiError(`Erreur serveur OpenAI (${res.status})`, res.status, "server");
    throw new OpenAiError(`Requête OpenAI invalide (${res.status}). ${safe}`, res.status, "bad_request");
  }
  const j = await res.json();
  const choice = j?.choices?.[0]?.message;
  if (choice?.refusal) throw new OpenAiError(`Refus OpenAI : ${String(choice.refusal).slice(0, 150)}`, 200, "bad_request");
  let json: any = null;
  try { json = JSON.parse(choice?.content ?? ""); } catch { json = null; }
  return { json, tokensIn: j?.usage?.prompt_tokens ?? null, tokensOut: j?.usage?.completion_tokens ?? null, status: res.status };
}
