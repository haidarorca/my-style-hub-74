## Préparation groupée des commandes — Vendeur & Admin

Système complet permettant de sélectionner plusieurs commandes et générer une vue regroupée par produit (et par vendeur côté admin) pour faciliter la préparation.

### Périmètre

**Espace vendeur** (`/vendor/orders`)
- Cases à cocher devant chaque commande + sélection multiple (tout/aucun)
- Bouton "Préparation groupée" (apparaît dès 1 sélection)
- Statuts inclus par défaut : `new`, `confirmed` (les autres exclus)
- Page dédiée `/vendor/preparation` recevant les IDs sélectionnés

**Espace admin** (`/admin/orders`)
- Mêmes cases à cocher + bouton
- Page dédiée `/admin/preparation`
- Colonne **Vendeur** visible + regroupement par couple (produit + vendeur)

### Page de préparation (UI partagée)

```
┌─────────────────────────────────────────┐
│ Préparation groupée — 5 commandes       │
│ [Imprimer] [PDF] [Excel] [Copier]       │
├─────────────────────────────────────────┤
│ ▼ 🟦 PRODUIT A · Vendeur X (admin)      │
│    Image · SKU · Qté totale : 6         │
│    ├ Taille M / Noir   ×2  (cmd #abc..) │
│    ├ Taille L / Noir   ×3  (cmd #def..) │
│    └ Taille XL / Blanc ×1  (cmd #ghi..) │
│    [Détails] [Commandes] [Personnalis.] │
├─────────────────────────────────────────┤
│ ▼ 🟧 PRODUIT B …                        │
└─────────────────────────────────────────┘
```

- Bloc accordéon par produit (couleur de fond légère + bordure colorée par produit, hash du product_id → palette de tokens)
- Variantes listées en sous-lignes (taille, couleur, qté, commandes liées)
- Produits personnalisés : bouton "Voir personnalisations" → dialog listant chaque ligne client (texte, police, couleur, image téléchargeable)
- Boutons : marquer en préparation (passe le statut commande à `confirmed`), imprimer (window.print + styles), PDF (via print-to-PDF du navigateur), Excel (xlsx généré côté client), copier résumé texte
- Téléchargement images clients (lien direct par fichier + "tout télécharger" en ZIP)

### Logique de regroupement

- **Clé vendeur** : `product_id + variant_id + customization?` → variante
- **Clé admin** : `vendor_id + product_id + variant_id + customization?` → variante
- Personnalisations (texte/image client) : jamais fusionnées, chacune reste une ligne propre rattachée au produit parent
- Statuts filtrés côté serveur : `new` et `confirmed` uniquement

### Architecture technique

**Backend (server functions)**
- `src/lib/preparation.functions.ts`
  - `getVendorPreparation({ order_ids })` — middleware `requireSupabaseAuth`, filtre `vendor_id = userId`
  - `getAdminPreparation({ order_ids })` — middleware admin, retourne aussi `vendor_id`/`vendor_shop_name`
  - Retour : `groups: [{ product_id, vendor_id?, product, total_qty, variants:[…], customizations:[…], order_refs:[…] }]`

**Frontend**
- `src/components/orders/PreparationView.tsx` — composant partagé (props : `mode: "vendor"|"admin"`, `groups`)
- `src/routes/vendor.preparation.tsx` — lit `?ids=` du querystring, appelle `getVendorPreparation`
- `src/routes/admin.preparation.tsx` — idem côté admin
- Ajout sélection dans `vendor.orders.tsx` et `admin.orders.tsx` (state local `Set<orderId>`, barre d'action fixe en bas mobile / sticky en haut desktop)

**Dépendances**
- `xlsx` pour l'export Excel (déjà courant)
- `jszip` pour le téléchargement groupé des images clients

### Détails techniques

- IDs passés via querystring (limite ~50 commandes par préparation pour rester sous la limite URL)
- Mobile : barre d'action en bas (sticky), cases à cocher à gauche de chaque carte commande
- Print CSS : masquer header/nav, layout A4 propre
- Images chargées en `loading=lazy`
- Pas de modification des statuts en bulk dans cette V1 sauf "marquer en préparation" (= `confirmed`)

### Hors périmètre (V2 possible)

- Vue temps réel multi-utilisateurs
- Bons de préparation imprimables par commande individuelle
- Gestion de stock automatique au passage en préparation
