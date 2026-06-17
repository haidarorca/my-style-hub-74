// User-facing message helpers for the admin product-creation flow.
// Kept out of the route file so the TanStack router code-splitter doesn't
// try to re-parse them as part of the route's split chunks.

export function humanizeOcrError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const s = raw.toLowerCase();
  if (/at most\s+\d+\s+element/.test(s) || /maximum\s+\d+\s+images?/.test(s)) {
    return "Maximum 10 images autorisées par analyse.";
  }
  if (/at least\s+1\s+element/.test(s) || /ajoutez au moins/.test(s)) {
    return "Ajoutez au moins une capture avant de lancer l'analyse.";
  }
  if (/timeout|expir/.test(s)) return "Analyse trop longue. Réessayez avec moins de captures.";
  if (/limite ia|429/.test(s)) return "Limite IA atteinte. Réessayez dans un instant.";
  if (/crédits ia|402/.test(s)) return "Crédits IA épuisés. Ajoutez du crédit pour continuer.";
  if (/illisible|réponse ia/.test(s))
    return "Captures peu lisibles. Réessayez avec des images plus nettes.";
  if (/network|fetch|failed to fetch/.test(s))
    return "Connexion instable. Vérifiez votre réseau et réessayez.";
  if (/\barray\b|\bstring\b|\bzod\b|expected|received|input|validation/.test(s)) {
    return "Format d'images non accepté. Réessayez avec des captures JPG/PNG standard.";
  }
  return "Analyse impossible pour le moment. Réessayez ou ajoutez les variantes à la main.";
}

export function humanizeUrlError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const s = raw.toLowerCase();
  if (/aucun lien|collez/.test(s))
    return "Collez un lien produit (Taobao, 1688, AliExpress…) ou le texte de partage.";
  if (/apify|scraping/.test(s))
    return "Lien protégé ou indisponible. Remplissez les champs manuellement.";
  if (/timeout|expir/.test(s)) return "Le site source est trop lent. Réessayez dans un instant.";
  if (/429/.test(s)) return "Trop de requêtes. Réessayez dans une minute.";
  if (/402|crédits/.test(s))
    return "Crédits IA épuisés. L'analyse automatique est indisponible.";
  if (/\bzod\b|expected|received|input|validation/.test(s)) {
    return "Lien non reconnu. Vérifiez l'URL puis réessayez.";
  }
  if (/impossible d'extraire|login wall|protégé/.test(s)) {
    return "Page protégée — remplissez les champs manuellement.";
  }
  return "Analyse du lien impossible. Vous pouvez remplir le formulaire manuellement.";
}
