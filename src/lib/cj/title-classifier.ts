// ═══════════════════════════════════════════════════════════════
// Classement d'un produit CJ d'après SON TITRE (module pur).
// Les rayons CJ sont trop larges (« Toys, Kids & Baby » mélange robes,
// couches et jouets) : le titre dit ce qu'est réellement l'article.
// Le mot principal est en général le dernier nom reconnu du titre
// (« Phone Case », « Baby Dress ») ; quelques règles « fortes » passent
// avant (accessoire téléphone, cuisine…). Sans règle sûre : null, on
// garde la catégorie actuelle. Rien n'est inventé.
// ═══════════════════════════════════════════════════════════════
import type { FlatCategory } from "./category-match";

type G = "F" | "H" | "B" | "K" | null; // femme, homme, bébé, enfant
type Sex = "f" | "m" | null;
interface Ctx { g: G; sex: Sex; t: string }
type Target = string | null | ((c: Ctx) => string | null);
interface Rule { re: RegExp; t: Target; strong?: boolean; need?: RegExp; not?: RegExp }
const CLOTH = /\b(dress|coat|jacket|shirt|tshirt|pants|trousers|skirt|sweater|boxers?|briefs|top|shorts|jeans|hoodie|cardigan|outerwear|vest|jumpsuit|suit|underwear)\b/;

const MF = "Mode Femme", MH = "Mode Homme", EB = "Enfants & Bébé";
const kidsCloth = (c: Ctx) => c.g === "B" || c.g === "K"
  ? c.sex === "f" ? `${EB} > Vêtements Enfant Fille` : c.sex === "m" ? `${EB} > Vêtements Enfant Garçon` : null
  : null;
const cloth = (f: string | null, h: string | null, baby?: (c: Ctx) => string | null) => (c: Ctx) => {
  if (c.g === "B" && baby) { const b = baby(c); if (b) return b; }
  if (c.g === "B" || c.g === "K") return kidsCloth(c);
  if (c.g === "F") return f;
  if (c.g === "H") return h;
  return null;
};
const bebe = (fille: string, garcon: string) => (c: Ctx) => c.sex === "f" ? `${EB} > Bébé Fille > ${fille}` : c.sex === "m" ? `${EB} > Bébé Garçon > ${garcon}` : null;

const PHONE = /\b(phone|iphone|mobile|smartphone|cellphone|galaxy|huawei|xiaomi|redmi|oppo|vivo|magsafe|airpods?|ipad)\b/;

const RULES: Rule[] = [
  // ── Règles fortes ──
  { re: /\b(case|cover|shell|holder|stand|bracket|mount|charger|charging|cable|film|protector|tempered|screen|lanyard|grip|lens)\b/, need: PHONE, t: "Électronique > Accessoires Téléphone", strong: true },
  { re: /\b(power bank|wireless charger|charging cable|data cable|usb cable|fast charger|car charger|charging stand)\b/, t: "Électronique > Accessoires Téléphone", strong: true },
  { re: /\b(smart ?watch|fitness tracker|smart band|smart ring)\b/, t: "Électronique > Objets connectés", strong: true },
  { re: /\b(diapers?|diaper cover|nappy)\b/, t: `${EB} > Hygiène Bébé > Couches`, strong: true },
  { re: /\b(baby wipes|wet wipes)\b/, t: `${EB} > Hygiène Bébé > Lingettes`, strong: true },
  { re: /\b(feeding bottle|baby bottle|milk bottle)\b/, t: `${EB} > Repas Bébé > Biberons`, strong: true },
  { re: /\b(pacifier|teether|nipple)\b/, t: `${EB} > Repas Bébé > Tétines`, strong: true },
  { re: /\b(stroller|pram|pushchair)\b/, t: `${EB} > Puériculture > Poussettes`, strong: true },
  { re: /\b(baby carrier|hip seat)\b/, t: `${EB} > Puériculture > Porte-bébés`, strong: true },
  { re: /\b(crib|cradle|baby bed)\b/, t: `${EB} > Puériculture > Lits bébé`, strong: true },
  { re: /\b(high chair|dining chair|booster seat)\b/, need: /\b(baby|child|children|kids?|infant|toddler)\b/, t: `${EB} > Repas Bébé > Chaises hautes`, strong: true },
  { re: /\b(car seat|safety seat)\b/, need: /\b(baby|child|children|kids?|infant|toddler)\b/, t: `${EB} > Puériculture > Sièges auto`, strong: true },
  { re: /\b(air fryer|blender|juicer|kettle|coffee machine|coffee maker|toaster|induction cooker|rice cooker|mixer|food processor)\b/, t: "Maison & Décoration > Électroménager Cuisine", strong: true },
  { re: /\b(kitchen|cookware|knife|knives|spatula|cutting board|chopping board|peeler|slicer|grater|tableware|chopsticks|lunch box|oil bottle|frying pan|wok|baking|cake mold|dish rack|sink)\b/, t: "Maison & Décoration > Cuisine & Vaisselle", strong: true },
  { re: /\b(luggage|suitcase|trolley case)\b/, t: "Bagagerie & Voyage > Valises", strong: true },
  { re: /\b(aquarium|fish tank)\b/, t: "Animaux > Poissons & Aquarium", strong: true },
  { re: /\b(dog|dogs|puppy|pet)\b/, need: /\b(leash|collar|harness|bed|bowl|toy|toys|feeder|clothes|kennel|cage|house|chew|grooming|pet|dog|puppy)\b/, t: "Animaux > Chiens", strong: true },
  { re: /\b(cat litter|cat tree|cat scratch\w*|cat toy|cat bed|kitten)\b/, t: "Animaux > Chats", strong: true },
  { re: /\b(motorcycle|motorbike)\b/, not: CLOTH, t: "Auto & Moto > Moto", strong: true },
  { re: /\b(yoga mat)\b/, t: "Sport & Fitness > Yoga & Pilates > Tapis de yoga", strong: true },
  { re: /\b(dumbbells?)\b/, t: "Sport & Fitness > Musculation > Haltères", strong: true },
  { re: /\b(tent|camping|fishing|hiking)\b/, not: /\b(scarf|hat|cap|gloves|shoes|boots|jacket|pants|coat)\b/, t: "Sport & Fitness > Plein air & Camping" },
  { re: /\b(magnetic (tiles?|blocks?|building))\b/, t: "Jeux & Jouets > Jeux de Construction > Jeux Magnétiques", strong: true },
  { re: /\b(building blocks?|lego)\b/, t: "Jeux & Jouets > Jeux de Construction", strong: true },

  // ── Mot principal (le dernier reconnu gagne) ──
  // Électronique
  { re: /\b(earphones?|headphones?|headset|earbuds?)\b/, t: "Électronique > Audio > Casques audio" },
  { re: /\b(speaker|soundbar)\b/, t: "Électronique > Audio > Enceintes Bluetooth" },
  { re: /\b(keyboard|mouse|ssd|hard drive|usb hub|webcam|mouse pad)\b/, t: "Électronique > Périphériques PC" },
  { re: /\b(laptop|notebook computer)\b/, t: "Électronique > Ordinateurs" },
  { re: /\b(projector)\b/, t: "Électronique > TV & Vidéo > Projecteurs" },
  { re: /\b(camera|dashcam|action cam)\b/, t: "Électronique > Photo & Caméras" },
  { re: /\b(router|wifi repeater|network adapter)\b/, t: "Électronique > Réseau & Wi-Fi" },
  { re: /\b(gamepad|game controller|joystick)\b/, t: "Électronique > Jeux vidéo" },
  // Maison
  { re: /\b(lamp|chandelier|night light|led light|string lights?|ceiling light|lantern|light strip)\b/, t: "Maison & Décoration > Éclairage" },
  { re: /\b(curtains?|pillowcase|pillow|bed sheets?|blanket|towel|duvet|cushion|quilt|bedding)\b/, t: "Maison & Décoration > Linge de maison" },
  { re: /\b(shower|toilet|bathroom|bath mat)\b/, t: "Maison & Décoration > Salle de bain" },
  { re: /\b(mirror)\b/, t: "Maison & Décoration > Décoration > Miroirs" },
  { re: /\b(candles?|candle holder)\b/, t: "Maison & Décoration > Décoration > Bougies" },
  { re: /\b(vase)\b/, t: "Maison & Décoration > Décoration > Vases" },
  { re: /\b(rug|carpet|doormat)\b/, t: "Maison & Décoration > Décoration > Tapis" },
  { re: /\b(photo frame|picture frame)\b/, t: "Maison & Décoration > Décoration > Cadres" },
  { re: /\b(wall sticker|artificial flowers?|figurine|wall art)\b/, t: "Maison & Décoration > Décoration" },
  { re: /\b(storage box|storage bag|organizer|storage rack|shelf|hangers?|storage basket)\b/, t: "Maison & Décoration > Rangement" },
  { re: /\b(cup|mug|bowl|plate|spoon|fork|teapot|water bottle|thermos)\b/, t: "Maison & Décoration > Cuisine & Vaisselle" },
  // Bricolage
  { re: /\b(screwdriver|wrench|pliers|hammer|tool set|tool kit)\b/, t: "Bricolage & Jardin > Outils à main" },
  { re: /\b(drill|angle grinder|electric saw|heat gun|soldering)\b/, t: "Bricolage & Jardin > Outils électriques" },
  { re: /\b(flower pot|planter)\b/, t: "Bricolage & Jardin > Jardin > Pots & Jardinières" },
  { re: /\b(garden|sprinkler)\b/, t: "Bricolage & Jardin > Jardin" },
  // Auto
  { re: /\b(car seat cover|steering wheel|car mat|car organizer|car vacuum|dashboard)\b/, t: "Auto & Moto > Accessoires voiture intérieur" },
  // Beauté
  { re: /\b(lipstick|lip gloss)\b/, t: "Beauté & Santé > Maquillage" },
  { re: /\b(makeup|eyeshadow|foundation|concealer|eyeliner|makeup brush|mascara)\b/, t: "Beauté & Santé > Maquillage" },
  { re: /\b(perfume|fragrance)\b/, t: "Beauté & Santé > Parfums" },
  { re: /\b(hair dryer|straightener|curling iron|hair curler|comb|hair clipper)\b/, t: "Beauté & Santé > Outils coiffure" },
  { re: /\b(massager|massage)\b/, t: "Beauté & Santé > Bien-être" },
  { re: /\b(wig|wigs)\b/, t: "Mode Femme > Cheveux Femme > Perruques" },
  // Jouets
  { re: /\b(toys?|doll|plush toy|stuffed animal|puzzle|rattle)\b/, t: (c) => c.g === "B" ? `${EB} > Jouets Bébé` : "Jeux & Jouets > Jouets enfants" },
  { re: /\b(fidget|squishy|stress relief|decompression)\b/, t: "Jeux & Jouets > Jouets enfants > Anti-stress Enfants" },
  { re: /\b(water gun|kite|bubble machine|sandbox)\b/, t: "Jeux & Jouets > Jouets extérieur" },
  { re: /\b(board game|card game|chess)\b/, t: "Jeux & Jouets > Jeux de société" },
  { re: /\b(montessori|educational)\b/, t: "Jeux & Jouets > Jeux éducatifs" },
  // Bureau
  { re: /\b(pen|pens|pencil|marker)\b/, t: "Bureau & Fournitures > Papeterie > Stylos" },
  { re: /\b(notebook|journal|diary)\b/, t: "Bureau & Fournitures > Papeterie > Cahiers" },
  { re: /\b(stationery)\b/, t: "Bureau & Fournitures > Papeterie" },
  // Sport
  { re: /\b(resistance band|kettlebell|fitness|gym)\b/, not: CLOTH, t: "Sport & Fitness > Musculation" },
  { re: /\b(bicycle|bike|cycling)\b/, t: "Sport & Fitness > Cyclisme" },
  { re: /\b(swimsuit|swimwear|bikini|swim)\b/, t: "Sport & Fitness > Natation" },
  // Sacs
  { re: /\b(handbag|handbags|shoulder bag|crossbody|messenger bag)\b/, t: (c) => c.g === "H" || c.g === null ? "Bagagerie & Voyage > Sacs" : c.g === "F" ? `${MF} > Sacs Femme > Sacs à main` : null },
  { re: /\b(backpack|schoolbag|school bag)\b/, t: (c) => c.g === "K" || c.g === "B" ? `${EB} > École & Scolaire` : c.g === "F" ? `${MF} > Sacs Femme > Sacs à dos` : "Bagagerie & Voyage > Sacs" },
  { re: /\b(clutch|evening bag)\b/, t: (c) => c.g === "H" ? `${MH} > Accessoires Homme > Portefeuilles` : `${MF} > Sacs Femme > Pochettes` },
  { re: /\b(tote)\b/, t: (c) => c.g === "F" ? `${MF} > Sacs Femme > Cabas` : "Bagagerie & Voyage > Sacs" },
  { re: /\b(toiletry bag|travel bag|cosmetic bag|makeup bag|travel pillow)\b/, t: "Bagagerie & Voyage > Accessoires voyage" },
  { re: /\b(bag|bags)\b/, not: /\b(gift bag|gift)\b/, t: (c) => c.g === "F" ? `${MF} > Sacs Femme` : "Bagagerie & Voyage > Sacs" },
  { re: /\b(wallet|card holder)\b/, t: (c) => c.g === "F" ? `${MF} > Accessoires Femme` : `${MH} > Accessoires Homme > Portefeuilles` },
  // Bijoux / accessoires
  { re: /\b(earrings?|ear studs?|ear clips?)\b/, t: (c) => c.g === "H" ? `${MH} > Bijoux Homme` : `${MF} > Bijoux Femme > Boucles d'oreilles` },
  { re: /\b(necklace|pendant|choker)\b/, not: /\b(christmas|tree|lanyard|phone|keychain)\b/, t: (c) => c.g === "H" ? `${MH} > Bijoux Homme` : `${MF} > Bijoux Femme > Colliers` },
  { re: /\b(bracelet|bangle)\b/, t: (c) => c.g === "H" ? `${MH} > Bijoux Homme` : `${MF} > Bijoux Femme > Bracelets` },
  { re: /\b(ring|rings)\b/, need: /\b(finger|gold|silver|diamond|zircon|wedding|engagement|stainless|jewelry|opening|adjustable|couple)\b/, t: (c) => c.g === "H" ? `${MH} > Bijoux Homme` : `${MF} > Bijoux Femme > Bagues` },
  { re: /\b(jewelry set)\b/, t: `${MF} > Bijoux Femme > Parures` },
  { re: /\b(watch|watches)\b/, t: (c) => c.g === "F" ? `${MF} > Accessoires Femme` : `${MH} > Accessoires Homme > Montres` },
  { re: /\b(sunglasses|glasses|eyewear)\b/, t: (c) => c.g === "F" ? `${MF} > Accessoires Femme` : `${MH} > Accessoires Homme > Lunettes` },
  { re: /\b(belt)\b/, not: CLOTH, t: (c) => c.g === "F" ? `${MF} > Accessoires Femme` : c.g === "H" ? `${MH} > Accessoires Homme > Ceintures` : null },
  { re: /\b(cap|baseball cap|beanie|hat)\b/, not: CLOTH, t: (c) => c.g === "F" ? `${MF} > Accessoires Femme` : c.g === "H" ? `${MH} > Accessoires Homme > Casquettes` : null },
  { re: /\b(scarf|gloves)\b/, not: CLOTH, t: (c) => c.g === "F" ? `${MF} > Accessoires Femme` : c.g === "H" ? `${MH} > Accessoires Homme` : null },
  // Chaussures
  { re: /\b(sneakers?|trainers|running shoes|canvas shoes|vulcanized)\b/, t: (c) => c.g === "B" || c.g === "K" ? `${EB} > Chaussures Enfant` : c.g === "F" ? `${MF} > Chaussures Femme > Sneakers` : c.g === "H" ? `${MH} > Chaussures Homme > Sneakers` : null },
  { re: /\b(sandals?|slippers?|flip flops)\b/, t: (c) => c.g === "B" || c.g === "K" ? `${EB} > Chaussures Enfant` : c.g === "F" ? `${MF} > Chaussures Femme > Sandales` : c.g === "H" ? `${MH} > Chaussures Homme > Sandales` : null },
  { re: /\b(boots?)\b/, t: (c) => c.g === "B" || c.g === "K" ? `${EB} > Chaussures Enfant` : c.g === "F" ? `${MF} > Chaussures Femme > Bottes` : c.g === "H" ? `${MH} > Chaussures Homme > Bottes` : null },
  { re: /\b(high heels?|heels|pumps|stiletto)\b/, t: `${MF} > Chaussures Femme > Talons` },
  { re: /\b(flats|ballet)\b/, t: (c) => c.g === "F" ? `${MF} > Chaussures Femme > Ballerines` : null },
  { re: /\b(loafers?|moccasins?)\b/, t: (c) => c.g === "F" ? `${MF} > Chaussures Femme` : `${MH} > Chaussures Homme > Mocassins` },
  { re: /\b(formal shoes|leather shoes|oxford shoes|dress shoes)\b/, t: (c) => c.g === "F" ? `${MF} > Chaussures Femme` : `${MH} > Chaussures Homme > Chaussures de ville` },
  { re: /\b(shoes)\b/, t: (c) => c.g === "B" || c.g === "K" ? `${EB} > Chaussures Enfant` : c.g === "F" ? `${MF} > Chaussures Femme` : c.g === "H" ? `${MH} > Chaussures Homme` : null },
  // Vêtements
  { re: /\b(abaya)\b/, t: `${MF} > Tenues modestes > Abayas` },
  { re: /\b(hijab)\b/, t: `${MF} > Tenues modestes > Hijabs` },
  { re: /\b(kaftan|caftan|jalabiya|thobe)\b/, t: (c) => c.g === "H" ? `${MH} > Mode traditionnelle Homme > Kaftans` : `${MF} > Tenues modestes > Kaftans` },
  { re: /\b(pajamas?|pyjamas?|sleepwear|nightgown|sleeping bag|homewear)\b/, t: cloth(null, null, bebe("Pyjamas bébé fille", "Pyjamas bébé garçon")) },
  { re: /\b(romper|bodysuit|onesie|jumpsuit)\b/, t: cloth(`${MF} > Ensembles`, null, bebe("Bodys bébé", "Bodys bébé")) },
  { re: /\b(dress|dresses|gown)\b/, t: cloth(`${MF} > Robes`, null, (c) => c.sex !== "m" ? `${EB} > Bébé Fille > Robes bébé` : null) },
  { re: /\b(wedding dress|bridal gown)\b/, t: `${MF} > Robes > Robes de mariée` },
  { re: /\b(evening dress|party dress|cocktail dress)\b/, t: `${MF} > Robes > Robes de soirée` },
  { re: /\b(skirt|skirts)\b/, not: /\b(dress|dresses)\b/, t: cloth(`${MF} > Bas Femme > Jupes`, null) },
  { re: /\b(jeans|denim pants)\b/, t: cloth(`${MF} > Bas Femme > Jeans`, `${MH} > Bas > Jeans`) },
  { re: /\b(leggings?|yoga pants)\b/, t: cloth(`${MF} > Bas Femme > Leggings`, null) },
  { re: /\b(joggers?|sweatpants|track pants)\b/, t: cloth(`${MF} > Bas Femme > Pantalons`, `${MH} > Bas > Joggings`) },
  { re: /\b(pants|trousers|slacks)\b/, t: cloth(`${MF} > Bas Femme > Pantalons`, `${MH} > Bas > Pantalons`) },
  { re: /\b(shorts)\b/, t: cloth(`${MF} > Bas Femme > Shorts`, `${MH} > Bas > Shorts`) },
  { re: /\b(tshirt)\b/, t: cloth(`${MF} > Tops Femme > T-shirts`, `${MH} > Hauts > T-shirts`, bebe("Bodys bébé", "T-shirts bébé")) },
  { re: /\b(polo)\b/, t: cloth(`${MF} > Tops Femme`, `${MH} > Hauts > Polos`) },
  { re: /\b(shirt|blouse)\b/, not: /\bpolo\b/, t: cloth(`${MF} > Tops Femme > Blouses`, `${MH} > Hauts > Chemises`) },
  { re: /\b(sweaters?|cardigan|hoodie|hoodies|sweatshirt|pullover|knitwear|jumper)\b/, t: cloth(`${MF} > Tops Femme > Pulls & Cardigans`, `${MH} > Hauts > Sweats & Pulls`) },
  { re: /\b(tunic)\b/, t: cloth(`${MF} > Tops Femme > Tuniques`, null) },
  { re: /\b(crop top)\b/, t: cloth(`${MF} > Tops Femme > Crop tops`, null) },
  { re: /\b(top|tops|camisole|tank top|cami)\b/, t: cloth(`${MF} > Tops Femme`, `${MH} > Hauts`) },
  { re: /\b(jacket|windbreaker|bomber)\b/, t: cloth(`${MF} > Vestes Femme`, `${MH} > Hauts > Vestes`) },
  { re: /\b(coat|parka|trench|down jacket|overcoat)\b/, t: cloth(`${MF} > Vestes Femme`, `${MH} > Hauts > Manteaux`) },
  { re: /\b(blazer|suit jacket)\b/, t: cloth(`${MF} > Vestes Femme`, `${MH} > Hauts > Costumes & Blazers`) },
  { re: /\b(two piece|2 piece|three piece|suit|set|outfit|tracksuit)\b/, need: /\b(two piece|2 piece|three piece|suit|tracksuit|pants|shorts|skirt|top|shirt|tshirt|sweater|hoodie|outfit|clothing|jacket)\b/, t: (c) => c.g === "H" && /\b(sport|sports|tracksuit|running|gym)\b/.test(c.t) ? "Sport & Fitness > Vêtements de sport" : cloth(`${MF} > Ensembles`, /\b(blazer|formal|business|wedding)\b/.test(c.t) ? `${MH} > Hauts > Costumes & Blazers` : null)(c) },
  { re: /\b(underwear|boxers?|briefs)\b/, t: cloth(null, `${MH} > Sous-vêtements`) },
];

function normTitle(s: string): string {
  return (" " + s + " ").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’´`]/g, "'")
    .replace(/(\w)'s\b/g, "$1s")
    .replace(/\bt[\s-]?shirts?\b|\btee shirts?\b|\btees?\b/g, "tshirt")
    .replace(/\b(short|long|half|three quarter|puff|flying|flare|lantern|bat)[\s-]?sleeves?d?\b/g, " ")
    .replace(/\bsleeveless\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ");
}

function detect(t: string, fallback: G): Ctx {
  const baby = /\b(baby|babies|infant|newborn|toddler|\d+ ?(m|months?))\b/.test(t);
  const kid = /\b(kids?|child|children|childrens|boys?|boys|girls?|girls|junior)\b/.test(t);
  const f = /\b(women|womens|woman|ladies|lady|female|maternity)\b/.test(t);
  const h = /\b(men|mens|man|male|gentleman)\b/.test(t);
  const sexF = /\b(girls?|girls|princess|daughter)\b/.test(t);
  const sexM = /\b(boys?|boys|son)\b/.test(t);
  const sex: Sex = sexF && !sexM ? "f" : sexM && !sexF ? "m" : null;
  const adult = (f || h || /\b(sexy|hot girl|lingerie)\b/.test(t)) && !/\b(kids?|child|children|childrens|boys and girls)\b/.test(t);
  let g: G = baby && !adult ? "B" : kid && !adult ? "K" : f && !h ? "F" : h && !f ? "H" : null;
  if (!g) g = fallback;
  return { g, sex, t };
}

export interface TitleClass { path: string; categoryId: string }

/** Chaîne de noms (racine > feuille) → id. */
export function buildPathIndex(cats: FlatCategory[]): Map<string, string> {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const idx = new Map<string, string>();
  for (const c of cats) {
    const names: string[] = [];
    let cur: FlatCategory | undefined = c;
    for (let i = 0; i < 6 && cur; i++) { names.unshift(cur.name.trim()); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    idx.set(names.join(" > ").toLowerCase(), c.id);
  }
  return idx;
}

/**
 * @param currentPath chemin KawZone actuel (sert à deviner le public si le titre ne le dit pas).
 */
export function classifyByTitle(title: string | null | undefined, cjPath: string | null | undefined, currentPath: string | null | undefined, index: Map<string, string>): TitleClass | null {
  if (!title) return null;
  const t = normTitle(title);
  const cjN = normTitle(cjPath ?? "");
  const cur = (currentPath ?? "").toLowerCase();
  let fb: G = null;
  const cjCtx = detect(cjN, null).g;
  if (cjCtx === "F" || cjCtx === "H") fb = cjCtx;
  else if (cur.startsWith("mode femme")) fb = "F";
  else if (cur.startsWith("mode homme")) fb = "H";
  const ctx = detect(t, fb);

  let best: { pos: number; path: string } | null = null;
  for (const r of RULES) {
    if (r.need && !r.need.test(t)) continue;
    if (r.not && r.not.test(t)) continue;
    const g = new RegExp(r.re.source, "g");
    let m: RegExpExecArray | null; let last = -1;
    while ((m = g.exec(t))) { last = m.index + m[0].length; if (m[0].length === 0) g.lastIndex++; }
    if (last < 0) continue;
    const path = typeof r.t === "function" ? r.t(ctx) : r.t;
    if (!path) continue;
    const pos = last + (r.strong ? 100000 : 0);
    if (!best || pos > best.pos) best = { pos, path };
  }
  if (!best) return null;
  const id = index.get(best.path.toLowerCase());
  return id ? { path: best.path, categoryId: id } : null;
}
