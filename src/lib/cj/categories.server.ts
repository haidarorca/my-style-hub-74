// ═══════════════════════════════════════════════════════════════
// Catégories CJ → catégories KawZone — SERVEUR UNIQUEMENT
//
// Le mapping est mémorisé dans cj_category_map : une fois qu'un
// administrateur a associé une catégorie CJ à une catégorie KawZone,
// tous les imports suivants du même identifiant CJ l'utilisent
// automatiquement. Aucune catégorie n'est devinée.
// ═══════════════════════════════════════════════════════════════

export interface CategoryResolution {
  cjCategoryId: string | null;
  cjCategoryName: string | null;
  cjCategoryPath: string | null;
  kawzoneCategoryId: string | null;
  status: "mapped" | "pending";
  /** Explication affichée à l'administrateur quand rien n'est mappé. */
  reason: string | null;
}

/**
 * Résout la catégorie KawZone d'un produit CJ.
 * Enregistre systématiquement la catégorie CJ rencontrée pour qu'elle
 * apparaisse dans l'écran de correspondance, même sans équivalent.
 */
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
    status: "pending",
    reason: null,
  };

  if (!cjCategoryId) {
    return { ...base, reason: "CJ n'a fourni aucun identifiant de catégorie pour ce produit." };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  const { data: row } = await admin
    .from("cj_category_map")
    .select("kawzone_category_id")
    .eq("cj_category_id", cjCategoryId)
    .maybeSingle();

  if (row?.kawzone_category_id) {
    return { ...base, kawzoneCategoryId: row.kawzone_category_id, status: "mapped" };
  }

  // On mémorise la catégorie CJ rencontrée (sans équivalent pour l'instant).
  await admin.from("cj_category_map").upsert(
    {
      cj_category_id: cjCategoryId,
      cj_category_name: cjCategoryName,
      cj_category_path: cjCategoryPath,
      kawzone_category_id: null,
      status: "pending",
    },
    { onConflict: "cj_category_id" },
  );

  return {
    ...base,
    reason: `Catégorie à attribuer : « ${cjCategoryPath ?? cjCategoryName ?? cjCategoryId} » n'a pas encore de correspondance KawZone.`,
  };
}
