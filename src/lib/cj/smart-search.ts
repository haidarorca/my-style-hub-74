// ═══════════════════════════════════════════════════════════════
// Moteur de recherche intelligent CJ — logique pure (sans réseau, sans IA).
//
//  1. Normalisation (accents, casse, pluriels, mots vides FR/EN).
//  2. Correction orthographique légère (distance d'édition sur le vocabulaire).
//  3. Découpage en CONCEPTS : chaque mot utile devient un concept avec ses
//     équivalents anglais + synonymes (dictionnaire local).
//  4. Plan de requêtes progressif : exact → traduction → synonymes →
//     combinaisons → mot principal seul (élargissement).
//  5. Score de pertinence 0–100 sur le titre / catégorie CJ, avec rejet
//     des résultats hors sujet (un concept essentiel absent du titre).
// ═══════════════════════════════════════════════════════════════

const STOP = new Set([
  "de", "du", "des", "la", "le", "les", "l", "d", "un", "une", "pour", "en", "et", "a", "au", "aux", "avec", "sans", "sur", "par",
  "the", "for", "and", "of", "with", "to", "in", "on", "by", "an", "or", "set", "pcs", "pc", "new",
]);

/** Dictionnaire FR → EN (le premier terme est la traduction principale). */
const FR_EN: Record<string, string[]> = {
  // Cuisine / pâtisserie
  gateau: ["cake", "cupcake"], gateaux: ["cake"], patisserie: ["baking", "pastry", "cake"], patissier: ["baking", "pastry"],
  decoration: ["decoration", "decorating", "decor", "topper"], deco: ["decoration", "decor"], decorer: ["decorating"],
  moule: ["mold", "mould", "baking pan"], moules: ["mold"], douille: ["piping tip", "nozzle"], poche: ["piping bag", "bag"],
  cuisine: ["kitchen", "cooking"], ustensile: ["utensil", "tool"], ustensiles: ["utensils", "tools"], couteau: ["knife"],
  poele: ["frying pan", "pan"], casserole: ["pot", "saucepan"], assiette: ["plate"], verre: ["glass", "cup"], tasse: ["mug", "cup"],
  bouteille: ["bottle"], gourde: ["water bottle", "bottle"], boite: ["box", "container"], rangement: ["storage", "organizer"],
  bougie: ["candle"], anniversaire: ["birthday"], fete: ["party"], mariage: ["wedding"], ballon: ["balloon", "ball"],
  chocolat: ["chocolate"], sucre: ["sugar"], biscuit: ["cookie", "biscuit"], cafe: ["coffee"], the: ["tea"],
  // Téléphone / électronique
  coque: ["case", "cover"], etui: ["case", "cover", "pouch"], telephone: ["phone", "mobile phone", "smartphone"], portable: ["phone", "portable"],
  chargeur: ["charger"], cable: ["cable"], ecouteur: ["earphone", "earbuds", "headphone"], ecouteurs: ["earphones", "earbuds"],
  casque: ["headphone", "headset", "helmet"], montre: ["watch", "smartwatch"], connectee: ["smart"], intelligente: ["smart"],
  support: ["holder", "stand", "mount"], protection: ["protector", "protection"], ecran: ["screen"], batterie: ["battery", "power bank"],
  enceinte: ["speaker"], haut: ["speaker", "top"], parleur: ["speaker"], clavier: ["keyboard"], souris: ["mouse"], lampe: ["lamp", "light"],
  lumiere: ["light"], ampoule: ["bulb"], led: ["led"], camera: ["camera"], ordinateur: ["computer", "laptop"], tablette: ["tablet"],
  voiture: ["car"], auto: ["car", "auto"], moto: ["motorcycle"], velo: ["bike", "bicycle"],
  // Agriculture / jardin / solaire
  pompe: ["pump"], solaire: ["solar"], eau: ["water"], irrigation: ["irrigation", "drip"], arrosage: ["watering", "irrigation", "sprinkler"],
  filet: ["net", "netting", "mesh"], agricole: ["agricultural", "farm", "garden"], agriculture: ["agricultural", "farm", "farming"],
  ferme: ["farm"], jardin: ["garden"], jardinage: ["gardening", "garden"], serre: ["greenhouse"], graine: ["seed"], graines: ["seeds"],
  plante: ["plant"], plantes: ["plants"], pot: ["pot", "planter"], tuyau: ["hose", "pipe"], goutte: ["drip"], outil: ["tool"], outils: ["tools"],
  panneau: ["panel"], generateur: ["generator"], ventilateur: ["fan"], poulailler: ["chicken coop"], poule: ["chicken"], elevage: ["livestock", "poultry"],
  insecte: ["insect", "bug"], moustique: ["mosquito"], piege: ["trap"], bache: ["tarp", "tarpaulin"], ombrage: ["shade"],
  // Maison
  maison: ["home", "house", "household"], salon: ["living room"], chambre: ["bedroom"], salle: ["room"], bain: ["bath", "bathroom"],
  rideau: ["curtain"], rideaux: ["curtains"], tapis: ["rug", "carpet", "mat"], coussin: ["cushion", "pillow"], oreiller: ["pillow"],
  drap: ["sheet", "bed sheet"], couverture: ["blanket"], meuble: ["furniture"], etagere: ["shelf", "rack"], miroir: ["mirror"],
  horloge: ["clock"], cadre: ["frame"], vase: ["vase"], fleur: ["flower"], fleurs: ["flowers"], artificielle: ["artificial"],
  nettoyage: ["cleaning"], balai: ["broom", "mop"], poubelle: ["trash can", "garbage bin"], crochet: ["hook"], autocollant: ["sticker"],
  mural: ["wall"], murale: ["wall"], sticker: ["sticker", "decal"],
  // Mode
  robe: ["dress"], chemise: ["shirt"], pantalon: ["pants", "trousers"], jean: ["jeans"], jupe: ["skirt"], veste: ["jacket"],
  manteau: ["coat"], pull: ["sweater"], chaussure: ["shoes"], chaussures: ["shoes"], basket: ["sneakers"], baskets: ["sneakers"],
  sandale: ["sandals"], sac: ["bag", "handbag"], main: ["hand"], dos: ["backpack"], portefeuille: ["wallet"], ceinture: ["belt"],
  bijou: ["jewelry"], bijoux: ["jewelry"], collier: ["necklace"], bracelet: ["bracelet"], bague: ["ring"], boucle: ["earring", "buckle"],
  oreille: ["earring", "ear"], lunette: ["glasses", "sunglasses"], lunettes: ["glasses", "sunglasses"], chapeau: ["hat"], casquette: ["cap"],
  femme: ["women", "woman"], homme: ["men", "man"], enfant: ["kids", "children"], enfants: ["kids", "children"], bebe: ["baby"],
  fille: ["girl"], garcon: ["boy"], vetement: ["clothing", "clothes"], vetements: ["clothing", "clothes"], mode: ["fashion"],
  perruque: ["wig"], cheveux: ["hair"], maquillage: ["makeup"], beaute: ["beauty"], ongle: ["nail"], ongles: ["nails"], parfum: ["perfume"],
  // Sport / loisirs / divers
  sport: ["sport", "fitness"], jouet: ["toy"], jouets: ["toys"], jeu: ["game"], animal: ["pet"], animaux: ["pets"], chien: ["dog"], chat: ["cat"],
  bureau: ["office", "desk"], ecole: ["school"], stylo: ["pen"], cahier: ["notebook"], sante: ["health"], massage: ["massage"],
  tente: ["tent"], camping: ["camping"], peche: ["fishing"], musique: ["music"], cadeau: ["gift"], noel: ["christmas"],
  petit: ["small", "mini"], grand: ["large", "big"], electrique: ["electric"], rechargeable: ["rechargeable"], sans_fil: ["wireless"],
  fil: ["wire", "thread"], plastique: ["plastic"], bois: ["wooden", "wood"], metal: ["metal"], silicone: ["silicone"], acier: ["steel"],
  inox: ["stainless steel"], coton: ["cotton"], cuir: ["leather"], impermeable: ["waterproof"],
};

/** Synonymes anglais (groupes cohérents seulement — jamais d'élargissement absurde). */
const EN_SYN: string[][] = [
  ["cake decoration", "cake decorating", "cake topper", "cake decorating supplies", "baking decoration"],
  ["baking", "pastry", "bakeware"], ["decoration", "decorating", "decor", "ornament"],
  ["phone case", "mobile phone case", "phone cover", "phone shell"], ["case", "cover", "shell"],
  ["solar pump", "solar water pump", "solar irrigation pump"], ["pump", "water pump"],
  ["agricultural net", "crop net", "farming net", "garden net", "shade net"], ["net", "netting", "mesh"],
  ["earphone", "earbuds", "headphone", "headset"], ["charger", "charging adapter"], ["holder", "stand", "mount", "bracket"],
  ["mold", "mould"], ["storage", "organizer", "storage box"], ["rug", "carpet", "mat"], ["sneakers", "shoes", "trainers"],
  ["bag", "handbag", "tote"], ["jewelry", "jewellery"], ["kids", "children", "child"], ["women", "womens", "ladies"],
  ["men", "mens"], ["light", "lamp", "lighting"], ["watering", "irrigation", "sprinkler"], ["hose", "pipe", "tube"],
];

export function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

/** Racine grossière (pluriels, -ing, -ion…) pour comparer decoration/decorating. */
export function stem(w: string): string {
  let s = w;
  for (const suf of ["ations", "ation", "ings", "ing", "ions", "ion", "ers", "er", "ies", "es", "ed", "s"]) {
    if (s.length - suf.length >= 4 && s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  }
  return s;
}

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

let VOCAB: string[] | null = null;
function vocab(): string[] {
  if (VOCAB) return VOCAB;
  const s = new Set<string>(Object.keys(FR_EN));
  for (const v of Object.values(FR_EN)) for (const p of v) for (const w of p.split(" ")) s.add(w);
  for (const g of EN_SYN) for (const p of g) for (const w of p.split(" ")) s.add(w);
  VOCAB = [...s].filter((w) => w.length >= 3);
  return VOCAB;
}

/** Corrige une faute probable (1 erreur ≤ 6 lettres, 2 au-delà). */
export function correctWord(w: string): string {
  if (w.length < 4 || FR_EN[w] || vocab().includes(w)) return w;
  const max = w.length <= 6 ? 1 : 2;
  let best = w, bestD = max + 1;
  for (const v of vocab()) {
    const d = lev(w, v);
    if (d < bestD) { best = v; bestD = d; }
  }
  return bestD <= max ? best : w;
}

export interface Concept { source: string; terms: string[]; stems: string[] }
export interface QueryPlan {
  original: string;
  corrected: string;
  concepts: Concept[];
  /** Requêtes CJ ordonnées, de la plus précise à la plus large. */
  queries: Array<{ q: string; stage: "exact" | "traduction" | "synonymes" | "combinaison" | "élargie" }>;
}

function synonymsOf(term: string): string[] {
  const out = new Set<string>([term]);
  for (const g of EN_SYN) if (g.includes(term)) g.forEach((x) => out.add(x));
  return [...out];
}

export function buildQueryPlan(raw: string): QueryPlan {
  const original = String(raw ?? "").trim();
  const words = normalize(original).split(" ").filter((w) => w && !STOP.has(w));
  const fixed = words.map(correctWord);
  const concepts: Concept[] = fixed.map((w) => {
    const en = FR_EN[w] ?? [w];
    const terms = [...new Set(en.flatMap(synonymsOf))].slice(0, 8);
    const stems = [...new Set(terms.flatMap((t) => t.split(" ")).map(stem))];
    return { source: w, terms, stems };
  });
  const queries: QueryPlan["queries"] = [];
  const push = (q: string, stage: QueryPlan["queries"][number]["stage"]) => {
    const n = normalize(q);
    if (n && !queries.some((x) => x.q === n)) queries.push({ q: n, stage });
  };
  push(original, "exact");
  if (fixed.join(" ") !== words.join(" ")) push(fixed.join(" "), "exact");
  if (concepts.length) {
    // Anglais : le qualificatif précède le nom (« décoration gâteau » → « cake decoration »).
    const primary = concepts.map((c) => c.terms[0]);
    push([...primary].reverse().join(" "), "traduction");
    push(primary.join(" "), "traduction");
    // Synonymes des expressions composées connues.
    const phrase = [...primary].reverse().join(" ");
    for (const s of [...synonymsOf(phrase), ...synonymsOf(primary.join(" "))]) push(s, "synonymes");
    // Combinaisons : 2e/3e équivalent de chaque concept.
    if (concepts.length >= 2) {
      const [a, b] = [concepts[concepts.length - 1], concepts[0]];
      for (const ta of a.terms.slice(0, 3)) for (const tb of b.terms.slice(0, 3)) push(`${ta} ${tb}`, "combinaison");
    } else {
      for (const t of concepts[0].terms.slice(1, 4)) push(t, "synonymes");
    }
    // Élargissement : concept le plus spécifique seul (le premier en français = nom principal).
    if (concepts.length >= 2) push(concepts[concepts.length - 1].terms[0] + " " + concepts[0].terms[0], "élargie");
  }
  return { original, corrected: fixed.join(" "), concepts, queries: queries.slice(0, 10) };
}

/**
 * Score de pertinence 0–100. `relevant=false` si un concept essentiel est
 * absent du titre ET de la catégorie (résultat hors sujet).
 */
export function scoreHit(
  plan: QueryPlan,
  item: { name?: string | null; categoryPath?: string | null; sku?: string | null; stock?: number | null; image?: string | null; price?: number | null },
): { score: number; relevant: boolean } {
  if (!plan.concepts.length) return { score: 50, relevant: true };
  const title = normalize(item.name);
  const cat = normalize(item.categoryPath);
  const tStems = new Set(title.split(" ").map(stem));
  const cStems = new Set(cat.split(" ").map(stem));
  const sku = normalize(item.sku);
  if (sku && sku === normalize(plan.original)) return { score: 100, relevant: true };

  let inTitle = 0, inCat = 0;
  for (const c of plan.concepts) {
    const hitT = c.terms.some((t) => title.includes(t)) || c.stems.some((s) => tStems.has(s));
    const hitC = c.terms.some((t) => cat.includes(t)) || c.stems.some((s) => cStems.has(s));
    if (hitT) inTitle++; else if (hitC) inCat++;
  }
  const n = plan.concepts.length;
  let score = (inTitle / n) * 55 + (inCat / n) * 20;
  // Expression complète dans le titre (ex. « cake decoration »).
  if (plan.queries.slice(0, 6).some((q) => q.q.includes(" ") && title.includes(q.q))) score += 25;
  if ((item.stock ?? 0) > 0) score += 5;
  if (item.image) score += 3;
  if (item.price != null) score += 2;
  // Pertinent : tous les concepts couverts (titre ou catégorie) ; au moins la moitié dans le titre.
  const covered = inTitle + inCat;
  const relevant = n === 1 ? inTitle + inCat >= 1 : covered >= Math.ceil(n * (n >= 3 ? 0.67 : 1)) && inTitle >= Math.ceil(n / 2);
  return { score: Math.min(100, Math.round(score)), relevant };
}
