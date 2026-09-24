// Ordre des images fournisseur (fonction pure).
// 1. image principale explicite CJ (productImage) ;
// 2. galerie CJ dans l'ordre fourni (productImageSet) ;
// 3. images extraites de la description.
// Doublons supprimés (même adresse, paramètres ignorés).
const norm = (u: string) => u.trim().split("?")[0]!.replace(/^http:/i, "https:").toLowerCase();

export function orderSupplierImages(
  main: string | null | undefined,
  gallery: readonly string[] | null | undefined,
  descriptionImages: readonly string[] | null | undefined = [],
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
  push(main);
  for (const u of gallery ?? []) push(u);
  for (const u of descriptionImages ?? []) push(u);
  return out;
}
