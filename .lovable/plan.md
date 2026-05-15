# Système d'administration multi-rôles

## Objectif
Créer un vrai système de permissions pour les administrateurs avec un **super admin** (haidarorca@gmail.com) qui contrôle entièrement les accès des autres admins.

## 1. Base de données (migration)

### Nouveau enum `admin_permission`
Domaines de permissions granulaires :
- `orders` — Gestion des commandes
- `products` — Gestion des produits (édition libre)
- `product_validation` — Valider / rejeter les produits en attente
- `categories` — Gestion des catégories + demandes
- `vendors` — Gestion des vendeurs (rôles, suspension)
- `customers` — Gestion des clients
- `support` — Avis, signalements, modération
- `settings` — Paramètres du site (réservé aux super admins, mais permission existe pour délégation)

### Modifications du enum `app_role`
Ajouter `super_admin`. `admin` reste, mais devient un admin "limité" qui n'a que les permissions explicitement accordées.

### Nouvelle table `admin_permissions`
| Colonne | Type |
|---|---|
| id | uuid PK |
| user_id | uuid (référence auth user) |
| permission | admin_permission |
| granted_by | uuid |
| granted_at | timestamptz |

Unique (user_id, permission).

### Nouvelle colonne sur `user_roles`
- `is_suspended` (boolean, défaut false) — pour suspendre un admin sans le supprimer.

### Nouvelle table `admin_action_log` (historique)
| Colonne | Type |
|---|---|
| id | uuid PK |
| actor_id | uuid — qui a agi |
| actor_email | text — figé pour audit |
| action | text — ex. `admin.create`, `admin.permission.grant`, `product.approve` |
| target_type | text — ex. `user`, `product`, `order` |
| target_id | text |
| details | jsonb |
| created_at | timestamptz |

### Fonctions security definer
- `is_super_admin(_user_id uuid) returns boolean` — vrai si rôle `super_admin` ET non suspendu.
- `has_admin_permission(_user_id uuid, _perm admin_permission) returns boolean` — vrai si super admin OU si la permission existe pour cet utilisateur ET non suspendu.
- `current_user_has_permission(_perm admin_permission) returns boolean` — wrapper sur `auth.uid()`.
- `log_admin_action(...)` — helper pour insérer dans le journal.

### Bootstrap super admin
Migration : assigne `super_admin` à `haidarorca@gmail.com` (en plus de `admin` qu'il a déjà). Met aussi à jour `handle_new_user` pour donner `super_admin` à cet email à l'inscription (au lieu de simplement `admin`).

### RLS
- `admin_permissions` : lecture par le user concerné + super admins ; écriture réservée aux super admins.
- `admin_action_log` : lecture super admin uniquement ; insertion par toute fonction security definer.
- `user_roles` : seuls les **super admins** peuvent attribuer/retirer le rôle `admin` ou `super_admin` (les admins simples ne peuvent plus toucher aux rôles).

## 2. Frontend

### Hook `useAdminPermissions()`
Charge les permissions du user courant + flag `isSuperAdmin`. Expose :
```ts
{ isSuperAdmin, isAdmin, isSuspended, permissions: Set<AdminPermission>, can(perm) }
```

### Garde de routes admin
- `_authenticated/admin/*` reste accessible aux admins non suspendus.
- Chaque sous-page vérifie sa permission via `can('orders')`, etc., et affiche un message "Accès refusé" si manquant.
- `/admin` (dashboard) : n'affiche que les cartes/stats correspondant aux permissions du user.

### Mapping pages → permissions
| Route | Permission requise |
|---|---|
| `/admin/orders` | `orders` |
| `/admin/products` (onglet À valider) | `product_validation` |
| `/admin/products` (autres onglets + édition) | `products` |
| `/admin/categories` | `categories` |
| `/admin/category-requests` | `categories` |
| `/admin/vendors` | `vendors` |
| `/admin/reviews` | `support` |
| `/admin/reports` | `support` |
| `/admin/settings` | super admin uniquement |

### Nouvelle page `/admin/admins` (super admin uniquement)
Visible dans le dashboard admin pour les super admins.

**Liste des admins** (cartes) avec pour chaque admin :
- Nom, email, badge "Super admin" / "Admin" / "Suspendu"
- Liste de cases à cocher (une par permission) avec libellés français
- Bouton "Suspendre / Réactiver"
- Bouton "Supprimer admin" (rétrograde en `acheteur`, supprime toutes ses permissions)

**Bouton "Ajouter un admin"** : dialogue qui demande l'email d'un utilisateur existant, le promeut `admin`, ouvre l'écran d'édition de ses permissions.

**Onglet "Historique"** : affiche `admin_action_log` paginé avec filtres (acteur, type d'action, date).

### Journalisation côté serveur
Une server function `logAdminAction` (server-fn avec `requireSupabaseAuth`) est appelée :
- À chaque création/modif/suppression d'admin
- À chaque grant/revoke de permission
- À chaque suspension/réactivation
- À chaque approbation/rejet de produit
- À chaque action destructive sensible (suppression catégorie, suspension vendeur, etc.)

## 3. Sécurité
- Toutes les modifs de rôles passent par RLS qui vérifie `is_super_admin(auth.uid())`.
- Le super admin haidarorca@gmail.com est protégé : impossible de le suspendre ou de retirer son rôle super_admin (vérification dans une fonction trigger).
- Seuls les super admins voient le menu "Admins" et peuvent ouvrir `/admin/admins`.

## 4. Détails techniques
- Migration en une seule passe (enum + tables + RLS + fonctions + bootstrap).
- Les tables existantes gardent leurs policies actuelles (qui utilisent `has_role(_, 'admin')`) — ça reste cohérent : un admin avec 0 permission ne pourra plus rien faire de toute façon car les sous-pages bloquent côté UI ET les actions sensibles passent par les nouvelles checks.
- Pour des protections plus strictes, on remplace progressivement `has_role(auth.uid(), 'admin')` par `has_admin_permission(auth.uid(), 'X')` sur les tables concernées (orders, products, etc.) — fait dans la même migration.

## Livrables
1. Migration SQL (enum, tables, fonctions, RLS, bootstrap super_admin, mise à jour `handle_new_user`).
2. Hook `useAdminPermissions`.
3. Page `/admin/admins` (gestion + historique).
4. Gardes de permission sur chaque sous-page admin existante.
5. Carte "Gérer les admins" sur `/admin` visible aux super admins uniquement.
6. Server functions de journalisation appelées aux endroits sensibles.
