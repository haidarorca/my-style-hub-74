// Ordre des images fournisseur (fonction pure).
// 1. image principale explicite CJ (productImage) ;
// 2. galerie CJ dans l'ordre fourni (productImageSet) ;
// 3. images extraites de la description.
// Doublons supprimés (même adresse, paramètres ignorés).
const norm = (u: string) => u.trim().split("?")[0]!.replace(/^http:/i, "https:").toLowerCase();

/**
 * CJ renvoie parfois une liste d'images encodée en texte JSON
 * (productImage = '["https://…","https://…"]'). On la décode.
 */
export function asImageList(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(asImageList);
  if (typeof v !== "string") return [];
  const t = v.trim();
  if (t.startsWith("[")) {
    try { return asImageList(JSON.parse(t)); } catch { /* texte brut */ }
  }
  return /^https?:\/\//i.test(t) ? [t] : [];
}

export function orderSupplierImages(
  main: unknown,
  gallery: unknown,
  descriptionImages: unknown = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: unknown) => {
    if (typeof u !== "string" || !/^https?:\/\//i.test(u.trim())) return;
    const k = norm(u);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(u.trim());
  };
  // Image principale = première image de productImage (liste ou valeur unique).
  for (const u of asImageList(main)) push(u);
  for (const u of asImageList(gallery)) push(u);
  for (const u of asImageList(descriptionImages)) push(u);
  return out;
}
