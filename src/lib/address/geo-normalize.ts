// ============================================================
// NORMALISATION: Noms géographiques
// - Suppression des mots inutiles (Région, Province, State...)
// - Normalisation des accents
// - Matching approximatif
// ============================================================

/** Mots à supprimer pour la comparaison (par langue) */
const NOISE_WORDS: Record<string, string[]> = {
  fr: ["région", "region", "département", "departement", "arrondissement", "commune", "ville"],
  en: ["region", "state", "province", "county", "district", "city", "town"],
  ar: ["منطقة", "إقليم", "محافظة"],
  tr: ["ili", "ilçe", "bölge"],
  zh: ["省", "市", "区"],
};

/** Tous les mots bruit dans un seul Set */
const ALL_NOISE_WORDS = new Set(
  Object.values(NOISE_WORDS).flat().map((w) => w.toLowerCase()),
);

/** Normalise un nom géographique pour la comparaison */
export function normalizeGeoName(name: string): string {
  if (!name) return "";
  
  return name
    .toLowerCase()
    // Accents
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    // Ponctuation
    .replace(/[.,;:!?()[\]{}\/\\|"'\-–—_]/g, " ")
    // Mots inutiles
    .split(/\s+/)
    .filter((word) => word.length > 0 && !ALL_NOISE_WORDS.has(word))
    .join(" ")
    .trim();
}

/** Calcule un score de similarité entre deux noms (0-1) */
export function geoSimilarity(a: string, b: string): number {
  const na = normalizeGeoName(a);
  const nb = normalizeGeoName(b);
  
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  
  // Un contient l'autre
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  
  // Distance de Levenshtein simple
  const dist = levenshteinDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  
  return 1 - dist / maxLen;
}

/** Trouve le meilleur match dans une liste */
export function findBestGeoMatch<T extends { name: string }>(
  needle: string,
  haystack: T[],
  threshold = 0.7,
): T | null {
  if (!needle || haystack.length === 0) return null;
  
  let best: T | null = null;
  let bestScore = threshold;
  
  for (const item of haystack) {
    const score = geoSimilarity(needle, item.name);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  
  return best;
}

/** Distance de Levenshtein (simple, non optimisée — suffisant pour de courts noms de villes) */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/** Alias connus pour les régions/villes (peut être étendu) */
export const GEO_ALIASES: Record<string, string[]> = {
  // Sénégal
  "dakar": ["dakar", "region de dakar", "dakar region", "داكار"],
  "thies": ["thies", "thiès", "region de thies", "thies region"],
  "saint-louis": ["saint-louis", "saint louis", "region de saint-louis"],
  // France
  "ile-de-france": ["ile-de-france", "île-de-france", "idf"],
  "provence-alpes-cote-d-azur": ["provence-alpes-cote-d-azur", "paca", "provence"],
  // USA
  "california": ["california", "ca", "calif."],
  "new-york": ["new york", "ny", "nyc"],
};

/** Vérifie si deux noms correspondent au même lieu (via aliases) */
export function areSamePlace(name1: string, name2: string): boolean {
  const n1 = normalizeGeoName(name1);
  const n2 = normalizeGeoName(name2);
  
  if (n1 === n2) return true;
  
  // Check aliases
  for (const [canonical, aliases] of Object.entries(GEO_ALIASES)) {
    const aliasSet = new Set(aliases.map(normalizeGeoName));
    if (aliasSet.has(n1) && aliasSet.has(n2)) return true;
  }
  
  return false;
}
