// ═══════════════════════════════════════════════════════════════
// Matière d'un produit CJ — jamais inventée.
//
// Constat sur les réponses réelles de /product/query :
//  • materialNameEn / materialNameEnSet (et materialName en chinois) est une
//    CLASSE grossière choisie dans une liste fixe par le fournisseur :
//    Cloth, Metal, Plastic, Leather, Others… Elle est souvent imprécise
//    (ex. « Plastic » pour un velours spandex).
//  • La matière précise, quand elle existe, est écrite par le fournisseur dans
//    la description (« Material: 100% cotton », « Fabric: Polyester »…).
//
// Règle : 1) matière déclarée dans la description, 2) sinon classe CJ si elle
// est significative (jamais « Others »), 3) sinon vide. Traduction française
// par dictionnaire fermé : un terme inconnu est conservé tel quel.
// ═══════════════════════════════════════════════════════════════

export interface MaterialResult {
  /** Valeur affichée (français quand le terme est connu). */
  value: string | null;
  /** Origine de la valeur. */
  source: "description" | "cj_class" | null;
  /** Classe(s) CJ brutes (anglais), pour l'admin. */
  cjClass: string[];
}

const LABELS = /^(material|materials|fabric|fabric name|main material|composition|material composition|shell material|upper material|matière|matériau|matériaux|tissu)$/i;

const FR: Record<string, string> = {
  cloth: "Tissu", fabric: "Tissu", cotton: "Coton", polyester: "Polyester", nylon: "Nylon",
  spandex: "Élasthanne", elastane: "Élasthanne", lycra: "Élasthanne", viscose: "Viscose", rayon: "Rayonne",
  linen: "Lin", silk: "Soie", wool: "Laine", cashmere: "Cachemire", velvet: "Velours", denim: "Denim",
  acrylic: "Acrylique", modal: "Modal", chiffon: "Mousseline", lace: "Dentelle", plush: "Peluche",
  fleece: "Polaire", mesh: "Maille filet", knit: "Tricot", satin: "Satin", canvas: "Toile",
  metal: "Métal", "stainless steel": "Acier inoxydable", steel: "Acier", iron: "Fer", aluminum: "Aluminium",
  aluminium: "Aluminium", alloy: "Alliage", "zinc alloy": "Alliage de zinc", copper: "Cuivre", brass: "Laiton",
  silver: "Argent", "925 silver": "Argent 925", "sterling silver": "Argent 925", gold: "Or", titanium: "Titane",
  plastic: "Plastique", abs: "ABS", pp: "PP", pvc: "PVC", pc: "PC", pet: "PET", resin: "Résine",
  silicone: "Silicone", rubber: "Caoutchouc", eva: "EVA", tpu: "TPU", tpr: "TPR", acrylic_: "Acrylique",
  leather: "Cuir", "pu leather": "Cuir PU", pu: "PU", "genuine leather": "Cuir véritable", suede: "Daim",
  "microfiber leather": "Cuir microfibre", microfiber: "Microfibre",
  wood: "Bois", bamboo: "Bambou", paper: "Papier", cardboard: "Carton", glass: "Verre", ceramic: "Céramique",
  ceramics: "Céramique", porcelain: "Porcelaine", stone: "Pierre", marble: "Marbre", crystal: "Cristal",
  pearl: "Perle", cork: "Liège", foam: "Mousse", sponge: "Éponge", straw: "Paille", rattan: "Rotin",
  felt: "Feutre", jute: "Jute", sisal: "Sisal", "memory foam": "Mousse à mémoire de forme",
  "non-woven": "Non-tissé", "non-woven fabric": "Non-tissé", oxford: "Oxford", "oxford cloth": "Toile Oxford",
};

const NOT_A_MATERIAL = /^(others?|other|other materials|none|null|n\/a|-|其他|其他材料)$/i;

/** Traduit un terme connu, sinon le conserve (sans invention). */
export function translateMaterialTerm(term: string): string {
  const t = term.trim();
  const key = t.toLowerCase();
  if (FR[key]) return FR[key]!;
  // « 100% cotton », « 95% polyester 5% spandex » : on traduit mot à mot les
  // matières connues et on garde les pourcentages.
  return t.replace(/[a-zA-Z][a-zA-Z\- ]*[a-zA-Z]|[a-zA-Z]+/g, (w) => FR[w.toLowerCase()] ?? w);
}

function parseClass(raw: unknown): string[] {
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string" && raw.trim()) {
    try { const x = JSON.parse(raw); arr = Array.isArray(x) ? x : [raw]; } catch { arr = [raw]; }
  }
  return [...new Set(arr.map((x) => String(x ?? "").trim()).filter((x) => x && !NOT_A_MATERIAL.test(x)))];
}

export function resolveMaterial(
  specs: Array<{ label: string; value?: string | null }> | null | undefined,
  cjProduct: { materialNameEnSet?: unknown; materialNameEn?: unknown } | null | undefined,
): MaterialResult {
  const cjClass = parseClass(cjProduct?.materialNameEnSet ?? cjProduct?.materialNameEn);
  const declared = (specs ?? [])
    .filter((s) => LABELS.test(String(s.label ?? "").trim()) && s.value && String(s.value).trim())
    .map((s) => String(s.value).trim().replace(/[.;]+$/, ""))
    .filter((v) => v.length <= 120 && !NOT_A_MATERIAL.test(v));
  if (declared.length) {
    return { value: [...new Set(declared.map(translateMaterialTerm))].join(", "), source: "description", cjClass };
  }
  if (cjClass.length) {
    return { value: cjClass.map(translateMaterialTerm).join(", "), source: "cj_class", cjClass };
  }
  return { value: null, source: null, cjClass };
}
