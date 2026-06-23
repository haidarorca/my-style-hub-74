// ============================================================
// Studio Security — KawZone Studio
// Phase 1 : Validations Zod, limites, whitelist
// ============================================================

import { z } from "zod";
import { STUDIO_LIMITS, type StudioTemplateKey, type StudioFilterOp } from "./studio.types";
import { isFieldValid, isColumnSelectable, isFieldFilterable, getAllowedOperators, validateFilter, getEntity } from "./schema-registry";

// ------------------------------------------------------------------
// Schemas Zod
// ------------------------------------------------------------------

export const StudioFilterOpSchema = z.enum([
  "eq", "neq", "gt", "gte", "lt", "lte", "ilike", "in", "is", "not_is",
]);

export const StudioFilterSchema = z.object({
  field: z.string().min(1),
  op: StudioFilterOpSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
});

export const StudioSortSchema = z.object({
  field: z.string().min(1),
  dir: z.enum(["asc", "desc"]),
}).nullable();

export const StudioViewConfigSchema = z.object({
  templateKey: z.enum(["articles_vendus", "sous_commandes", "produits"]),
  columns: z.array(z.string().min(1)).min(1).max(30),
  filters: z.array(StudioFilterSchema).max(STUDIO_LIMITS.MAX_FILTERS),
  sort: StudioSortSchema,
  pageSize: z.number().int().min(10).max(500),
});

export const ExecuteQueryParamsSchema = z.object({
  templateKey: z.enum(["articles_vendus", "sous_commandes", "produits"]),
  columns: z.array(z.string().min(1)).min(1),
  filters: z.array(StudioFilterSchema).max(STUDIO_LIMITS.MAX_FILTERS),
  sort: StudioSortSchema,
  page: z.number().int().min(0).max(STUDIO_LIMITS.MAX_PAGES),
  pageSize: z.number().int().min(10).max(500),
});

export const SaveViewParamsSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  templateKey: z.enum(["articles_vendus", "sous_commandes", "produits"]),
  config: StudioViewConfigSchema,
});

export const ViewIdSchema = z.object({
  viewId: z.string().uuid(),
});

export const ExportCsvParamsSchema = z.object({
  templateKey: z.enum(["articles_vendus", "sous_commandes", "produits"]),
  columns: z.array(z.string().min(1)).min(1),
  filters: z.array(StudioFilterSchema).max(STUDIO_LIMITS.MAX_FILTERS),
  sort: StudioSortSchema,
  maxRows: z.number().int().min(1).max(STUDIO_LIMITS.MAX_ROWS_EXPORT).optional(),
});

// ------------------------------------------------------------------
// Validations metier (Schema Registry)
// ------------------------------------------------------------------

export interface SecurityValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateViewConfigSecurity(
  entityId: string,
  columns: string[],
  filters: Array<{ field: string; op: string; value: unknown }>,
  sort: { field: string; dir: string } | null,
): SecurityValidationResult {
  const errors: string[] = [];

  // 1. Toutes les colonnes sont connues et selectionnables
  for (const col of columns) {
    if (!isColumnSelectable(entityId, col)) {
      errors.push(`Colonne inconnue ou non selectionnable: ${col}`);
    }
  }

  // 2. Tous les filtres sont sur des champs filtrables
  for (const f of filters) {
    const err = validateFilter(entityId, f);
    if (err) errors.push(err);
  }

  // 3. Le tri est sur un champ sortable
  if (sort && !isFieldValid(entityId, sort.field)) {
    errors.push(`Champ de tri inconnu: ${sort.field}`);
  }

  // 4. Nombre de filtres
  if (filters.length > STUDIO_LIMITS.MAX_FILTERS) {
    errors.push(`Trop de filtres: ${filters.length} > ${STUDIO_LIMITS.MAX_FILTERS}`);
  }

  // 5. Colonne "id" toujours incluse (pour tracking)
  if (!columns.includes("id")) {
    errors.push("La colonne 'id' est obligatoire");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function sanitizeColumns(entityId: string, columns: string[]): string[] {
  // Garde uniquement les colonnes valides + "id"
  const sanitized = columns.filter((c) => isColumnSelectable(entityId, c));
  if (!sanitized.includes("id")) sanitized.unshift("id");
  return [...new Set(sanitized)]; // dedup
}

export function sanitizeFilters(
  entityId: string,
  filters: Array<{ field: string; op: string; value: unknown }>,
): Array<{ field: string; op: string; value: unknown }> {
  return filters.filter((f) => {
    const err = validateFilter(entityId, f);
    return err === null;
  }).slice(0, STUDIO_LIMITS.MAX_FILTERS);
}

// ------------------------------------------------------------------
// Helpers de construction securisee de requetes
// ------------------------------------------------------------------

/**
 * Construit la clause SELECT PostgREST avec jointures securisees.
 * N'expose que les champs whitelistes.
 */
export function buildSelectClause(entityId: string, columns: string[]): string {
  const entity = getEntity(entityId);
  if (!entity) return "*";

  // Filtre les colonnes valides
  const validCols = columns.filter((c) => isColumnSelectable(entityId, c));
  if (validCols.length === 0) return "*";

  // Ajoute les jointures pour les relations (1 niveau max)
  const relationSelects: string[] = [];
  for (const rel of entity.relations) {
    if (rel.type === "many-to-one" && rel.displayField) {
      // Jointure PostgREST : relation_name(field1, field2)
      relationSelects.push(`${rel.id}:${rel.joinField}(${rel.displayField})`);
    }
  }

  return [...validCols, ...relationSelects].join(", ");
}

/**
 * Verifie si une requete respecte les limites de securite.
 */
export function checkQueryLimits(pageSize: number): string | null {
  if (pageSize > STUDIO_LIMITS.MAX_ROWS_PER_QUERY) {
    return `pageSize ${pageSize} > max ${STUDIO_LIMITS.MAX_ROWS_PER_QUERY}`;
  }
  return null;
}
