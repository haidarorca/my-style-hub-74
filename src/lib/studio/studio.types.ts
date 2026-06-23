// ============================================================
// Types TypeScript — KawZone Studio (Vues Configurables)
// Phase 1 : Fondations
// ============================================================

// ------------------------------------------------------------------
// Entités et champs (Schema Registry)
// ------------------------------------------------------------------

export type StudioFieldType = "text" | "number" | "date" | "boolean" | "enum" | "relation";

export interface SchemaField {
  id: string;           // nom technique du champ
  label: string;        // libellé affiché
  type: StudioFieldType;
  filterable: boolean;
  sortable: boolean;
  groupable?: boolean;  // placeholder pour Phase 2 (KPI)
  enum?: string[];      // valeurs possibles (si type = "enum")
  table?: string;       // table de jointure (si type = "relation")
  format?: "currency" | "percentage" | "date" | "datetime"; // format d'affichage
  aggregate?: "count" | "sum" | "avg"; // placeholder Phase 2
  virtual?: boolean;    // placeholder — champ calculé, non en BDD
}

export interface SchemaRelation {
  id: string;           // nom de la relation
  label: string;        // libellé affiché
  targetEntity: string; // ID de l'entité cible
  type: "one-to-many" | "many-to-one";
  joinField: string;    // champ de jointure FK
  displayField?: string; // champ à afficher de l'entité liée
}

export interface SchemaEntity {
  id: string;           // identifiant technique
  label: string;        // libellé affiché
  table: string;        // nom de la table Supabase
  fields: SchemaField[];
  relations: SchemaRelation[];
}

// ------------------------------------------------------------------
// Configuration des vues
// ------------------------------------------------------------------

export type StudioTemplateKey = "articles_vendus" | "sous_commandes" | "produits";

export type StudioFilterOp =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "ilike" | "in" | "is" | "not_is";

export interface StudioFilter {
  field: string;
  op: StudioFilterOp;
  value: string | number | boolean | string[] | null;
}

export interface StudioSort {
  field: string;
  dir: "asc" | "desc";
}

export interface StudioViewConfig {
  templateKey: StudioTemplateKey;
  columns: string[];
  filters: StudioFilter[];
  sort: StudioSort | null;
  pageSize: number;
}

// ------------------------------------------------------------------
// Vue sauvegardée (DB)
// ------------------------------------------------------------------

export interface StudioView {
  id: string;
  name: string;
  description: string | null;
  template_key: StudioTemplateKey;
  config: StudioViewConfig;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------------
// Paramètres API
// ------------------------------------------------------------------

export interface ExecuteQueryParams {
  templateKey: StudioTemplateKey;
  columns: string[];
  filters: StudioFilter[];
  sort: StudioSort | null;
  page: number;
  pageSize: number;
}

export interface ExecuteQueryResult {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SaveViewParams {
  name: string;
  description?: string;
  templateKey: StudioTemplateKey;
  config: StudioViewConfig;
}

export interface ExportCsvParams {
  templateKey: StudioTemplateKey;
  columns: string[];
  filters: StudioFilter[];
  sort: StudioSort | null;
  maxRows?: number;
}

// ------------------------------------------------------------------
// Limites de sécurité
// ------------------------------------------------------------------

export const STUDIO_LIMITS = {
  MAX_ROWS_PER_QUERY: 500,
  MAX_ROWS_EXPORT: 10_000,
  MAX_FILTERS: 5,
  MAX_VIEWS_PER_ADMIN: 50,
  TIMEOUT_MS: 15_000,
  MAX_PAGES: 100,
} as const;
