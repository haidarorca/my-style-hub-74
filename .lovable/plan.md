# Refonte de la page Admin → Vendeurs

Améliorer `src/routes/admin.vendors.tsx` (pas de nouvelle page) avec un tableau pro, filtres, statuts de compte, et gestion flexible de la durée d'accès.

## 1. Base de données (migration)

Ajouter sur `profiles` (le profil vendeur) :
- `vendor_status` : enum `vendor_account_status` = `active | pending | suspended | expired | blocked`
- `access_starts_at` : timestamptz (date de début d'accès)
- `access_ends_at` : timestamptz null (date de fin ; null = illimité)
- `access_started_at`, `blocked_at`, `suspended_at` : timestamptz pour l'historique
- `blocked_reason`, `suspended_reason` : text

Logique :
- Trigger BEFORE INSERT/UPDATE qui met `vendor_status = 'expired'` si `access_ends_at < now()` et que statut courant est `active`.
- Cron `pg_cron` toutes les heures : `UPDATE profiles SET vendor_status='expired' WHERE access_ends_at < now() AND vendor_status='active'`.
- RLS produits déjà existante (`is_verified` + status approved). On ajoute condition : le vendeur doit être `vendor_status IN ('active')` pour que ses produits/boutique soient publics. Idem `profiles_public_shop_read`.
- Politique INSERT produits : bloquer si `vendor_status != 'active'` (via fonction `can_vendor_operate(uid)`).
- Politique INSERT orders/order_items côté vendeur : bloquer nouvelles commandes si vendeur non-actif (via vérification dans `can_insert_order_item` ou trigger sur `order_items`).

Backfill : tous les vendeurs vérifiés → `active`, non vérifiés → `pending`.

## 2. Server functions

`src/lib/admin-vendor-status.functions.ts` :
- `setVendorStatus({ user_id, status, reason? })` — admin-only (`requireSupabaseAuth` + check role admin)
- `extendVendorAccess({ user_id, ends_at })` — set fin d'accès
- `setVendorAccessWindow({ user_id, starts_at, ends_at })`
- Toutes via `supabaseAdmin` après vérification du rôle admin.

## 3. UI — `src/routes/admin.vendors.tsx`

Remplacer la liste actuelle par un **tableau responsive** (shadcn `Table`) avec colonnes :
Boutique · Vendeur · Email · Téléphone · Pays/Ville · Statut · Type · Inscrit le · Fin d'accès · Produits · Commandes · Actions

**Toolbar de filtres** (au-dessus du tableau) :
- Recherche texte (email, nom boutique)
- Select pays (depuis `useCountries`)
- Select statut (les 5)
- Select type (commission / sans / tous)
- Range dates inscription (popover calendar)
- Range dates fin d'accès

Filtrage côté client sur la liste chargée (tri par date_inscription desc par défaut).

**Counts** : query agrégée
- `products` count par vendor_id (status='approved' uniquement, ou total ? → total)
- `orders` count via `order_items` distincts order_id par vendor_id

Une seule requête `select` enrichie + 2 RPC/views légères, ou simple post-fetch agrégé.

**Actions par ligne** (DropdownMenu) :
- Activer / Réactiver (status → active, set access_ends_at si vide = +30j ou null)
- Suspendre (modal raison)
- Bloquer (modal raison)
- Modifier (réutilise `EditVendorDialog` existant)
- Voir les produits → `/admin/products?vendor=:id`
- Voir les commandes → `/admin/orders?vendor=:id`
- Supprimer (confirmation)
- **Prolonger l'accès** (modal dédié)

**Modal "Prolonger l'accès"** :
- Date début (DatePicker) — readonly si déjà set, sinon now
- Mode : "Durée prédéfinie" (7j / 30j / 90j / 6 mois / 1 an / illimité) OU "Durée personnalisée" (input number + unité jours) OU "Date de fin précise" (DatePicker)
- Bouton "Appliquer"

Badges de statut colorés :
- Actif vert, En attente ambre, Suspendu orange, Expiré gris, Bloqué rouge

## 4. Effets côté boutique publique

Mise à jour de `profiles_public_shop_read` et `products_public_read_approved` pour exiger `vendor_status = 'active'`. Le vendeur lui-même voit toujours ses produits dans son dashboard, avec bandeau "Compte expiré/suspendu/bloqué — contacter l'admin".

`src/routes/vendor.index.tsx` : ajouter bandeau si statut ≠ active (réutiliser le bandeau "en attente" existant, le généraliser).

## 5. Fichiers touchés

Migration :
- `supabase/migrations/..._vendor_account_status.sql`

Code :
- `src/lib/admin-vendor-status.functions.ts` (nouveau)
- `src/routes/admin.vendors.tsx` (refonte)
- `src/routes/vendor.index.tsx` (bandeau généralisé)
- `src/integrations/supabase/types.ts` (régénéré auto)

## Notes
- L'admin existant peut déjà créer/éditer/supprimer ; je conserve `createVendor` / `updateVendor` / `deleteVendor`.
- Le bouton "Valider/Retirer" (`is_verified`) reste mais devient un raccourci vers "Activer" si on veut unifier — je le garde séparé : `is_verified` = boutique visible publiquement, `vendor_status` = état du compte. Les deux conditions doivent être vraies pour apparaître sur le site.
