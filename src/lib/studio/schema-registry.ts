// ============================================================
// Schema Registry — KawZone Studio (Vues Configurables)
// Phase 1 : Fondations
// Description declarative des 3 entites MVP
// ============================================================

import type { SchemaEntity, SchemaField, SchemaRelation } from "./studio.types";

// ------------------------------------------------------------------
// Champs communs reutilisables
// ------------------------------------------------------------------

const CREATED_AT: SchemaField = {
  id: "created_at", label: "Date de creation", type: "date",
  filterable: true, sortable: true, format: "datetime",
};

const UPDATED_AT: SchemaField = {
  id: "updated_at", label: "Date de modification", type: "date",
  filterable: true, sortable: true, format: "datetime",
};

const ID_FIELD: SchemaField = {
  id: "id", label: "ID", type: "text",
  filterable: true, sortable: true,
};

// ------------------------------------------------------------------
// Entite 1 : ARTICLES VENDUS (order_items)
// ------------------------------------------------------------------

const ORDER_ITEMS_FIELDS: SchemaField[] = [
  ID_FIELD,
  {
    id: "product_name", label: "Nom du produit", type: "text",
    filterable: true, sortable: true,
  },
  {
    id: "product_code", label: "Code produit", type: "text",
    filterable: true, sortable: true,
  },
  {
    id: "quantity", label: "Quantite", type: "number",
    filterable: true, sortable: true, aggregate: "sum",
  },
  {
    id: "unit_price", label: "Prix unitaire", type: "number",
    filterable: true, sortable: true, format: "currency", aggregate: "sum",
  },
  {
    id: "color", label: "Couleur", type: "text",
    filterable: true, sortable: true,
  },
  {
    id: "size", label: "Taille", type: "text",
    filterable: true, sortable: true,
  },
  {
    id: "vendor_id", label: "ID vendeur", type: "relation",
    filterable: true, sortable: true, table: "profiles",
  },
  {
    id: "order_id", label: "ID commande", type: "relation",
    filterable: true, sortable: true, table: "orders",
  },
  {
    id: "sub_order_key", label: "Cle sous-commande", type: "text",
    filterable: true, sortable: true,
  },
  {
    id: "product_id", label: "ID produit", type: "relation",
    filterable: true, sortable: true, table: "products",
  },
  {
    id: "product_image_url", label: "Image produit", type: "text",
    filterable: false, sortable: false,
  },
  {
    id: "shop_name_snapshot", label: "Boutique (snapshot)", type: "text",
    filterable: true, sortable: true,
  },
  CREATED_AT,
];

const ORDER_ITEMS_RELATIONS: SchemaRelation[] = [
  {
    id: "order", label: "Commande", targetEntity: "orders",
    type: "many-to-one", joinField: "order_id", displayField: "customer_name",
  },
  {
    id: "product", label: "Produit", targetEntity: "products",
    type: "many-to-one", joinField: "product_id", displayField: "name",
  },
  {
    id: "vendor", label: "Vendeur", targetEntity: "profiles",
    type: "many-to-one", joinField: "vendor_id", displayField: "shop_name",
  },
];

// ------------------------------------------------------------------
// Entite 2 : SOUS-COMMANDES (sub_order_states)
// ------------------------------------------------------------------

const SUB_ORDERS_FIELDS: SchemaField[] = [
  ID_FIELD,
  {
    id: "sub_order_key", label: "Cle sous-commande", type: "text",
    filterable: true, sortable: true,
  },
  {
    id: "status", label: "Statut", type: "enum",
    filterable: true, sortable: true,
    enum: ["new", "confirmed", "preparing", "ready", "shipped", "delivered", "cancelled"],
  },
  {
    id: "order_id", label: "ID commande", type: "relation",
    filterable: true, sortable: true, table: "orders",
  },
  CREATED_AT,
  UPDATED_AT,
];

const SUB_ORDERS_RELATIONS: SchemaRelation[] = [
  {
    id: "order", label: "Commande", targetEntity: "orders",
    type: "many-to-one", joinField: "order_id",
  },
];

// ------------------------------------------------------------------
// Entite 3 : PRODUITS (products)
// ------------------------------------------------------------------

const PRODUCTS_FIELDS: SchemaField[] = [
  ID_FIELD,
  {
    id: "name", label: "Nom", type: "text",
    filterable: true, sortable: true,
  },
  {
    id: "code", label: "Code", type: "text",
    filterable: true, sortable: true,
  },
  {
    id: "price", label: "Prix", type: "number",
    filterable: true, sortable: true, format: "currency", aggregate: "sum",
  },
  {
    id: "status", label: "Statut", type: "enum",
    filterable: true, sortable: true,
    enum: ["active", "inactive", "draft", "archived", "deleted"],
  },
  {
    id: "is_active", label: "Actif", type: "boolean",
    filterable: true, sortable: true,
  },
  {
    id: "brand", label: "Marque", type: "text",
    filterable: true, sortable: true,
  },
  {
    id: "vendor_id", label: "ID vendeur", type: "relation",
    filterable: true, sortable: true, table: "profiles",
  },
  {
    id: "category_id", label: "ID categorie", type: "relation",
    filterable: true, sortable: true, table: "categories",
  },
  {
    id: "created_at", label: "Date de creation", type: "date",
    filterable: true, sortable: true, format: "datetime",
  },
  {
    id: "weight_kg", label: "Poids (kg)", type: "number",
    filterable: true, sortable: true,
  },
  {
    id: "views_count", label: "Vues", type: "number",
    filterable: true, sortable: true, aggregate: "sum",
  },
];

const PRODUCTS_RELATIONS: SchemaRelation[] = [
  {
    id: "vendor", label: "Vendeur", targetEntity: "profiles",
    type: "many-to-one", joinField: "vendor_id", displayField: "shop_name",
  },
  {
    id: "category", label: "Categorie", targetEntity: "categories",
    type: "many-to-one", joinField: "category_id", displayField: "name",
  },
];

// ------------------------------------------------------------------
// REGISTRY — Map des entites accessibles
// ------------------------------------------------------------------

export const STUDIO_ENTITIES: Record<string, SchemaEntity> = {
  order_items: {
    id: "order_items",
    label: "Articles vendus",
    table: "order_items",
    fields: ORDER_ITEMS_FIELDS,
    relations: ORDER_ITEMS_RELATIONS,
  },
  sub_orders: {
    id: "sub_orders",
    label: "Sous-commandes",
    table: "sub_order_states",
    fields: SUB_ORDERS_FIELDS,
    relations: SUB_ORDERS_RELATIONS,
  },
  products: {
    id: "products",
    label: "Produits",
    table: "products",
    fields: PRODUCTS_FIELDS,
    relations: PRODUCTS_RELATIONS,
  },
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

export function getEntity(entityId: string): SchemaEntity | undefined {
  return STUDIO_ENTITIES[entityId];
}

export function getEntityFields(entityId: string): SchemaField[] {
  return STUDIO_ENTITIES[entityId]?.fields ?? [];
}

export function getField(entityId: string, fieldId: string): SchemaField | undefined {
  return STUDIO_ENTITIES[entityId]?.fields.find((f) => f.id === fieldId);
}

export function isFieldValid(entityId: string, fieldId: string): boolean {
  return getField(entityId, fieldId) !== undefined;
}

export function isColumnSelectable(entityId: string, fieldId: string): boolean {
  const field = getField(entityId, fieldId);
  return field !== undefined && field.type !== "relation";
}

export function isFieldFilterable(entityId: string, fieldId: string): boolean {
  const field = getField(entityId, fieldId);
  return field?.filterable === true;
}

export function getAllowedOperators(fieldType: SchemaField["type"]): string[] {
  switch (fieldType) {
    case "text":
      return ["eq", "neq", "ilike", "in", "is", "not_is"];
    case "number":
      return ["eq", "neq", "gt", "gte", "lt", "lte", "is", "not_is"];
    case "date":
      return ["eq", "neq", "gt", "gte", "lt", "lte", "is", "not_is"];
    case "boolean":
      return ["eq", "is", "not_is"];
    case "enum":
      return ["eq", "neq", "in", "is", "not_is"];
    case "relation":
      return ["eq", "neq", "in", "is", "not_is"];
    default:
      return ["eq"];
  }
}

export function validateFilter(entityId: string, filter: { field: string; op: string; value: unknown }): string | null {
  const field = getField(entityId, filter.field);
  if (!field) return `Champ inconnu: ${filter.field}`;
  if (!field.filterable) return `Champ non filtrable: ${filter.field}`;
  const allowedOps = getAllowedOperators(field.type);
  if (!allowedOps.includes(filter.op)) {
    return `Operateur non autorise: ${filter.op} sur type ${field.type}`;
  }
  return null;
}
