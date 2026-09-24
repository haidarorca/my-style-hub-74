// ═══════════════════════════════════════════════════════════════
// Correspondance automatique catégorie CJ (anglais) → catégorie KawZone
// (français). Module PUR : aucune dépendance base de données.
//
// Principe :
//  1. Le chemin CJ (« Bag & Shoes > Men's Shoes > Casual Shoes ») est
//     découpé en segments ; chaque segment est traduit en CONCEPTS
//     français (mots entiers, jamais de simples préfixes : « bag » ne
//     correspond plus à « bagagerie »).
//  2. Le public visé (femme / homme / enfant) est détecté ; une catégorie
//     KawZone d'un autre public est exclue.
//  3. TOUTES les catégories KawZone (tous niveaux) sont notées : le nom
//     de la catégorie doit contenir au moins un concept, ses parents
//     apportent un bonus de cohérence, le segment le plus précis pèse
//     le plus. La meilleure (la plus précise en cas d'égalité) gagne.
//  4. Rien n'est inventé : sans concept reconnu, « à attribuer ».
// ═══════════════════════════════════════════════════════════════

export interface FlatCategory {
  id: string;
  name: string;
  parent_id: string | null;
  level: number;
}

export interface CategoryMatch {
  categoryId: string | null;
  chainIds: string[];
  chainNames: string[];
  unresolved: string[];
}

/** Mot anglais (singulier, normalisé) → concepts français (singulier, normalisé). */
const DICT: Record<string, string[]> = {
  // Chaussures
  shoe: ["chaussure"], footwear: ["chaussure"], sneaker: ["sneaker", "chaussure"],
  vulcanize: ["sneaker", "chaussure"], vulcanized: ["sneaker", "chaussure"], trainer: ["sneaker"],
  running: ["sneaker"], canvas: ["sneaker"], sandal: ["sandale", "chaussure"], slipper: ["sandale", "chaussure"],
  flip: ["sandale"], boot: ["botte", "chaussure"], heel: ["talon", "chaussure"], pump: ["talon"],
  formal: ["ville"], oxford: ["ville"], loafer: ["mocassin", "chaussure"], moccasin: ["mocassin"],
  flat: ["ballerine"], ballet: ["ballerine"], cleat: ["crampon"],
  // Vêtements
  clothing: ["mode", "vetement"], apparel: ["mode", "vetement"], part: ["piece"], replacement: ["piece"],
  jacket: ["veste", "manteau"], coat: ["manteau", "veste"], outerwear: ["veste", "manteau"],
  down: ["manteau"], parka: ["manteau"], blazer: ["blazer", "costume", "veste"], suit: ["costume", "ensemble"],
  tshirt: ["tshirt"], tee: ["tshirt"], shirt: ["chemise"], blouse: ["blouse"], top: ["top"],
  tank: ["top"], hoodie: ["sweat", "pull"], sweatshirt: ["sweat", "pull"], sweater: ["pull", "sweat"],
  cardigan: ["cardigan", "pull"], polo: ["polo"], tunic: ["tunique"], crop: ["crop"],
  pant: ["pantalon"], trouser: ["pantalon"], jean: ["jean"], denim: ["jean"], short: ["short"],
  legging: ["legging"], skirt: ["jupe"], dress: ["robe"], gown: ["robe"], wedding: ["mariee"],
  jogger: ["jogging"], sweatpant: ["jogging"], bottom: ["ba"], set: ["ensemble"],
  underwear: ["sousvetement"], bra: ["sousvetement"], panty: ["sousvetement"], brief: ["sousvetement"],
  boxer: ["sousvetement"], lingerie: ["sousvetement"], sleepwear: ["pyjama"], pajama: ["pyjama"],
  bodysuit: ["body"], romper: ["body"], hijab: ["hijab"], abaya: ["abaya"], kaftan: ["kaftan"],
  jersey: ["maillot"], sportswear: ["sport"],
  // Accessoires / bijoux
  accessory: ["accessoire"], accessorie: ["accessoire"],
  jewelry: ["bijou"], jewellery: ["bijou"], bracelet: ["bracelet"], bangle: ["bracelet"],
  necklace: ["collier"], pendant: ["collier"], ring: ["bague"], earring: ["boucle"], stud: ["boucle"],
  watch: ["montre"], belt: ["ceinture"], cummerbund: ["ceinture"], cap: ["casquette"], hat: ["casquette"],
  sunglasse: ["lunette"], sunglass: ["lunette"], eyewear: ["lunette"], glasse: ["lunette"],
  wallet: ["portefeuille"], purse: ["pochette"], clutch: ["pochette"],
  bag: ["sac"], handbag: ["sac", "main"], backpack: ["sac", "do"], tote: ["caba", "sac"],
  luggage: ["valise"], suitcase: ["valise"], travel: ["voyage"],
  // Beauté
  wig: ["perruque"], extension: ["extension"], weave: ["tissage"], hair: ["capillaire", "cheveu", "coiffure"],
  makeup: ["maquillage"], cosmetic: ["maquillage"], lipstick: ["rouge"], mascara: ["mascara"],
  perfume: ["parfum"], fragrance: ["parfum"], skin: ["visage", "corp"], face: ["visage"],
  body: ["corp"], health: ["sante"], beauty: ["beaute"], nail: ["beaute"], massage: ["bien"],
  vitamin: ["vitamine"], supplement: ["complement"], hygiene: ["hygiene"],
  // Électronique
  electronic: ["electronique"], phone: ["telephone"], mobile: ["telephone"], smartphone: ["smartphone"],
  headphone: ["casque", "audio"], earphone: ["casque", "audio"], earbud: ["casque", "audio"],
  speaker: ["enceinte", "audio"], audio: ["audio"], computer: ["ordinateur"], laptop: ["ordinateur"],
  tablet: ["tablette"], camera: ["camera", "photo"], tv: ["tv"], video: ["video"], projector: ["projecteur"],
  smartwatch: ["connecte"], smart: ["connecte"], gaming: ["jeu"], console: ["jeu"],
  keyboard: ["peripherique"], mouse: ["peripherique"], router: ["reseau"], wifi: ["reseau"],
  // Enfants / jouets
  toy: ["jouet"], block: ["construction"], magnetic: ["magnetique"], puzzle: ["jeu"], educational: ["educatif"],
  baby: ["bebe"], infant: ["bebe"], newborn: ["bebe"], kid: ["enfant"], child: ["enfant"], children: ["enfant"],
  boy: ["garcon", "enfant"], girl: ["fille", "enfant"], toddler: ["enfant"], stroller: ["poussette"],
  diaper: ["couche"], feeding: ["repa"], bottle: ["biberon"], school: ["scolaire"],
  // Maison
  home: ["maison"], household: ["maison"], kitchen: ["cuisine"], tableware: ["vaisselle", "cuisine"],
  storage: ["rangement"], organizer: ["rangement"], wardrobe: ["rangement"], furniture: ["meuble", "mobilier"],
  decor: ["decoration"], decoration: ["decoration"], light: ["eclairage"], lighting: ["eclairage"],
  lamp: ["eclairage"], bedding: ["linge"], textile: ["linge"], towel: ["linge"], bathroom: ["bain"],
  bath: ["bain"], carpet: ["tapi"], rug: ["tapi"], mirror: ["miroir"], candle: ["bougie"], vase: ["vase"],
  frame: ["cadre"], appliance: ["electromenager"],
  // Bricolage / auto
  tool: ["outil"], welding: ["outil"], drill: ["outil"], hardware: ["quincaillerie"], improvement: ["bricolage"],
  garden: ["jardin"], plumbing: ["plomberie"], electrical: ["electricite"], paint: ["peinture"],
  car: ["auto", "voiture"], auto: ["auto"], automobile: ["auto"], motorcycle: ["moto"], motorbike: ["moto"],
  tire: ["pneu"], scooter: ["trottinette"],
  // Sport
  sport: ["sport"], outdoor: ["plein", "camping"], camping: ["camping"], cycling: ["cyclisme", "velo"],
  bicycle: ["cyclisme", "velo"], bike: ["cyclisme", "velo"], basketball: ["basketball"],
  football: ["football"], soccer: ["football"], yoga: ["yoga"], pilate: ["pilate"], fitness: ["fitness", "musculation", "cardio"],
  gym: ["musculation"], dumbbell: ["haltere"], swim: ["natation"], swimming: ["natation"], tennis: ["tenni"],
  boxing: ["martiaux"], martial: ["martiaux"],
  // Divers
  pet: ["animaux"], dog: ["chien"], cat: ["chat"], bird: ["oiseaux"], aquarium: ["aquarium"], fish: ["poisson"],
  office: ["bureau"], stationery: ["papeterie"], pen: ["stylo"], notebook: ["cahier"], printer: ["imprimante"],
  book: ["livre"], music: ["musique"], instrument: ["instrument"], food: ["alimentation"],
  beverage: ["boisson"], drink: ["boisson"], coffee: ["cafe"], tea: ["the"], snack: ["snack"],
};

type Gender = "F" | "H" | "K" | null;
const WOMEN = new Set(["women", "woman", "womens", "lady", "ladie", "female", "femme"]);
const MEN = new Set(["men", "man", "mens", "male", "homme"]);
const KIDS = new Set(["kid", "child", "children", "boy", "girl", "baby", "infant", "toddler", "newborn", "enfant", "bebe"]);

export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’´`]/g, "'")
    .replace(/'s\b/g, "s")
    .replace(/\bt[\s-]?shirts?\b/g, "tshirt")
    .replace(/\bsous[\s-]vetements?\b/g, "sousvetement")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function singular(w: string): string {
  if (w.length > 3 && /[sx]$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
  return w;
}

const STOP = new Set(["de", "et", "la", "le", "du", "des", "a", "and", "the", "for", "of", "en"]);
/** Concepts trop généraux pour justifier seuls une catégorie précise. */
const GENERIC = new Set(["mode", "femme", "homme", "enfant", "bebe", "fille", "garcon", "accessoire"]);

function tokens(s: string): string[] {
  return normalizeLabel(s).split(" ").filter((t) => t && !STOP.has(t)).map(singular);
}

function conceptsFor(segment: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokens(segment)) {
    const d = DICT[t];
    if (d) d.forEach((k) => out.add(k));
    if (t === "women" || t === "woman" || t === "womens" || t === "lady") out.add("femme");
    if (t === "men" || t === "man" || t === "mens") out.add("homme");
  }
  return out;
}

function genderOf(toks: string[]): Gender {
  if (toks.some((t) => KIDS.has(t))) return "K";
  const f = toks.some((t) => WOMEN.has(t));
  const h = toks.some((t) => MEN.has(t));
  if (f && !h) return "F";
  if (h && !f) return "H";
  return null;
}

/** Découpe « A > B > C » (ou « A / B ») en segments. */
export function splitCjPath(path: string | null | undefined): string[] {
  if (!path) return [];
  return path.split(/>|\/|\|/).map((s) => s.trim()).filter(Boolean);
}

export function matchCjCategoryPath(
  cjPath: string | null | undefined,
  categories: FlatCategory[],
): CategoryMatch {
  const segments = splitCjPath(cjPath);
  const empty: CategoryMatch = { categoryId: null, chainIds: [], chainNames: [], unresolved: segments };
  if (!segments.length || !categories.length) return empty;

  // « Toys, Kids & Baby » en rayon ne signifie pas « bébé » : seul un
  // segment plus précis peut l'indiquer.
  const segConcepts = segments.map((s, i) => {
    const c = conceptsFor(s);
    if (i === 0 && segments.length > 1) c.delete("bebe");
    return c;
  });
  const cjTokens = segments.flatMap(tokens);
  // Le rayon (« Women's Clothing ») décide du public s'il en indique un.
  const g0 = genderOf(tokens(segments[0]!));
  const cjGender = g0 === "F" || g0 === "H" ? g0 : genderOf(cjTokens);
  const cjKidSex = new Set(cjTokens.flatMap((t) => (t === "boy" ? ["garcon"] : t === "girl" ? ["fille"] : [])));
  const byId = new Map(categories.map((c) => [c.id, c]));

  const chainOf = (c: FlatCategory): FlatCategory[] => {
    const chain: FlatCategory[] = [];
    let cur: FlatCategory | undefined = c;
    for (let i = 0; i < 6 && cur; i++) {
      chain.unshift(cur);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return chain;
  };

  type Cand = { cat: FlatCategory; chain: FlatCategory[]; score: number; lastSeg: number };
  let best: Cand | null = null; // nom précis reconnu
  let bestGeneric: Cand | null = null; // seulement public / rayon

  for (const cat of categories) {
    const chain = chainOf(cat);
    const own = new Set(tokens(cat.name));
    const anc = new Set(chain.slice(0, -1).flatMap((c) => tokens(c.name)));
    const all = [...own, ...anc];

    // Public visé : exclure les catégories d'un autre public.
    const catGender = genderOf(all.concat(all.some((t) => t === "fille" || t === "garcon") ? ["kid"] : []));
    if (cjGender && catGender && cjGender !== catGender) continue;
    // Fille / garçon : seulement si CJ le précise.
    if (all.some((t) => (t === "fille" || t === "garcon") && !cjKidSex.has(t))) continue;

    let score = 0;
    let ownHit = false;
    let strictHit = false;
    let lastSeg = -1;
    segConcepts.forEach((cs, i) => {
      const w = i + 1; // le segment le plus précis pèse le plus
      let hitOwn = false, hitAnc = false;
      for (const k of cs) {
        if (own.has(k)) { hitOwn = true; if (!GENERIC.has(k)) strictHit = true; }
        else if (anc.has(k)) hitAnc = true;
      }
      if (hitOwn) { score += 10 * w; ownHit = true; if (strictHit) lastSeg = Math.max(lastSeg, i); }
      else if (hitAnc) score += 9 * w;
    });
    if (!ownHit) continue;
    if (cjGender && catGender === cjGender) score += 8;
    if (!cjGender && catGender === "K") score -= 10;
    // Un nom KawZone plein de mots non reconnus est moins sûr.
    const ownUnmatched = [...own].filter((t) => !segConcepts.some((cs) => cs.has(t))).length;
    score -= ownUnmatched * 4;

    if (strictHit) {
      score += chain.length * 3; // précision
      if (!best || score > best.score || (score === best.score && chain.length > best.chain.length)) {
        best = { cat, chain, score, lastSeg };
      }
    } else {
      // Repli : on préfère le niveau le plus général (« Mode Femme »).
      if (!bestGeneric || score > bestGeneric.score || (score === bestGeneric.score && chain.length < bestGeneric.chain.length)) {
        bestGeneric = { cat, chain, score, lastSeg: 0 };
      }
    }
  }

  const pick: Cand | null = best && best.score >= 12 ? best : bestGeneric && bestGeneric.score >= 10 ? bestGeneric : null;
  if (!pick) return empty;
  return {
    categoryId: pick.cat.id,
    chainIds: pick.chain.map((c) => c.id),
    chainNames: pick.chain.map((c) => c.name),
    unresolved: pick === best && pick.lastSeg >= segments.length - 1 ? [] : segments.slice(pick === best ? pick.lastSeg + 1 : 1),
  };
}
