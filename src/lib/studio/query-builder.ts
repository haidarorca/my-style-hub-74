// ============================================================
// Query Builder — KawZone Studio
// Phase 2 : Construction modulaire des requêtes Supabase
// Architecture : fonctions pures composables
// ============================================================

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { StudioViewConfig, StudioFilter, StudioSort, StudioTemplateKey } from "./studio.types";
import { STUDIO_LIMITS } from "./studio.types";
import { getEntity, buildSelectClause, sanitizeColumns } from "./studio-security";

// ------------------------------------------------------------------
// 1. BUILDER SELECT
// ------------------------------------------------------------------

export function buildSelect(config: Pick<StudioViewConfig, "templateKey" | "columns">): string {
  const entity = getEntity(mapTemplateToEntity(config.templateKey));
  if (!entity) return "*";
  return buildSelectClause(entity.id, sanitizeColumns(entity.id, config.columns));
}

// ------------------------------------------------------------------
// 2. BUILDER WHERE — applique les filtres à la query
// ------------------------------------------------------------------

export function applyFilters(
  query: any,
  filters: StudioFilter[],
): void {
  for (const f of filters) {
    switch (f.op) {
      case "eq":
        query.eq(f.field, f.value);
        break;
      case "neq":
        query.neq(f.field, f.value);
        break;
      case "gt":
        query.gt(f.field, f.value);
        break;
      case "gte":
        query.gte(f.field, f.value);
        break;
      case "lt":
        query.lt(f.field, f.value);
        break;
      case "lte":
        query.lte(f.field, f.value);
        break;
      case "ilike":
        query.ilike(f.field, `%${f.value}%`);
        break;
      case "in":
        if (Array.isArray(f.value)) query.in(f.field, f.value);
        break;
      case "is":
        query.is(f.field, f.value);
        break;
      case "not_is":
        query.not(f.field, "is", f.value);
        break;
    }
  }
}

// ------------------------------------------------------------------
// 3. BUILDER ORDER
// ------------------------------------------------------------------

export function applyOrder(query: any, sort: StudioSort | null): void {
  if (!sort) {
    query.order("created_at", { ascending: false });
    return;
  }
  query.order(sort.field, { ascending: sort.dir === "asc" });
}

// ------------------------------------------------------------------
// 4. BUILDER PAGINATION
// ------------------------------------------------------------------

export function getRange(page: number, pageSize: number): { from: number; to: number } {
  const safePageSize = Math.min(pageSize, STUDIO_LIMITS.MAX_ROWS_PER_QUERY);
  const from = page * safePageSize;
  const to = from + safePageSize - 1;
  return { from, to };
}

// ------------------------------------------------------------------
// 5. ORCHESTRATEUR — assemble tous les builders
// ------------------------------------------------------------------

export interface BuiltQuery {
  query: any;
  from: number;
  to: number;
}

export function buildQuery(config: StudioViewConfig, page: number): BuiltQuery {
  const entity = getEntity(mapTemplateToEntity(config.templateKey));
  if (!entity) throw new Error(`Entite inconnue: ${config.templateKey}`);

  const selectClause = buildSelect(config);
  const { from, to } = getRange(page, config.pageSize);

  const query = supabaseAdmin
    .from(entity.table)
    .select(selectClause, { count: "exact", head: false });

  applyFilters(query, config.filters);
  applyOrder(query, config.sort);
  query.range(from, to);

  return { query, from, to };
}

// ------------------------------------------------------------------
// 6. TEMPLATE → ENTITY mapping
// ------------------------------------------------------------------

export function mapTemplateToEntity(templateKey: StudioTemplateKey): string {
  switch (templateKey) {
    case "articles_vendus": return "order_items";
    case "sous_commandes": return "sub_orders";
    case "produits": return "products";
    default: return templateKey;
  }
}

// ------------------------------------------------------------------
// 7. EXPORT CSV (sans pagination)
// ------------------------------------------------------------------

export function buildExportQuery(config: StudioViewConfig, maxRows: number): any {
  const entity = getEntity(mapTemplateToEntity(config.templateKey));
  if (!entity) throw new Error(`Entite inconnue: ${config.templateKey}`);

  const selectClause = buildSelect(config);
  const safeMax = Math.min(maxRows, STUDIO_LIMITS.MAX_ROWS_EXPORT);

  const query = supabaseAdmin
    .from(entity.table)
    .select(selectClause, { count: "exact", head: false });

  applyFilters(query, config.filters);
  applyOrder(query, config.sort);
  query.limit(safeMax);

  return query;
}
