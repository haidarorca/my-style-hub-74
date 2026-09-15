/**
 * admin-permissions.ts — Catalogue central des permissions administratives.
 *
 * Règle : une permission "module" (ex: `products`) accorde automatiquement
 * toutes ses actions détaillées (`products.view`, `products.update`, …).
 * Cette implication est appliquée à la fois côté client (`can()` dans use-auth)
 * et côté serveur (fonction SQL `has_admin_permission`).
 */

export type AdminPermission =
  // Modules (accès complet au module)
  | "orders"
  | "products"
  | "product_validation"
  | "categories"
  | "vendors"
  | "customers"
  | "support"
  | "settings"
  | "commissions"
  | "finance"
  | "admins"
  | "audit"
  | "notifications"
  | "studio_access"
  // Produits
  | "products.view"
  | "products.create"
  | "products.update"
  | "products.delete"
  | "products.publish"
  | "products.import_export"
  | "products.media"
  | "products.groups"
  // Validation produits
  | "product_validation.view"
  | "product_validation.approve"
  | "product_validation.reject"
  // Catégories
  | "categories.view"
  | "categories.create"
  | "categories.update"
  | "categories.delete"
  // Commandes
  | "orders.view"
  | "orders.update"
  | "orders.confirm"
  | "orders.cancel"
  | "orders.delete"
  | "orders.logistics"
  | "orders.payments"
  | "orders.returns"
  // Clients
  | "customers.view"
  | "customers.update"
  | "customers.delete"
  | "customers.export"
  // Vendeurs
  | "vendors.view"
  | "vendors.create"
  | "vendors.update"
  | "vendors.delete"
  | "vendors.suspend"
  | "vendors.shops"
  // Support & modération
  | "support.view"
  | "support.reply"
  | "support.reviews"
  | "support.reports"
  // Paramètres
  | "settings.view"
  | "settings.update"
  | "settings.content"
  | "settings.countries"
  | "settings.currencies"
  | "settings.shipping"
  | "settings.contact"
  | "settings.integrations"
  // Commissions
  | "commissions.view"
  | "commissions.manage"
  // Finance
  | "finance.view"
  | "finance.manage"
  // Administrateurs
  | "admins.view"
  | "admins.manage"
  // Journal d'audit
  | "audit.view"
  // Notifications
  | "notifications.view"
  | "notifications.send"
  // SAV (existant)
  | "sav_view_all"
  | "sav_assign"
  | "sav_decide"
  | "sav_override"
  | "sav_rules_manage"
  | "sav_refund_issue"
  | "sav_exception_create";

export interface PermissionAction {
  key: AdminPermission;
  label: string;
  /** Action sensible : signalée visuellement dans l'interface. */
  sensitive?: boolean;
}

export interface PermissionModule {
  /** Identifiant unique du bloc dans l'interface. */
  id: string;
  /** Permission « module entier » (absente pour les blocs sans raccourci global). */
  key?: AdminPermission;
  label: string;
  description: string;
  actions: PermissionAction[];
  /** Réservé au super administrateur — non attribuable à un admin standard. */
  superOnly?: boolean;
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    id: "products",
    key: "products",
    label: "Produits",
    description: "Catalogue, fiches produits, médias, groupes, import/export.",
    actions: [
      { key: "products.view", label: "Voir" },
      { key: "products.create", label: "Ajouter" },
      { key: "products.update", label: "Modifier" },
      { key: "products.delete", label: "Supprimer", sensitive: true },
      { key: "products.publish", label: "Publier / Dépublier" },
      { key: "products.media", label: "Photos & vidéos" },
      { key: "products.groups", label: "Groupes de produits" },
      { key: "products.import_export", label: "Importer / Exporter" },
    ],
  },
  {
    id: "product_validation",
    key: "product_validation",
    label: "Validation des produits",
    description: "Modération des produits soumis par les vendeurs.",
    actions: [
      { key: "product_validation.view", label: "Voir la file" },
      { key: "product_validation.approve", label: "Valider" },
      { key: "product_validation.reject", label: "Refuser / Demander des changements" },
    ],
  },
  {
    id: "categories",
    key: "categories",
    label: "Catégories",
    description: "Arborescence des catégories et demandes de catégories.",
    actions: [
      { key: "categories.view", label: "Voir" },
      { key: "categories.create", label: "Ajouter" },
      { key: "categories.update", label: "Modifier" },
      { key: "categories.delete", label: "Supprimer", sensitive: true },
    ],
  },
  {
    id: "orders",
    key: "orders",
    label: "Commandes & Logistique",
    description: "Commandes, cockpit, préparation, expéditions, retours.",
    actions: [
      { key: "orders.view", label: "Voir" },
      { key: "orders.update", label: "Modifier" },
      { key: "orders.confirm", label: "Valider / Faire avancer" },
      { key: "orders.cancel", label: "Annuler", sensitive: true },
      { key: "orders.delete", label: "Supprimer", sensitive: true },
      { key: "orders.logistics", label: "Logistique & transport" },
      { key: "orders.payments", label: "Paiements de commande", sensitive: true },
      { key: "orders.returns", label: "Retours & annulations" },
    ],
  },
  {
    id: "customers",
    key: "customers",
    label: "Clients",
    description: "Comptes clients, adresses, historique.",
    actions: [
      { key: "customers.view", label: "Voir" },
      { key: "customers.update", label: "Modifier" },
      { key: "customers.delete", label: "Supprimer", sensitive: true },
      { key: "customers.export", label: "Exporter" },
    ],
  },
  {
    id: "vendors",
    key: "vendors",
    label: "Vendeurs & Boutiques",
    description: "Comptes vendeurs, boutiques admin, statut des vendeurs.",
    actions: [
      { key: "vendors.view", label: "Voir" },
      { key: "vendors.create", label: "Créer" },
      { key: "vendors.update", label: "Modifier" },
      { key: "vendors.suspend", label: "Suspendre / Réactiver", sensitive: true },
      { key: "vendors.delete", label: "Supprimer", sensitive: true },
      { key: "vendors.shops", label: "Gérer les boutiques admin" },
    ],
  },
  {
    id: "support",
    key: "support",
    label: "Support & Modération",
    description: "Conversations support, avis clients, signalements.",
    actions: [
      { key: "support.view", label: "Voir" },
      { key: "support.reply", label: "Répondre" },
      { key: "support.reviews", label: "Modérer les avis" },
      { key: "support.reports", label: "Traiter les signalements" },
    ],
  },
  {
    id: "commissions",
    key: "commissions",
    label: "Commissions",
    description: "Règles de commission et paiements aux vendeurs.",
    actions: [
      { key: "commissions.view", label: "Voir" },
      { key: "commissions.manage", label: "Gérer les règles & paiements", sensitive: true },
    ],
  },
  {
    id: "finance",
    key: "finance",
    label: "Finance",
    description: "Mouvements financiers, clôture journalière, remboursements.",
    actions: [
      { key: "finance.view", label: "Voir" },
      { key: "finance.manage", label: "Enregistrer des mouvements", sensitive: true },
    ],
  },
  {
    id: "settings",
    key: "settings",
    label: "Paramètres du site",
    description: "Réglages généraux, contenu, pays, devises, transport, intégrations.",
    actions: [
      { key: "settings.view", label: "Voir" },
      { key: "settings.update", label: "Modifier les réglages", sensitive: true },
      { key: "settings.content", label: "Contenu & bannières" },
      { key: "settings.countries", label: "Pays, régions & villes" },
      { key: "settings.currencies", label: "Devises & taux", sensitive: true },
      { key: "settings.shipping", label: "Services de transport" },
      { key: "settings.contact", label: "Contacts & support" },
      { key: "settings.integrations", label: "Intégrations & imports externes", sensitive: true },
    ],
  },
  {
    id: "notifications",
    key: "notifications",
    label: "Notifications",
    description: "Centre de notifications administrateur.",
    actions: [
      { key: "notifications.view", label: "Voir" },
      { key: "notifications.send", label: "Envoyer / Diffuser" },
    ],
  },
  {
    id: "studio_access",
    key: "studio_access",
    label: "Studio",
    description: "Vues configurables et exports de données.",
    actions: [{ key: "studio_access", label: "Accès au Studio" }],
  },
  {
    id: "audit",
    key: "audit",
    label: "Journal d'audit",
    description: "Historique des actions administratives.",
    actions: [{ key: "audit.view", label: "Consulter le journal" }],
  },
  {
    id: "admins",
    key: "admins",
    label: "Administrateurs",
    description: "Gestion des administrateurs et de leurs permissions.",
    superOnly: true,
    actions: [
      { key: "admins.view", label: "Voir les administrateurs" },
      { key: "admins.manage", label: "Créer / Modifier les permissions", sensitive: true },
    ],
  },
  {
    id: "sav",
    label: "SAV — Service après-vente",
    description: "Dossiers SAV : assignation, décisions, remboursements.",
    actions: [
      { key: "sav_view_all", label: "Voir tous les dossiers" },
      { key: "sav_assign", label: "Assigner" },
      { key: "sav_decide", label: "Décider" },
      { key: "sav_override", label: "Surcharger une décision", sensitive: true },
      { key: "sav_rules_manage", label: "Gérer les règles" },
      { key: "sav_refund_issue", label: "Émettre un remboursement", sensitive: true },
      { key: "sav_exception_create", label: "Créer une exception", sensitive: true },
    ],
  },
];

/** Libellés à plat (compatibilité avec l'ancien code). */
export const ADMIN_PERMISSION_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const mod of PERMISSION_MODULES) {
    if (mod.key) map[mod.key] = mod.label;
    for (const a of mod.actions) map[a.key] = `${mod.label} — ${a.label}`;
  }
  return map;
})();

/** `products.update` → `products` ; `orders` → `orders`. */
export function permissionParent(perm: string): string {
  return perm.split(".")[0]!;
}

/**
 * Vérifie une permission en tenant compte de l'implication module → actions.
 * Miroir exact de la fonction SQL `has_admin_permission`.
 */
export function permissionGranted(
  granted: readonly string[],
  perm: AdminPermission,
): boolean {
  return granted.includes(perm) || granted.includes(permissionParent(perm));
}
