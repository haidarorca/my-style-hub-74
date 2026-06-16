// ═══════════════════════════════════════════════════════════════
// PÉRIMÈTRE KAWZONE
//
// Règle métier validée :
//   Kawzone gère uniquement les boutiques :
//     - Admin           (profiles.is_admin_shop = true)
//     - Commission      (profiles.vendor_mode  = 'commission')
//
//   Toute boutique externe / autonome (vendor_mode = 'no_commission'
//   ET is_admin_shop = false) est EXCLUE de l'espace de gestion :
//     - Cockpit, SAV, Finance, Archive
//     - KPI, statistiques, compteurs, Pulse
//     - Dettes & créances, journal financier
//
// Ce module fournit un point unique pour récupérer la liste des
// vendor_ids dans le périmètre, à appeler en tête de chaque
// server function de gestion.
// ═══════════════════════════════════════════════════════════════

export interface KawzoneScope {
  vendorIds: string[];          // liste des vendor_ids gérés
  vendorIdSet: Set<string>;     // pour lookups O(1)
  inClause: string;             // "(id1,id2,...)" prêt pour PostgREST .filter("in", ...)
}

/**
 * Charge la liste des boutiques gérées par Kawzone.
 * À appeler dans chaque server function de gestion, après assertAdmin.
 *
 * @param supabase  client supabase scoppé (depuis context.supabase)
 */
export async function loadKawzoneScope(supabase: any): Promise<KawzoneScope> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, is_admin_shop, vendor_mode")
    .or("is_admin_shop.eq.true,vendor_mode.eq.commission");
  if (error) throw error;
  const vendorIds: string[] = (data ?? []).map((r: any) => r.id as string);
  const vendorIdSet = new Set<string>(vendorIds);
  const inClause = `(${vendorIds.map((v: string) => `"${v}"`).join(",")})`;
  return { vendorIds, vendorIdSet, inClause };
}

/**
 * Filtre un tableau d'objets sur le périmètre Kawzone.
 *  - Garde les lignes dont vendor_id ∈ scope
 *  - EXCLUT les lignes vendor_id non géré
 *  - Garde les lignes vendor_id null (cas global / non rattaché) si keepNull=true
 */
export function inScope<T extends { vendor_id?: string | null }>(
  rows: T[],
  scope: KawzoneScope,
  keepNull = false,
): T[] {
  return rows.filter((r) => {
    if (r.vendor_id == null) return keepNull;
    return scope.vendorIdSet.has(r.vendor_id);
  });
}
