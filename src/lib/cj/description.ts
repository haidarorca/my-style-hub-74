// ═══════════════════════════════════════════════════════════════
// Transformation de la description fournisseur en données structurées.
//
// Fonction PURE (aucune dépendance serveur) : on sépare le contenu
// textuel utile des images. Les images ne restent JAMAIS dans la
// description : elles partent dans la galerie du produit.
// ═══════════════════════════════════════════════════════════════

export const SUPPLIER_PATTERN = /cjdropshipping|cjdropship\.com/i;

export interface ParsedDescription {
  /** Adresses d'images trouvées dans la description, dans l'ordre. */
  imageUrls: string[];
  /** Contenu textuel nettoyé (HTML minimal : p, br, ul, li, strong, em). */
  html: string | null;
  /** Même contenu en texte brut (utile pour les contrôles). */
  text: string;
}

/** Étiquettes qui ne servent qu'à introduire les images : on les retire. */
const IMAGE_LABELS = [
  /product\s*image[s]?\s*:?/gi,
  /detail\s*image[s]?\s*:?/gi,
  /picture[s]?\s*:?\s*$/gim,
  /产品图片[:：]?/g,
  /细节图[:：]?/g,
];

const ALLOWED_TAGS = new Set(["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "h3", "h4"]);

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Sépare la description fournisseur en (1) adresses d'images et
 * (2) contenu textuel propre, sans balise <img>, sans adresse, sans
 * référence au fournisseur.
 */
export function parseSupplierDescription(input: string | null | undefined): ParsedDescription {
  const imageUrls: string[] = [];
  if (!input || typeof input !== "string") return { imageUrls, html: null, text: "" };

  let out = input;

  // 1. Récupérer puis supprimer toutes les images.
  out = out.replace(/<img\b[^>]*>/gi, (tag) => {
    const src =
      /\bsrc\s*=\s*"([^"]+)"/i.exec(tag)?.[1] ??
      /\bsrc\s*=\s*'([^']+)'/i.exec(tag)?.[1] ??
      /\bdata-src\s*=\s*"([^"]+)"/i.exec(tag)?.[1] ??
      /\bdata-src\s*=\s*'([^']+)'/i.exec(tag)?.[1] ??
      null;
    if (src) {
      const clean = decodeEntities(src).trim();
      if (/^https?:\/\//i.test(clean) && !imageUrls.includes(clean)) imageUrls.push(clean);
    }
    return " ";
  });

  // 2. Supprimer les éléments non textuels et les liens.
  out = out.replace(/<(script|style|iframe|video|audio|source|link|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  out = out.replace(/<(script|style|iframe|video|audio|source|link|svg|picture)\b[^>]*\/?>/gi, " ");
  out = out.replace(/<a\b[^>]*>|<\/a>/gi, " ");

  // 3. Ne garder que les balises de mise en forme, sans aucun attribut.
  out = out.replace(/<\/?([a-zA-Z0-9]+)\b[^>]*>/g, (_m, raw: string) => {
    const tag = raw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return tag === "div" || tag === "table" || tag === "tr" ? "\n" : " ";
    const closing = /^<\//.test(_m);
    if (tag === "br") return "<br />";
    return closing ? `</${tag}>` : `<${tag}>`;
  });

  // 4. Adresses restées en texte brut et références fournisseur.
  out = out.replace(/https?:\/\/[^\s"'<>]+/gi, " ");
  out = out.replace(/cjdropshipping(\.com|\.cn)?/gi, " ");

  // 5. Étiquettes d'introduction d'images devenues inutiles.
  for (const re of IMAGE_LABELS) out = out.replace(re, " ");

  out = decodeEntities(out);

  // 6. Nettoyage final : espaces, balises vides, sauts multiples.
  out = out.replace(/[ \t\u00a0]+/g, " ");
  out = out.replace(/\s*\n\s*/g, "\n");
  out = out.replace(/(<br \/>\s*){3,}/g, "<br /><br />");
  for (let i = 0; i < 3; i += 1) {
    out = out.replace(/<(p|li|ul|ol|strong|b|em|i|h3|h4)>\s*<\/\1>/gi, " ");
  }
  out = out.replace(/\n{3,}/g, "\n\n").trim();

  const text = out.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { imageUrls, html: text ? out : null, text };
}
