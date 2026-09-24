// Contrôles automatiques avant validation d'un produit importé depuis CJ.
// Retourne la liste des raisons « À vérifier » (vide = conforme).

const SUPPLIER_RE = /(cjdropshipping|cjdrop|cj-?dropshipping|alicdn|1688\.com|taobao|aliexpress)/i;
const URL_RE = /https?:\/\//i;

export type AutoValidationInput = {
  name: string | null;
  galleryCount: number;
  costPrice: number | null;
  salePrice: number | null;
  variantsTotal: number;
  variantsImported: number;
  variants: Array<{ weightKg: number | null; cbm: number | null; sku: string | null }>;
  sku: string | null;
  categoryId: string | null;
  publicClean: boolean;
  descriptionHtml: string | null;
};

export function evaluateCjAutoValidation(i: AutoValidationInput): string[] {
  const r: string[] = [];
  if (!i.name || !i.name.trim()) r.push("Nom absent");
  if (i.galleryCount <= 0) r.push("Image principale absente");
  if (i.costPrice == null || !(i.costPrice > 0)) r.push("Prix d'achat absent");
  if (i.salePrice == null || !(i.salePrice > 0)) r.push("Prix de vente non calculé");
  if (i.variantsTotal <= 0 || i.variantsImported <= 0) r.push("Aucune variante valide");
  else if (i.variantsImported < i.variantsTotal) r.push(`${i.variantsTotal - i.variantsImported} variante(s) non importée(s)`);
  if (!i.sku || !i.sku.trim()) r.push("Référence (SKU) absente");
  const noWeight = i.variants.filter((v) => v.weightKg == null || !(v.weightKg > 0)).length;
  if (noWeight) r.push(`Poids manquant sur ${noWeight} variante(s)`);
  const noDims = i.variants.filter((v) => v.cbm == null || !(v.cbm > 0)).length;
  if (noDims) r.push(`Dimensions manquantes sur ${noDims} variante(s)`);
  const noVarSku = i.variants.filter((v) => !v.sku).length;
  if (noVarSku) r.push(`SKU manquant sur ${noVarSku} variante(s)`);
  if (!i.categoryId) r.push("Catégorie à attribuer");
  if (!i.publicClean) r.push("Référence fournisseur visible dans la fiche publique");
  const d = i.descriptionHtml ?? "";
  if (URL_RE.test(d) || SUPPLIER_RE.test(d)) r.push("Description non nettoyée (lien fournisseur)");
  return r;
}
