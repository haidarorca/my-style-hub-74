# Plan d'optimisation globale

Volume cible : 100–1000 clients/produits/commandes. Architecture pensée pour scaler ×10 sans refactor.

## Étape 1 — Indexation base de données (impact immédiat)

Ajouter les index manquants sur les colonnes filtrées/triées dans toutes les pages admin et publiques :

- `products` : `(status, vendor_id)`, `(category_id) WHERE status='approved'`, `(created_at DESC)`, GIN sur `name_i18n`/`designation_i18n` pour recherche multilingue.
- `orders` : `(buyer_id, created_at DESC)`, `(status, created_at DESC)`, `(destination_country_id)`, `(is_commission) WHERE is_commission=true`.
- `order_items` : `(order_id)`, `(vendor_id, created_at DESC)`, `(product_id)`, `(buyer_id)`.
- `profiles` : `(vendor_status, is_verified) WHERE vendor_status='active'`, `(source_country_id)`.
- `user_roles` : `(role, is_suspended)`, `(user_id, role)` unique déjà partiel — vérifier.
- `customer_addresses` : `(user_id, is_default DESC)`.
- `notifications` : `(user_id, is_read, created_at DESC)`.
- `product_reviews` : `(product_id, created_at DESC)`, `(user_id)`.

## Étape 2 — Cache de traduction intelligent

Problème actuel : `sync-translations` rescanne tout à chaque exécution même si rien n'a changé.

Solution :
- Ajouter colonne `content_hash text` sur `products`, `categories`, `countries` (hash MD5 du nom+désignation+description source).
- Trigger BEFORE INSERT/UPDATE qui recalcule le hash.
- Ajouter colonne `translated_hash text` qui stocke le hash au moment où `name_i18n`/`description_i18n` a été rempli.
- Le scan ne traite QUE les lignes où `content_hash != translated_hash` OR `translated_hash IS NULL`.
- Index partiel : `WHERE content_hash IS DISTINCT FROM translated_hash` pour scan O(diff) au lieu de O(total).
- Garder la détection des « copies triviales » (3 langues identiques) déjà en place.

Résultat : 2ᵉ exécution = 0 appel IA si rien n'a bougé.

## Étape 3 — Background jobs via Inngest

Connecter Inngest (proxy gateway Lovable, pas besoin de clé externe pour toi).

Fonctions Inngest à créer dans `src/lib/inngest/`:
- `translate-product` (event `product/changed`) — déclenchée par trigger DB → webhook sur création/MAJ produit.
- `sync-all-translations` (cron `0 */6 * * *`) — passe complète toutes les 6h en sécurité, ne traite que le diff (grâce à l'étape 2).
- `cleanup-expired-codes` (cron quotidien) — purge `email_verification_codes` et `password_reset_codes` expirés.
- `refresh-admin-stats` (cron `*/15 * * *`) — alimente la table cache `admin_stats_cache`.

Endpoint serve : `src/routes/api/public/inngest.ts` (TanStack server route, vérifié par signing key).

## Étape 4 — Cache des statistiques admin

Nouvelle table `admin_stats_cache` (key text PRIMARY KEY, value jsonb, updated_at) :
- `customers_overview` (total, actifs, bloqués, revenus 30j)
- `vendors_overview`
- `orders_overview`

Le dashboard lit cette table (1 SELECT) au lieu de recalculer `COUNT()` + `SUM()` sur des centaines de lignes à chaque ouverture. Refresh toutes les 15 min via Inngest + au déclenchement d'évènements critiques (nouvelle commande, etc.).

## Étape 5 — Pagination serveur partout

Refactor des listings admin pour pagination DB (LIMIT/OFFSET + COUNT) au lieu de tout charger en mémoire :
- `admin.customers.tsx` — déjà créé → ajouter `page`, `pageSize` dans `listCustomers`.
- `admin.vendors.tsx`, `admin.orders.tsx`, `admin.products.tsx` — même traitement si pas déjà fait.
- Page size par défaut : 25.

## Étape 6 — Optimisations frontend

- `useQuery` avec `staleTime` raisonnable (30s pour stats, 5min pour catégories/pays) pour éviter refetch répété.
- `React.memo` sur les lignes de tableaux lourds (CustomerRow, OrderRow).
- Lazy-load des routes admin via `lazy()` pour ne pas inclure le code admin dans le bundle public.
- Images produits : ajouter `loading="lazy"` + `decoding="async"` partout où ce n'est pas déjà fait.

## Étape 7 — Vérifications finales

- Lancer le linter Supabase (`supabase--linter`) après les migrations pour vérifier qu'aucun index n'est manquant ou redondant.
- Tester l'admin clients avec 500 lignes simulées pour valider la pagination.
- Profiler la page d'accueil pour vérifier que le bundle n'a pas grossi.

---

## Détails techniques

**Stack** : TanStack Start + Supabase + Inngest (via gateway Lovable).
**Pas d'Edge Functions** — tout passe par `createServerFn` + cron pg_cron pour les triggers internes + Inngest pour les jobs lourds.
**Sécurité** : Toutes les nouvelles fonctions admin restent protégées par `requireSupabaseAuth` + check `has_admin_permission`.

## Ordre d'exécution proposé

1. Migration : index DB + colonnes `content_hash` + table `admin_stats_cache`
2. Connecter Inngest (tu confirmeras le popup)
3. Endpoint `/api/public/inngest` + 4 fonctions Inngest
4. Refactor `sync-translations` pour utiliser le hash
5. Pagination serveur + cache stats sur dashboard clients
6. Frontend : staleTime + memo + lazy
7. Linter + test

Ça fait beaucoup. Je peux tout enchaîner en une seule passe, mais l'étape 2 (connecter Inngest) demande une action de ta part (clic sur le popup). Confirme et je commence par l'étape 1.
