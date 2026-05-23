/**
 * admin-category-generator.functions.ts
 * -------------------------------------
 * Fonctions serveur pour la generation intelligente de catégories par IA.
 *
 * - detectCategories : Analyse les donnees produit et suggere une hierarchie
 *                      de catégories (rayon > categorie > sous-categorie)
 * - findExistingCategories : Cherche dans la base si les catégories existent deja
 * - createCategoryHierarchy : Cree les catégories manquantes en cascade
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface CategorySuggestion {
  name: string;
  level: 1 | 2 | 3;
  parent_name?: string; // Nom du parent suggere (pour l'affichage)
}

export interface CategoryDetectionResult {
  rayons: { name: string; existing_id?: string | null }[];
  categories: { name: string; parent_name: string; existing_id?: string | null }[];
  subcategories: { name: string; parent_name: string; existing_id?: string | null }[];
}

// ── 1. Détection IA des catégories ───────────────────────────

const DetectCategoriesSchema = z.object({
  name: z.string(),
  designation: z.string(),
  description: z.string(),
});

export const detectCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DetectCategoriesSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Assistant IA non configuré");

    // Prompt pour l'IA
    const prompt = `Tu es un expert en classification e-commerce pour l'Afrique de l'Ouest.

Analyse ce produit et propose la hierarchie de catégories la plus appropriée :

Nom : "${data.name}"
Designation : "${data.designation}"
Description : "${data.description}"

Reponds STRICTEMENT en JSON sans texte autour avec cette structure exacte :
{
  "rayon": "Nom du rayon (niveau 1, le plus general)",
  "categorie": "Nom de la categorie (niveau 2, plus specifique)",
  "sous_categorie": "Nom de la sous-categorie (niveau 3, le plus precis, ou null si pas necessaire)"
}

Regles :
- Utilise des noms courts et clairs en francais
- Le rayon doit etre tres general (ex: "Electronique", "Mode", "Maison", "Sport", "Auto", "Beaute", "Alimentation")
- La categorie doit etre plus specifique (ex: "Telephones", "Vetements", "Cuisine")
- La sous-categorie est optionnelle (peut etre null)
- N'utilise JAMAIS "Autres" ou "Divers"
- Privilegie les categories standards de e-commerce africain`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("Limite IA atteinte, réessayez.");
      if (res.status === 402) throw new Error("Crédits IA épuisés.");
      throw new Error(`Erreur IA (${res.status})`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = safeParseJson(raw);
    if (!parsed) throw new Error("Réponse IA illisible");

    return {
      rayon: typeof parsed.rayon === "string" ? parsed.rayon.trim() : "",
      categorie: typeof parsed.categorie === "string" ? parsed.categorie.trim() : "",
      sous_categorie: typeof parsed.sous_categorie === "string" ? parsed.sous_categorie.trim() : null,
    };
  });

// ── 2. Recherche des catégories existantes ───────────────────

export const findExistingCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      rayon_name: z.string(),
      categorie_name: z.string(),
      sous_categorie_name: z.string().nullable(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    // Normaliser les noms pour la recherche
    const normalize = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    const rayonNorm = normalize(data.rayon_name);
    const catNorm = normalize(data.categorie_name);
    const subNorm = data.sous_categorie_name ? normalize(data.sous_categorie_name) : null;

    // 1. Chercher les rayons existants (level 1)
    const { data: allCats } = await supabaseAdmin
      .from("categories")
      .select("id, name, level, parent_id")
      .order("position");

    const all = allCats ?? [];

    // Fonction de similarité simple
    const similarity = (a: string, b: string) => {
      const na = normalize(a);
      const nb = normalize(b);
      if (na === nb) return 1.0;
      if (na.includes(nb) || nb.includes(na)) return 0.8;
      // Distance de Levenshtein simplifiee
      const dist = levenshtein(na, nb);
      const maxLen = Math.max(na.length, nb.length);
      return 1 - dist / maxLen;
    };

    const SIMILARITY_THRESHOLD = 0.75;

    // Trouver le rayon le plus proche
    const rayons = all.filter((c) => c.level === 1);
    let matchedRayon = rayons.find((r) => similarity(r.name, data.rayon_name) >= SIMILARITY_THRESHOLD) ?? null;

    // Trouver la categorie la plus proche (sous le rayon trouve ou tous)
    const categories = all.filter(
      (c) => c.level === 2 && (!matchedRayon || c.parent_id === matchedRayon.id),
    );
    let matchedCategorie = categories.find(
      (c) => similarity(c.name, data.categorie_name) >= SIMILARITY_THRESHOLD,
    ) ?? null;

    // Si pas trouve sous le rayon, chercher partout
    if (!matchedCategorie) {
      const allCategories = all.filter((c) => c.level === 2);
      matchedCategorie = allCategories.find(
        (c) => similarity(c.name, data.categorie_name) >= SIMILARITY_THRESHOLD,
      ) ?? null;
    }

    // Trouver la sous-categorie
    let matchedSub = null;
    if (subNorm && matchedCategorie) {
      const subcats = all.filter(
        (c) => c.level === 3 && c.parent_id === matchedCategorie!.id,
      );
      matchedSub = subcats.find(
        (c) => similarity(c.name, data.sous_categorie_name!) >= SIMILARITY_THRESHOLD,
      ) ?? null;
    }

    return {
      rayon: matchedRayon,
      categorie: matchedCategorie,
      sous_categorie: matchedSub,
      all_rayons: rayons.map((r) => ({ id: r.id, name: r.name })),
    };
  });

// ── 3. Création des catégories ──────────────────────────────

export const createCategoryHierarchy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      rayon_name: z.string().min(1).max(80),
      categorie_name: z.string().min(1).max(80),
      sous_categorie_name: z.string().max(80).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    // Verifier les doublons exacts avant creation
    const { data: existing } = await supabaseAdmin
      .from("categories")
      .select("id, name, level, parent_id")
      .in("name", [data.rayon_name, data.categorie_name, data.sous_categorie_name].filter(Boolean));

    const allExisting = existing ?? [];

    let rayonId: string;
    let categorieId: string;
    let sousCategorieId: string | null = null;

    // 1. Creer le rayon (level 1)
    const existingRayon = allExisting.find(
      (c) => c.level === 1 && c.name.toLowerCase() === data.rayon_name.toLowerCase(),
    );
    if (existingRayon) {
      rayonId = existingRayon.id;
    } else {
      const { data: newRayon, error } = await supabaseAdmin
        .from("categories")
        .insert({
          name: data.rayon_name,
          level: 1,
          parent_id: null,
          position: 999,
          is_universe: true,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Erreur creation rayon: ${error.message}`);
      rayonId = newRayon!.id;
    }

    // 2. Creer la categorie (level 2)
    const existingCat = allExisting.find(
      (c) => c.level === 2 && c.name.toLowerCase() === data.categorie_name.toLowerCase(),
    );
    if (existingCat) {
      categorieId = existingCat.id;
    } else {
      const { data: newCat, error } = await supabaseAdmin
        .from("categories")
        .insert({
          name: data.categorie_name,
          level: 2,
          parent_id: rayonId,
          position: 999,
          is_universe: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Erreur creation categorie: ${error.message}`);
      categorieId = newCat!.id;
    }

    // 3. Creer la sous-categorie (level 3) si fournie
    if (data.sous_categorie_name) {
      const existingSub = allExisting.find(
        (c) =>
          c.level === 3 &&
          c.name.toLowerCase() === data.sous_categorie_name!.toLowerCase() &&
          c.parent_id === categorieId,
      );
      if (existingSub) {
        sousCategorieId = existingSub.id;
      } else {
        const { data: newSub, error } = await supabaseAdmin
          .from("categories")
          .insert({
            name: data.sous_categorie_name,
            level: 3,
            parent_id: categorieId,
            position: 999,
            is_universe: false,
          })
          .select("id")
          .single();
        if (error) throw new Error(`Erreur creation sous-categorie: ${error.message}`);
        sousCategorieId = newSub!.id;
      }
    }

    return {
      rayon_id: rayonId,
      categorie_id: categorieId,
      sous_categorie_id: sousCategorieId,
      created: {
        rayon: !allExisting.find((c) => c.level === 1 && c.name.toLowerCase() === data.rayon_name.toLowerCase()),
        categorie: !allExisting.find((c) => c.level === 2 && c.name.toLowerCase() === data.categorie_name.toLowerCase()),
        sous_categorie: data.sous_categorie_name
          ? !allExisting.find(
              (c) => c.level === 3 && c.name.toLowerCase() === data.sous_categorie_name!.toLowerCase(),
            )
          : false,
      },
    };
  });

// ── Util : Distance de Levenshtein ──────────────────────────

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b.charAt(i - 1) === a.charAt(j - 1)
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}
