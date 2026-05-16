# Phase 2 — Optimisations frontend & backend

Continuation du plan global. Exécuté en une seule passe, par bloc cohérent. Aucun changement de design ni de fonctionnalités.

## 1. Pagination serveur sur listings admin

Refactor des 4 listings lourds avec `LIMIT/OFFSET + COUNT(*)`, page size 25 par défaut, état dans l'URL (`?page=&q=&status=`) pour partage / retour navigateur.

- `getAdminCustomers` → ajoute `page`, `pageSize`, `q`, `status` ; renvoie `{ rows, total, page, pageSize }`.
- `getAdminVendors` (créer ou refactor existant) → idem + filtre `vendor_status`.
- `getAdminOrders` → idem + filtre `status`, `is_commission`.
- `getAdminProducts` → idem + filtre `status`, `category_id`.
- Index DB déjà posés en phase 1, aucun ajout nécessaire.
- Frontend : `validateSearch` (zod) sur chaque route, `useSearch` + `navigate` pour piloter, composant `<Pagination>` réutilisable.

## 2. Dashboards admin via cache

- `admin.index.tsx` lit `getAdminStats()` (table `admin_stats_cache` créée en phase 1) — déjà rapide.
- Branchement effectif des cartes du dashboard sur ces valeurs (revenus, vendeurs actifs, clients, commandes, en-attente).
- Job Inngest `refresh-admin-stats` (15 min) déjà en place pour repeupler le cache.
- Fallback : si cache vide → calcul à la volée + écriture (lazy hydration), pour première visite.

## 3. Mémoisation ciblée

- `React.memo` sur les rangées (`CustomerRow`, `VendorRow`, `OrderRow`, `ProductRow`).
- `useMemo` sur dérivations coûteuses (formatage prix, tri local, listes options).
- `useCallback` sur handlers passés en props aux rangées.
- Pas de mémo abusif — uniquement où le profiling justifie.

## 4. Lazy-loading des routes admin

TanStack Router fait déjà du code-splitting par route. Renfort :
- Conversion explicite des routes admin lourdes en `createLazyFileRoute` quand pertinent (admins, settings, commissions hub, reports).
- Imports dynamiques pour gros composants tiers (charts, éditeurs riches) avec `React.lazy` + `Suspense`.
- Vérifier `bundle` : aucune route admin importée par le shell public.

## 5. Mobile

- Tableaux admin → vue carte sur `<sm` (déjà partiellement présent), grilles fluides.
- Boutons d'action min 44×44 tap target.
- `overflow-x-auto` + sticky header sur tables larges.
- Audit rapide des pages clés (catalogue, panier, fiche produit) — ajustements layout uniquement.

## 6. Images

- `loading="lazy"` + `decoding="async"` sur toutes les `<img>` non-LCP (produits cartes, avatars, logos catégorie).
- `width` / `height` explicites pour éviter CLS.
- `fetchpriority="high"` + `preload` sur l'image LCP de la home + fiche produit.
- Pas de transformer custom (Supabase Storage sert déjà les fichiers).

## 7. Recherche produits

- `getSearchResults({ q, page, pageSize, category, vendor, country })` côté serveur, `ilike` ou `tsvector` sur `name`/`designation` (+ i18n via `name_i18n` GIN).
- Debounce 300 ms côté input.
- `staleTime: 30_000`, `placeholderData: keepPreviousData` pour UX fluide.
- Limite 25 résultats / page, scroll infini optionnel plus tard.

## 8. Filtres catalogue / catégories

- Filtres dans l'URL (zod `validateSearch`) → SSR-friendly, partageable.
- `getCategoryProductCounts()` déjà cachée côté DB ; lecture via `useSuspenseQuery` avec `staleTime: 5min`.
- Filtres groupés (prix, pays, vendeur, en-stock) appliqués en un seul appel server-side.

## 9. Cache frontend / backend

Frontend (TanStack Query) :
- `defaultPreloadStaleTime: 0` (Router cède le contrôle à Query) — vérifier.
- `staleTime` raisonné par domaine : stats 60 s, listings 30 s, fiche produit 2 min, catégories 5 min.
- `gcTime` 10 min par défaut.

Backend :
- Table `admin_stats_cache` (déjà créée) — usage généralisé pour tout chiffre agrégé.
- Headers `Cache-Control: public, max-age=60, s-maxage=300` sur endpoints publics read-only (catalogue, catégories).
- Inngest planifie le refresh.

## Ordre d'exécution

1. Refactor `getAdminCustomers/Vendors/Orders/Products` + frontend listings (pagination + filtres URL).
2. Branchement dashboard admin sur `getAdminStats` (cache + fallback).
3. Mémoisation rangées + lazy routes admin lourdes.
4. Audit mobile + images (lazy, dimensions, LCP preload).
5. Recherche + filtres catalogue avec debounce + URL state.
6. Réglages `staleTime`/`gcTime` globaux et headers cache.
7. Vérification : `bun run build`, linter Supabase, test pagination ~500 lignes.

## Sortie attendue

- Listings admin paginés, partageables par URL, < 200 ms p95.
- Dashboard admin instantané (lecture cache).
- Routes admin chargées à la demande → bundle public ~inchangé.
- Recherche fluide avec debounce et keepPreviousData.
- Mobile responsive sur toutes les vues admin.
- Aucune régression fonctionnelle.
