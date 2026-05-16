# Phase 3 — Pagination admin, recherche, images, lazy routes

## Contexte
- Erreur runtime corrigée (`@tanstack/zod-adapter` installé).
- Pattern de pagination déjà éprouvé sur `admin.customers` (URL state + zod + debounce + memo + `PaginationBar`). On le réplique.

## 1. Pagination serveur — Vendeurs (`admin.vendors`)
**Backend** : nouveau `listVendors({ page, pageSize=25, q, status, mode, country_id, ships })` dans `src/lib/admin-vendors.functions.ts`
- `profiles` jointure `user_roles` (role='vendeur') + comptage produits/commandes via sous-requêtes
- `ilike` sur `shop_name`, `full_name`, `email`
- Filtres SQL : `vendor_status`, `vendor_mode`, `source_country_id`, `ships_internationally`
- `range(from,to)` + `count: 'exact'`

**Frontend** : refonte `src/routes/admin.vendors.tsx`
- `validateSearch` zod (page, q, status, mode, country, ships)
- `useDebouncedValue(q, 300)`
- Lignes mémo + `PaginationBar`
- Conserve les actions existantes (créer/éditer/suspendre)

## 2. Pagination serveur — Commandes (`admin.orders`)
**Backend** : `listOrders({ page, pageSize=25, q, status, country_id, date_from, date_to, is_commission })` dans `src/lib/admin-orders.functions.ts`
- `orders` + `order_items(count)` agrégé
- `ilike` sur `customer_name`, `customer_phone`, `id::text`
- Filtres : statut, pays destination, période, commission
- Tri par `created_at desc`

**Frontend** : `src/routes/admin.orders.tsx`
- URL state + filtres + debounce
- Vue desktop (table) + mobile (cartes)
- Statut éditable inline conservé

## 3. Pagination serveur — Produits (`admin.products`)
**Backend** : `listAdminProducts({ page, pageSize=25, q, status, category_id, vendor_id })` dans `src/lib/admin-products.functions.ts`
- `products` jointures `categories`, `profiles(shop_name)`, `product_images(url limit 1)`
- `ilike` sur `name`, `code`, `designation`
- Filtres : `status` (pending/approved/rejected), catégorie, vendeur

**Frontend** : `src/routes/admin.products.tsx`
- URL state + debounce
- Grille de cartes paginée
- Boutons valider/refuser conservés (mutations + invalidation ciblée)

## 4. Recherche avancée (catalogue)
**Backend** : `searchProducts({ q, page=1, pageSize=24, category_id, min_price, max_price, country_id, sort })` dans `src/lib/search.functions.ts`
- `ilike` sur `name`, `code`, `designation`, `description` + i18n via `name_i18n->>lang`
- Pré-jointure `profiles` filtrée (`is_verified`, `vendor_status='active'`)
- Tri : pertinence (similarity si dispo), prix asc/desc, nouveauté

**Frontend** : `src/routes/search.tsx`
- URL state zod (q, category, min/max, sort, page)
- `useDebouncedValue(q, 300)`
- `keepPreviousData` + `staleTime: 30_000`
- Skeleton ProductCard pendant `isFetching`

## 5. Optimisation images
- `ProductCard` : déjà OK (`loading="lazy"` + `decoding="async"`)
- Ajout `width`/`height` explicites sur les `<img>` listings admin/banners pour éviter CLS
- Bannières d'accueil : 1ère image = `fetchpriority="high"` + `preload` via `head()` de `routes/index.tsx`
- Audit rapide `BannerEditorDialog`, `AppHeader` (logo), `SimilarProducts` : ajout lazy/async/width/height systématiques

## 6. Lazy-loading routes admin
- Conversion en `createLazyFileRoute` des routes lourdes :
  - `admin.vendors`, `admin.orders`, `admin.products`, `admin.commissions.hub`, `admin.commissions.view`, `admin.commission-orders`, `admin.reports`, `admin.reviews`, `admin.settings`, `admin.categories`, `admin.category-requests`, `admin.countries`, `admin.customers.$userId`, `admin.products.$productId.edit`
- Pattern : split en `route.tsx` (createFileRoute config) + `route.lazy.tsx` (composant) — ou utilisation de `Route.lazy(() => import(...))` selon version TanStack
- Layout `admin.tsx` + dashboard `admin.index` restent eager (entrée admin)
- Vérification bundle : routes admin sortent du chunk principal

## Ordre d'exécution
1. Lazy routes admin (gain bundle immédiat, faible risque)
2. Pagination vendeurs + commandes + produits (3 backends + 3 frontends, pattern dupliqué)
3. Recherche avancée catalogue
4. Audit images (lazy/width/height/preload LCP)
5. Vérif build + linter + test à ~500 lignes par listing

## Détails techniques
- Pas de nouvelles tables (réutilise `products`, `profiles`, `orders`)
- Pas d'index supplémentaires nécessaires (déjà créés en phase 1)
- Toutes les server fns utilisent `requireSupabaseAuth` + check rôle admin
- `PaginationBar` et `useDebouncedValue` réutilisés tels quels

## Hors scope
- Recherche full-text Postgres (`tsvector`) — ferait l'objet d'une phase ultérieure si volumes >10k produits
- Virtualisation des longues listes (react-virtual) — pas nécessaire avec pagination 25/page
