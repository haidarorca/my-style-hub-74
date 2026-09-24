// ═══════════════════════════════════════════════════════════════
// Transformation de la description fournisseur en données structurées.
//
// Fonction PURE (aucune dépendance serveur). Résultat :
//  • imageUrls  : images trouvées (elles partent dans la galerie) ;
//  • text       : description lisible en texte (paragraphes, listes « • »),
//                 SANS aucune balise HTML — c'est ce qui est publié ;
//  • specs      : caractéristiques « Libellé : valeur » (matière, style…),
//                 affichées séparément dans « Caractéristiques » ;
//  • html       : alias historique de `text` (compatibilité).
// ═══════════════════════════════════════════════════════════════

export const SUPPLIER_PATTERN = /cjdropshipping|cjdropship\.com/i;

export interface ProductSpec {
  label: string;
  value: string;
}

export interface ParsedDescription {
  imageUrls: string[];
  /** Texte public propre (aucune balise). null si rien d'utile. */
  html: string | null;
  text: string;
  specs: ProductSpec[];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

/** Titres de section fournisseur sans valeur pour le client. */
const SECTION_HEADING =
  /^(product\s*(information|info|details?|description)|specifications?|overview|features?|description|details?|product\s*image[s]?|detail\s*image[s]?|pictures?|产品信息|产品图片|细节图)\s*[:：]?\s*$/i;

/** Lignes à ne jamais publier (logistique fournisseur, notes internes). */
const DROP_LINE =
  /(fastest\s*shipping|shipping\s*time|please\s*consult|customer\s*service|warehouse|dropship|wholesale|moq\b|sku\s*[:：]|note\s*[:：].*(manual|measure|difference|monitor)|due to (the )?(manual|light|monitor))/i;

/** Transforme un HTML (ou texte) quelconque en lignes de texte propres. */
export function htmlToLines(input: string): string[] {
  let out = input;
  out = out.replace(/<(script|style|iframe|video|audio|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  out = out.replace(/<img\b[^>]*>/gi, " ");
  out = out.replace(/<li\b[^>]*>/gi, "\n• ");
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|table|section)>/gi, "\n");
  out = out.replace(/<(p|div|ul|ol|h[1-6]|tr|table|section)\b[^>]*>/gi, "\n");
  out = out.replace(/<[^>]+>/g, " ");
  out = decodeEntities(out);
  // Une balise encodée (&lt;p&gt;) peut réapparaître après décodage.
  out = out.replace(/<\/?[a-z][^>]*>/gi, " ");
  out = out.replace(/https?:\/\/[^\s"'<>]+/gi, " ");
  out = out.replace(/cjdropshipping(\.com|\.cn)?/gi, " ");
  return out
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((l) => l && l !== "•");
}

/** Texte lisible à partir d'un contenu potentiellement HTML (affichage défensif). */
export function toReadableText(input: string | null | undefined): string {
  if (!input) return "";
  if (!/<[a-z!/]|&[a-z#]+;/i.test(input)) return input.trim();
  return htmlToLines(input).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function parseSpec(line: string): ProductSpec | null {
  const m = /^([^:：]{2,40})[:：]\s*(.+)$/.exec(line.replace(/^•\s*/, ""));
  if (!m) return null;
  const label = m[1]!.trim();
  const value = m[2]!.trim();
  if (!value || value.length > 220) return null;
  // Une phrase avec deux-points (« 1. SOFT: This shoe is… ») reste de la description.
  if (/^\d+[.)]/.test(label) || label.split(/\s+/).length > 6) return null;
  if (label === label.toUpperCase() && /[A-Z]{4,}/.test(label) && value.split(/\s+/).length > 6) return null;
  const cap = label.charAt(0).toUpperCase() + label.slice(1);
  return { label: cap, value };
}

export function parseSupplierDescription(input: string | null | undefined): ParsedDescription {
  const imageUrls: string[] = [];
  if (!input || typeof input !== "string") return { imageUrls, html: null, text: "", specs: [] };

  input.replace(/<img\b[^>]*>/gi, (tag) => {
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

  const specs: ProductSpec[] = [];
  const seen = new Set<string>();
  const body: string[] = [];
  for (const raw of htmlToLines(input)) {
    const line = raw.replace(/\s+([,.;:])/g, "$1");
    if (SECTION_HEADING.test(line)) continue;
    if (DROP_LINE.test(line)) continue;
    const spec = parseSpec(line);
    if (spec) {
      const k = spec.label.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        specs.push(spec);
      }
      continue;
    }
    if (body[body.length - 1] !== line) body.push(line);
  }

  const text = body.join("\n").trim();
  return { imageUrls, html: text || null, text, specs };
}
