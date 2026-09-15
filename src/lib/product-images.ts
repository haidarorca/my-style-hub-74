// Synchronisation des images produit : suppression, renumérotation et ajout.
//
// Bug corrigé : lorsqu'on supprimait/remplaçait l'image principale, les images
// restantes gardaient leur ancienne position et les nouvelles images étaient
// insérées à des positions déjà occupées. L'ordre devenait ambigu et l'ancienne
// image continuait d'apparaître comme visuel principal.

import { supabase } from "@/integrations/supabase/client";

export const PRODUCT_IMAGES_BUCKET = "product-images";

export interface ExistingProductImage {
  id: string;
  url: string;
  position?: number | null;
}

/**
 * Applique l'état voulu de la galerie :
 *  1. supprime les lignes retirées,
 *  2. renumérote les images conservées (0..n-1, dans l'ordre affiché),
 *  3. téléverse et insère les nouvelles images à la suite.
 */
export async function syncProductImages(opts: {
  productId: string;
  /** Dossier de stockage (généralement l'id du vendeur/boutique). */
  folder: string;
  /** Images conservées, dans l'ordre d'affichage souhaité. */
  keptImages: ExistingProductImage[];
  /** Ids des images supprimées par l'utilisateur. */
  removedImageIds: string[];
  /** Nouveaux fichiers à ajouter, dans l'ordre. */
  newFiles: File[];
}): Promise<void> {
  const { productId, folder, keptImages, removedImageIds, newFiles } = opts;

  if (removedImageIds.length > 0) {
    const { error } = await supabase.from("product_images").delete().in("id", removedImageIds);
    if (error) throw error;
  }

  // Renumérotation : indispensable pour que la 1re image affichée soit la principale.
  for (let i = 0; i < keptImages.length; i++) {
    const img = keptImages[i];
    if (img.position === i) continue;
    const { error } = await supabase.from("product_images").update({ position: i }).eq("id", img.id);
    if (error) throw error;
  }

  if (newFiles.length === 0) return;

  const rows: { product_id: string; url: string; position: number }[] = [];
  for (let i = 0; i < newFiles.length; i++) {
    const file = newFiles[i];
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${folder}/${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (upErr) throw upErr;
    const url = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
    rows.push({ product_id: productId, url, position: keptImages.length + i });
  }

  const { error: insErr } = await supabase.from("product_images").insert(rows);
  if (insErr) throw insErr;
}
