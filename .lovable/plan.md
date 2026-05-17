› Objectif : un seul espace **Gestion Boutique** propre, rapide et identique pour les vendeurs normaux et les Boutiques Admin, avec isolation stricte par boutique (vendor_id).

---

## 1. Base de données (migration)

Ajouts sur `products` :
- `is_active boolean NOT NULL DEFAULT true` — produit visible/caché par le propriétaire
- `views_count integer NOT NULL DEFAULT 0` — compteur de vues (privé)
- Index : `(vendor_id, created_at DESC)`, `(vendor_id, is_active)`

Mise à jour RLS `products_public_read_approved` :
- ajouter la condition `AND is_active = true` pour le public (le propriétaire et l'admin continuent de tout voir)

Nouvelle fonction RPC `increment_product_view(_product_id uuid)` (SECURITY DEFINER) appelée depuis la page produit publique.

Vue `vendor_product_stats` (SECURITY INVOKER) :
- `product_id`, `views_count`, `sales_count` (sum quantity depuis order_items), `revenue`
- accessible seulement au propriétaire via RLS sur products

---

## 2. Server functions (`src/lib/shop-management.functions.ts`)

Toutes protégées par `requireSupabaseAuth`. Le `shopId` cible est résolu ainsi :
- vendeur normal → `shopId = userId`
- boutique admin → `shopId` passé en param, validé via `profiles.managed_by_admin_id = userId` (ou super_admin)

Functions :
- `listShopProducts({ shopId, page, pageSize, search, status, activeFilter })` — paginé (20/page), retourne produits + image principale + stats privées (views, sales, variants count)
- `toggleProductActive({ productId, isActive })` — vérifie ownership
- `deleteShopProduct({ productId })` — réutilise la logique existante
- `getShopOverview({ shopId })` — totaux (produits, actifs, en attente, ventes 30j)

---

## 3. Routes / UI

### Vendeur normal
- **`/vendor/shop`** (nouvelle) : dashboard Gestion Boutique avec cards stats + raccourci Produits/Ajouter/Statistiques
- **`/vendor/products`** (refonte) : liste enrichie, pagination, recherche, filtres statut/actif, boutons Modifier/Voir/Toggle/Supprimer (avec dialog confirm)
- Réutiliser `vendor.products.new.tsx` et `vendor.products.$productId.edit.tsx` tels quels

### Boutique admin
- **`/admin/shops/$shopId/manage`** (nouvelle) : même UI que `/vendor/shop` mais scopée sur `shopId`
- **`/admin/shops/$shopId/products`** (nouvelle) : même composant liste produits, scopé `shopId`
- Bouton "Gérer" sur la page `admin.shops.tsx` qui ouvre `/admin/shops/$shopId/manage`

### Composant partagé
- `src/components/shop/ShopProductsTable.tsx` — liste produits (mobile cards + desktop table) utilisée par les deux contextes
- `src/components/shop/ShopOverviewCards.tsx` — cartes statistiques

### Colonnes affichées
Image, nom, prix, stock (somme variants), statut (approved/pending/rejected), catégorie, nb variantes, date création, **vues** (privé), **ventes** (privé), toggle actif, actions.

---

## 4. Aperçu prix commission dans le formulaire

Composant `src/components/product/CommissionPricePreview.tsx` :
- Reçoit `price`, `vendorId`, `categoryId` (optionnel)
- Appelle un nouveau server fn `previewDisplayPrice({ vendorId, basePrice, categoryId? })` qui réutilise la logique existante de `get_display_prices` / commission_rules (pas de doublon)
- Debounce 300ms, affiche : "Prix affiché au client : **X FCFA** (commission incluse)"
- Si pas de commission applicable : affiche "Prix affiché au client : identique"

Intégré dans :
- `vendor.products.new.tsx`
- `vendor.products.$productId.edit.tsx`
- `admin.shops_.$shopId.products.new.tsx`
- `admin.products.$productId.edit.tsx`

---

## 5. Activer/Désactiver (côté public)

- `src/components/product/ProductCard.tsx`, listings (`shop.$vendorId`, `c.$categoryId`, `search`, `index`) : déjà filtrés par RLS (la migration ajoute `is_active`)
- Vérifier les server fns publiques (`getDeliverableVendors`, `getDisplayPrices`...) — pas d'impact car le RLS du public exclut les produits inactifs
- Page produit `/product/$productId` : si `is_active=false` et viewer ≠ propriétaire/admin → 404

---

## 6. Performance

- Pagination server-side (limit/offset), 20 items/page
- `useQuery` avec `queryKey: ['shop-products', shopId, filters, page]`, `staleTime: 30s`
- Images : `loading="lazy"`, première seule eager
- Index DB ajoutés (cf §1)
- Compteur vues : RPC légère, fire-and-forget côté client (no await)

---

## 7. Sécurité multi-boutiques

- Toutes les server fns vérifient explicitement `vendor_id = userId` OU (boutique admin ET admin la gère)
- Aucun endpoint ne renvoie des produits d'une autre boutique
- Les stats privées (vues, ventes) ne fuient jamais publiquement (vue scopée + RLS)
- Le code produit reste unique `(vendor_id, code)` — déjà en place

---

## Détails techniques

```text
src/
├── lib/shop-management.functions.ts          (nouveau)
├── lib/pricing.functions.ts                  (ajout previewDisplayPrice)
├── components/shop/
│   ├── ShopProductsTable.tsx                 (nouveau, partagé)
│   ├── ShopOverviewCards.tsx                 (nouveau, partagé)
│   └── ProductActiveToggle.tsx               (nouveau)
├── components/product/
│   └── CommissionPricePreview.tsx            (nouveau)
└── routes/
    ├── vendor.shop.tsx                       (nouveau dashboard)
    ├── vendor.products.index.tsx             (refonte)
    ├── admin.shops_.$shopId.manage.tsx       (nouveau)
    └── admin.shops_.$shopId.products.index.tsx (nouveau)

supabase/migrations/<ts>_shop_management.sql
  - ALTER products ADD is_active, views_count
  - CREATE INDEX
  - UPDATE RLS products_public_read_approved
  - CREATE FUNCTION increment_product_view
  - CREATE VIEW vendor_product_stats
```

Ordre d'exécution : migration → server fns → composants partagés → routes vendeur → routes admin → intégration aperçu prix → tracking de vues sur page produit publique.
