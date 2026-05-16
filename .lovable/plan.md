## Objectif

Améliorer la recherche du site sur deux niveaux : (1) une recherche dédiée intelligente dans chaque boutique vendeur avec filtres avancés, et (2) une barre de recherche globale enrichie avec auto-complétion, suggestions et historique.

## 1. Recherche dans la boutique vendeur

**Fichier ciblé** : `src/routes/shop.$vendorId.tsx` (à confirmer après inspection).

Ajouts :
- Barre de recherche sticky dédiée à la boutique avec icône loupe et bouton clear.
- Recherche fuzzy côté client (Fuse.js) sur : `name`, `name_i18n`, `description`, `category.name`, `variants.color`, `variants.size`, `code`.
- Suggestions live (dropdown) pendant la frappe : top 5 produits + catégories de la boutique.
- Debounce 200ms et highlight du terme dans les résultats.

Filtres intelligents (panneau pliable + chips actives) :
- Prix min / max (slider double)
- Taille (multi-select depuis variants)
- Couleur (chips couleur depuis variants, avec pastille)
- Catégorie (multi-select)
- Disponibilité (in stock uniquement)
- Nouveautés (< 30 jours, via `created_at`)
- Promotions (si `price_override < price` dans variants)
- Best-sellers (tri par count dans `order_items`, calculé via une server function légère)
- Tri : pertinence / prix ↑ / prix ↓ / nouveauté

UX :
- Drawer mobile pour filtres, sidebar desktop.
- Chips de filtres actifs avec « ✕ » individuel et « Tout effacer ».
- État synchronisé dans les search params (`q`, `min`, `max`, `sizes`, `colors`, `cats`, `sort`, `instock`, `promo`, `new`) avec `zodValidator` + `fallback` pour partage d'URL.
- Skeletons légers, pas de spinner bloquant.

i18n :
- Toutes les étiquettes via `t("shop_search.*")` en FR/EN/AR.

## 2. Recherche globale du site

**Fichier ciblé** : barre dans `src/components/Header.tsx` (ou équivalent).

Refonte en `<CommandPalette>` (shadcn Command) ouvert au focus / `Cmd+K` :
- Section **Suggestions** (auto-complétion fuzzy sur produits approuvés).
- Section **Produits** (top 6 résultats avec image + prix + boutique).
- Section **Boutiques** (top 3 vendeurs par `shop_name`).
- Section **Récents** (localStorage, 5 derniers, avec « ✕ »).
- Section **Populaires** (top 5 produits par ventes, mis en cache 5 min).
- Correction légère des fautes via Fuse.js `threshold: 0.4`.
- Touche `Enter` → page résultats `/search?q=...` (déjà existante ou à créer).

Performance :
- Server function `searchSuggestions({ q, limit })` qui retourne `{ products, vendors }` avec `ILIKE` côté Postgres + index trigram.
- Cache react-query 60s sur la query.
- Debounce 180ms.

## 3. Base de données

Migration légère :
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_shop_name_trgm ON public.profiles USING gin (shop_name gin_trgm_ops);
```

Aucune nouvelle table requise. Pas de changement de schéma RLS.

## 4. Détails techniques

- Dépendances : `fuse.js`, `cmdk` (déjà via shadcn `Command`).
- Server fn dans `src/lib/search.functions.ts` (lecture publique, pas d'auth requise) :
  - `globalSearch({ q })` → produits + boutiques.
  - `shopSearch({ vendorId })` → renvoie les produits + agrégats (tailles, couleurs, catégories, prix min/max) pour alimenter les filtres en un seul round-trip; recherche/filtrage ensuite côté client pour la réactivité.
  - `getBestSellers({ vendorId? })` → IDs triés par ventes (cache react-query).
- Pas de modification du flux checkout/cart.

## 5. Hors périmètre

- Aucune modification de la logique commande/panier/auth.
- Pas de refonte visuelle du reste du site.
- Pas de moteur de recherche externe (Algolia/Meilisearch) — tout reste sur Lovable Cloud.

## Étapes d'implémentation

1. Migration pg_trgm + index.
2. `src/lib/search.functions.ts` (globalSearch, shopSearch, getBestSellers).
3. `src/components/search/ShopSearchBar.tsx` + `ShopFilters.tsx`.
4. Intégration dans la page boutique vendeur + sync URL params.
5. `src/components/search/GlobalSearchCommand.tsx` + intégration Header.
6. Clés i18n FR/EN/AR.
7. QA mobile (384px) + desktop.
