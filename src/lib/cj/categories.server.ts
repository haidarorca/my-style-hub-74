// ═══════════════════════════════════════════════════════════════
// Catégories CJ → catégories KawZone — SERVEUR UNIQUEMENT
//
// 1. Si un administrateur a déjà associé cette catégorie CJ, on réutilise
//    sa correspondance (priorité absolue).
// 2. Sinon on tente une correspondance automatique à partir du chemin CJ
//    (« Women's Clothing > Underwears > Bras ») traduit vers l'arbre
//    KawZone, niveau par niveau. Rien n'est inventé : seuls des noms
//    réellement proches sont retenus.
// 3. Si aucun niveau ne correspond : « Catégorie à attribuer », la
//    catégorie CJ restant mémorisée pour l'écran de correspondance.
// ═══════════════════════════════════════════════════════════════
import { matchCjCategoryPath, type FlatCategory } from "./category-match";

export interface CategoryResolution {
  cjCategoryId: string | null;
  cjCategoryName: string | null;
  cjCategoryPath: string | null;
  kawzoneCategoryId: string | null;
  /** Chaîne KawZone retenue (catégorie › sous-catégorie › sous-sous-catégorie). */
  kawzoneChain: string[];
  /** Segments CJ sans équivalent KawZone. */
  unresolved: string[];
  status: "mapped" | "auto" | "pending";
  /** Explication affichée à l'administrateur. */
  reason: string | null;
}

export async function resolveCjCategory(
  cjCategoryId: string | null,
  cjCategoryName: string | null,
  cjCategoryPath: string | null,
): Promise<CategoryResolution> {
  const base: CategoryResolution = {
    cjCategoryId,
    cjCategoryName,
    cjCategoryPath,
    kawzoneCategoryId: null,
    kawzoneChain: [],
    unresolved: [],
    status: "pending",
    reason: null,
  };

  const path = cjCategoryPath ?? cjCategoryName ?? null;
  if (!cjCategoryId && !path) {
    return { ...base, reason: "CJ n'a fourni aucune catégorie pour ce produit." };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  // ── 1. Correspondance déjà validée par un administrateur ──────
  if (cjCategoryId) {
    const { data: row } = await admin
      .from("cj_category_map")
      .select("kawzone_category_id, status")
      .eq("cj_category_id", cjCategoryId)
      .maybeSingle();
    if (row?.kawzone_category_id && row.status === "mapped") {
      const chain = await chainNames(admin, row.kawzone_category_id);
      return {
        ...base,
        kawzoneCategoryId: row.kawzone_category_id,
        kawzoneChain: chain,
        status: "mapped",
      };
    }
  }

  // ── 2. Correspondance automatique sur le chemin CJ ────────────
  const { data: cats } = await admin
    .from("categories")
    .select("id, name, parent_id, level");
  const match = matchCjCategoryPath(path, (cats ?? []) as FlatCategory[]);

  const status: CategoryResolution["status"] = match.categoryId ? "auto" : "pending";
  const reason = match.categoryId
    ? match.unresolved.length
      ? `Correspondance partielle : « ${match.chainNames.join(" › ")} ». Niveau(x) à attribuer : ${match.unresolved.join(" › ")}.`
      : null
    : `Catégorie à attribuer : « ${path} » n'a aucune correspondance KawZone.`;

  if (cjCategoryId) {
    await admin.from("cj_category_map").upsert(
      {
        cj_category_id: cjCategoryId,
        cj_category_name: cjCategoryName,
        cj_category_path: cjCategoryPath,
        kawzone_category_id: match.categoryId,
        status,
      },
      { onConflict: "cj_category_id" },
    );
  }

  return {
    ...base,
    kawzoneCategoryId: match.categoryId,
    kawzoneChain: match.chainNames,
    unresolved: match.unresolved,
    status,
    reason,
  };
}

/** Remonte la chaîne de noms d'une catégorie KawZone (racine → feuille). */
async function chainNames(admin: any, categoryId: string): Promise<string[]> {
  const names: string[] = [];
  let current: string | null = categoryId;
  for (let i = 0; i < 5 && current; i++) {
    const { data } = await admin
      .from("categories")
      .select("name, parent_id")
      .eq("id", current)
      .maybeSingle();
    if (!data) break;
    names.unshift(data.name);
    current = data.parent_id;
  }
  return names;
}
