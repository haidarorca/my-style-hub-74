/**
 * Optimisation des images du catalogue.
 *
 * Les photos produits sont stockées telles quelles (souvent des PNG de
 * plusieurs méga-octets). Les afficher brutes rend le site très lourd sur
 * mobile. Le stockage sait redimensionner et convertir en WebP à la volée :
 * il suffit de passer par l'endpoint `render/image` au lieu de `object`.
 *
 * Règle : on ne touche qu'aux URLs publiques du stockage du projet ; toute
 * autre URL (CDN externe, data:, blob:) est renvoyée inchangée.
 */

const PUBLIC_OBJECT = "/storage/v1/object/public/";
const RENDER_IMAGE = "/storage/v1/render/image/public/";

function isTransformable(url: string): boolean {
  return url.includes(PUBLIC_OBJECT) && !url.includes(".svg");
}

/** Renvoie l'URL d'une version redimensionnée (WebP) de l'image. */
export function optimizedImage(
  url: string | null | undefined,
  width: number,
  quality = 72,
): string | undefined {
  if (!url) return undefined;
  if (!isTransformable(url)) return url;
  const base = url.split("?")[0].replace(PUBLIC_OBJECT, RENDER_IMAGE);
  return `${base}?width=${Math.round(width)}&quality=${quality}&resize=contain`;
}

/** Jeu de sources 1x / 2x pour les écrans à forte densité. */
export function imageSrcSet(
  url: string | null | undefined,
  width: number,
  quality = 72,
): string | undefined {
  if (!url || !isTransformable(url)) return undefined;
  const x1 = optimizedImage(url, width, quality);
  const x2 = optimizedImage(url, width * 2, quality);
  if (!x1 || !x2) return undefined;
  return `${x1} 1x, ${x2} 2x`;
}
