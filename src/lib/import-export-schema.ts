// Shared constants and types for the bulk product import/export system.

export const IMPORT_COLUMNS = [
  "Type",
  "Action",
  "Code produit",
  "Code variante",
  "Boutique",
  "Désignation",
  "Nom",
  "Description",
  "Catégorie",
  "Sous-catégorie",
  "Sous-sous-catégorie",
  "Prix affiché",
  "Prix variante",
  "Stock",
  "Nom option 1",
  "Valeur option 1",
  "Nom option 2",
  "Valeur option 2",
  "Nom option 3",
  "Valeur option 3",
  "Images produit",
  "Image variante",
  "Pays livraison",
  "Statut",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export type RowType = "parent" | "variant";
export type RowAction = "create" | "update" | "delete" | "ignore";

export interface ParsedRow {
  rowIndex: number; // 1-based excluding header
  type: RowType;
  action: RowAction;
  productCode: string;
  variantCode?: string;
  shop?: string;
  designation?: string;
  name?: string;
  description?: string;
  category?: string;
  subCategory?: string;
  subSubCategory?: string;
  displayPrice?: number;
  variantPrice?: number;
  stock?: number;
  options: { name: string; value: string }[];
  productImages: string[]; // image IDs
  variantImage?: string; // image ID
  destinationCountry?: string;
  status?: string;
}

export interface PreviewError {
  row: number;
  field?: string;
  severity: "error" | "warning";
  message: string;
}

export interface PreviewSummary {
  totalRows: number;
  parents: number;
  variants: number;
  toCreate: number;
  toUpdate: number;
  toDelete: number;
  errors: number;
  warnings: number;
}

export interface PreviewResult {
  importId: string;
  summary: PreviewSummary;
  errors: PreviewError[];
  rows: ParsedRow[];
  imageIds: { id: string; resolved: boolean }[];
}
