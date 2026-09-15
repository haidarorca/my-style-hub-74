/**
 * ai-classifier.functions.ts
 * --------------------------
 * Classification IA d'un produit dans le catalogue EXISTANT.
 *
 * Règle absolue : l'IA ne peut que LIRE et PROPOSER des catégories déjà
 * présentes en base. Aucune création / renommage / suppression possible ici.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildPaths,
  preselect,
  tokenize,
  expandTokens,
  type CatNode,
} from "./ai-classifier.server";

const ClassifySchema = z.object({
  name: z.string().max(300).optional(),
  designation: z.string().max(500).optional(),
  description: z.string().max(20000).optional(),
  brand: z.string().max(200).optional(),
  keywords: z.string().max(1000).optional(),
  attributes: z.string().max(4000).optional(),
  image_data_urls: z.array(z.string()).max(4).optional(),
});

export interface CategorySuggestionItem {
  category_id: string;
  label: string;
  level1: { id: string; name: string } | null;
  level2: { id: string; name: string } | null;
  level3: { id: string; name: string } | null;
  confidence: number;
  reason: string;
}

function safeParseJson(raw: string): unknown {
  try {
    const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

export const classifyProductCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ClassifySchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Assistant IA non configuré");

    const productText = [
      data.name,
      data.designation,
      data.brand,
      data.keywords,
      data.attributes,
      data.description,
    ]
      .filter(Boolean)
      .join(" \n ");

    const hasImages = (data.image_data_urls ?? []).some((u) => /^data:image\//.test(u));
    if (!productText.trim() && !hasImages) {
      throw new Error("Renseignez au moins un nom, une description ou une image.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("categories")
      .select("id, name, level, parent_id")
      .order("position");
    if (error) throw new Error(`Lecture catégories impossible: ${error.message}`);

    const nodes = (rows ?? []) as CatNode[];
    if (nodes.length === 0) {
      return { suggestions: [] as CategorySuggestionItem[], reliable: false, candidates: 0 };
    }

    // Signal d'apprentissage : corrections passées des administrateurs
    const boosts = new Map<string, number>();
    const { data: feedback } = await supabaseAdmin
      .from("category_classification_feedback")
      .select("signals, chosen_category_id")
      .order("created_at", { ascending: false })
      .limit(400);

    if (feedback && feedback.length > 0) {
      const pTokens = expandTokens(tokenize(productText));
      for (const f of feedback) {
        const fTokens = tokenize(String(f.signals ?? ""));
        let overlap = 0;
        for (const t of fTokens) if (pTokens.has(t)) overlap++;
        if (overlap >= 2) {
          boosts.set(
            f.chosen_category_id as string,
            (boosts.get(f.chosen_category_id as string) ?? 0) + Math.min(overlap, 6),
          );
        }
      }
    }

    const paths = buildPaths(nodes);
    const candidates = preselect(paths, productText, boosts, 30);

    const list = candidates
      .map((c, i) => `${i + 1}. ${c.label}`)
      .join("\n");

    const prompt = `Tu es un expert du catalogage e-commerce. Tu dois RANGER un produit dans un catalogue EXISTANT.

INTERDICTION ABSOLUE : tu ne peux pas inventer, créer ou renommer une catégorie.
Tu dois choisir UNIQUEMENT parmi la liste numérotée ci-dessous, telle quelle.

Informations du produit :
${productText || "(aucun texte, base-toi sur les images)"}

Catégories existantes candidates (chemin complet Catégorie > Sous-catégorie > Sous-sous-catégorie) :
${list}

Analyse le sens du produit (synonymes, traductions FR/EN, variantes commerciales, fautes d'orthographe) et classe les 3 meilleures correspondances.

Réponds STRICTEMENT en JSON, sans texte autour :
{"matches":[{"index":1,"confidence":94,"reason":"courte justification en français"}]}

Règles :
- "index" = numéro exact d'une ligne de la liste.
- "confidence" = entier 0-100 (probabilité réelle que ce soit la bonne catégorie).
- Maximum 3 éléments, triés du plus probable au moins probable.
- Si aucune catégorie de la liste ne correspond vraiment, renvoie {"matches":[]}.`;

    type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
    const parts: ContentPart[] = [{ type: "text", text: prompt }];
    for (const url of data.image_data_urls ?? []) {
      if (/^data:image\//.test(url)) parts.push({ type: "image_url", image_url: { url } });
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: parts }],
      }),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("Limite IA atteinte, réessayez dans un instant.");
      if (res.status === 402) throw new Error("Crédits IA épuisés. Ajoutez des crédits pour continuer.");
      throw new Error(`Erreur IA (${res.status})`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = safeParseJson(raw) as { matches?: Array<{ index?: number; confidence?: number; reason?: string }> } | null;
    const matches = Array.isArray(parsed?.matches) ? parsed!.matches! : [];

    const suggestions: CategorySuggestionItem[] = [];
    for (const m of matches.slice(0, 3)) {
      const idx = Number(m.index) - 1;
      const c = candidates[idx];
      if (!c) continue; // index hors liste => ignoré (aucune invention possible)
      const conf = Math.max(0, Math.min(100, Math.round(Number(m.confidence) || 0)));
      suggestions.push({
        category_id: c.id,
        label: c.label,
        level1: c.level1,
        level2: c.level2,
        level3: c.level3,
        confidence: conf,
        reason: typeof m.reason === "string" ? m.reason.slice(0, 200) : "",
      });
    }

    return {
      suggestions,
      reliable: suggestions.length > 0 && (suggestions[0]?.confidence ?? 0) >= 70,
      candidates: candidates.length,
    };
  });

// ── Apprentissage : enregistrer la correction de l'administrateur ──

const FeedbackSchema = z.object({
  signals: z.string().min(1).max(2000),
  suggested_category_id: z.string().uuid().nullable().optional(),
  chosen_category_id: z.string().uuid(),
});

export const recordClassificationFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FeedbackSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // La catégorie choisie DOIT exister : aucune création implicite.
    const { data: cat } = await supabaseAdmin
      .from("categories")
      .select("id")
      .eq("id", data.chosen_category_id)
      .maybeSingle();
    if (!cat) throw new Error("Catégorie inconnue");

    await supabaseAdmin.from("category_classification_feedback").insert({
      signals: data.signals.slice(0, 2000),
      suggested_category_id: data.suggested_category_id ?? null,
      chosen_category_id: data.chosen_category_id,
      was_correction: (data.suggested_category_id ?? null) !== data.chosen_category_id,
      created_by: context.userId,
    });

    return { ok: true };
  });
