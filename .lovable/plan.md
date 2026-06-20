## Phase 1 — Fondation Opérationnelle Multi-Utilisateurs Kawzone

Objectif : préparer Kawzone à fonctionner avec plusieurs employés (Super Admin, Agent Commandes, Agent Import, Livreur) avec rôles, permissions granulaires, tâches assignées et journal d'actions — sans casser le système actuel.

---

### 1. Analyse de l'existant

**Ce qui existe déjà (bonne base)** :
- Table `user_roles` avec enum `app_role` : `super_admin`, `admin`, `vendeur`, `acheteur` + champ `is_suspended`.
- Table `admin_permissions` avec enum `admin_permission` : `orders`, `products`, `product_validation`, `categories`, `vendors`, `customers`, `support`, `settings`, `commissions`.
- Fonctions SQL : `has_role`, `is_super_admin`, `has_admin_permission`, `current_user_has_permission`.
- Table `admin_action_log` + fonction `log_admin_action(action, target_type, target_id, details)`.
- Hook `useAuth` expose `roles`, `permissions`, `can(perm)`, `isSuperAdmin`.
- Module centralisé `src/lib/admin-auth.core.ts` (`assertPermission`, `assertSuperAdmin`, `logAdminAction`).
- Composant `PermissionGate` pour gating UI.
- Page `/admin/admins` (gestion admins) + `/admin/audit-logs`.
- Workflow Import complet déjà modélisé (FLOW_STEPS, `lineKind` = LOCAL / IMPORT_KNOWN_WEIGHT / IMPORT_UNKNOWN_WEIGHT) avec étapes : achat → réception → pesée → calcul fret → paiement fret → expédition → livraison.
- Cockpit + page `/admin/commandes` opérationnels.

**Ce qui manque** :
1. **Rôles métier** : pas de rôles `agent_commandes`, `agent_import`, `livreur`. Aujourd'hui tout admin est "admin" générique.
2. **Permissions granulaires (verbes)** : actuel = un seul flag par domaine (`orders` = tout). Manque la séparation `view / create / update / delete / approve` par domaine.
3. **Rôles personnalisés** : pas de table `roles` éditable — l'enum `app_role` est figé en SQL.
4. **Système de tâches** : aucune table `tasks`/`assignments`. Le Cockpit déduit les actions au vol mais rien n'est assigné à un utilisateur précis.
5. **Tableau "Mes tâches"** par utilisateur (vue personnelle filtrée par rôle).
6. **Affectation auto par étape workflow** : pas de routing étape → rôle responsable.
7. **Journal détaillé** : `admin_action_log` existe mais peu utilisé hors quelques server functions. Pas de "depuis quelle page" ni vue chronologique par utilisateur/commande exploitable.
8. **Livreur** : aucune interface dédiée mobile-first livraison.

---

### 2. Architecture proposée

#### A. Modèle de données (rôles + permissions extensibles)

Garder l'enum `app_role` existant pour compatibilité, mais introduire une couche **rôles personnalisés** par-dessus :

```text
app_roles (custom)              role_permissions
─────────────────               ──────────────────
id (uuid)                       role_id → app_roles.id
key (text unique)               resource (text)   ex: "orders"
label (text)                    action (text)     ex: "view","update","delete","approve"
description                     allowed (boolean)
is_system (bool)                PK (role_id, resource, action)
created_at

user_role_assignments
─────────────────────
user_id → auth.users
role_id → app_roles.id
assigned_by, assigned_at
PK (user_id, role_id)
```

Rôles système pré-créés (is_system = true, non supprimables) :
- `super_admin` (toutes permissions, court-circuit)
- `agent_commandes`
- `agent_import`
- `livreur`
- `admin_legacy` (compat ancien)

Le Super Admin peut créer/cloner des rôles custom et cocher chaque (resource, action).

Fonction SQL `user_can(user_id, resource, action)` (SECURITY DEFINER) qui :
1. retourne true si super_admin
2. sinon vérifie `role_permissions` via `user_role_assignments`

#### B. Système de tâches

```text
tasks
─────
id (uuid)
order_id → orders.id (nullable)
sub_order_vendor_id (uuid, nullable)   -- vendor pour la sous-commande
task_type (text)        ex: "confirm_order","verify_payment","purchase_supplier",
                           "weigh_parcel","compute_freight","notify_freight_payment",
                           "ship_parcel","deliver"
status (text)           "open","in_progress","done","cancelled"
priority (text)         "low","normal","high","urgent"
assignee_user_id (uuid, nullable)
assignee_role_key (text, nullable)     -- pool si pas encore pris
due_at, created_at, started_at, completed_at
payload (jsonb)
created_by
```

**Génération auto** : trigger ou server function sur changement d'étape workflow → crée la tâche suivante et l'assigne au pool du bon rôle :
- `purchase_supplier` → pool `agent_import`
- `weigh_parcel`, `compute_freight` → pool `agent_import`
- `confirm_order`, `verify_payment`, `notify_freight_payment` → pool `agent_commandes`
- `ship_parcel`, `deliver` → pool `livreur`

Mapping étape→rôle dans `src/cockpit/lib/task-routing.ts` (source de vérité unique réutilisée par UI + génération).

#### C. Journal d'actions (extension)

Étendre `admin_action_log` (ou nouvelle table `activity_log` si on veut séparer admin vs employés) avec :
- `from_page` (text) — URL d'origine
- `actor_role_keys` (text[])
- déjà : `actor_id`, `actor_email`, `action`, `target_type`, `target_id`, `details`, `created_at`

Wrapper React `useActivityLogger()` qui ajoute auto `from_page = location.pathname`. Tous les boutons critiques l'appellent.

---

### 3. Pages à créer / modifier

| Page | Statut | Rôle requis |
|---|---|---|
| `/admin/team` | **nouveau** — liste employés, invitation, attribution rôle | super_admin |
| `/admin/team/roles` | **nouveau** — éditeur de rôles & matrice permissions (resource × action) | super_admin |
| `/admin/team/activity` | **nouveau** — journal global filtrable par user/action/date | super_admin |
| `/tasks` (ou `/admin/tasks`) | **nouveau** — "Mes tâches" personnel, vue kanban/liste filtrée par rôle | tous employés |
| `/delivery` | **nouveau** — interface mobile livreur (liste, actions: en route, livré, absent, refusé, reporté) | livreur |
| `/admin/import` | **nouveau** — vue Agent Import : commandes à acheter, à peser, à calculer | agent_import |
| `/admin/orders-desk` | **nouveau** — vue Agent Commandes : à confirmer, paiements, contacts | agent_commandes |
| `/admin/admins` | existante | étendre pour gérer rôles custom |
| `/admin` (dashboard) | existante | adapter la home selon rôle (rediriger livreur → `/delivery`, agent → `/tasks`) |
| Cockpit / `/admin/commandes` | existant | **inchangé** — reste accessible super_admin + admin_legacy |

---

### 4. Server functions

Sous `src/lib/team/` :
- `roles.functions.ts` : `listRoles`, `createRole`, `updateRolePermissions`, `deleteRole`
- `assignments.functions.ts` : `assignRole`, `revokeRole`, `listTeam`, `inviteEmployee`
- `tasks.functions.ts` : `listMyTasks`, `claimTask`, `completeTask`, `reassignTask`, `listTasksByOrder`
- `activity.functions.ts` : `listActivity` (paginé, filtres)

Toutes protégées par `requireSupabaseAuth` + `assertPermission` ou `user_can`. Tout appel d'écriture log automatiquement.

---

### 5. Impact sur le système actuel

**Aucun changement breaking** :
- `app_role` enum conservé. `has_role`, `is_super_admin`, `has_admin_permission` continuent de fonctionner.
- Le Cockpit, `/admin/commandes`, `useAuth`, `PermissionGate`, RLS policies existantes restent intacts.
- Nouvelle fonction `user_can(uid, resource, action)` introduite **en plus**. Migration progressive : nouvelles features l'utilisent, les anciennes gardent `has_admin_permission`.
- Les rôles système (`agent_commandes`, `agent_import`, `livreur`) sont insérés dans `app_roles` au seed; un utilisateur reçoit ces rôles via `user_role_assignments` sans toucher la table `user_roles` historique.
- Les tâches sont **additionnelles** : si la table est vide, le Cockpit fonctionne exactement comme aujourd'hui. La génération auto se déclenche uniquement quand on activera le hook côté serveur.

**Périmètre par rôle (résumé)** :
- Super Admin : tout (comme aujourd'hui).
- Agent Commandes : `/admin/orders-desk`, `/tasks`, ouverture commande/sous-commande (lecture + actions confirmer/contacter/paiement), pas de bénéfices/commissions/réglages.
- Agent Import : `/admin/import`, `/tasks`, accès sous-commandes IMPORT (pesée, dimensions, calcul fret, demande paiement fret), pas de finances globales.
- Livreur : uniquement `/delivery` + actions livraison sur sous-commandes qui lui sont assignées.

---

### 6. Plan d'exécution (étapes après validation)

1. **Migration DB** : tables `app_roles`, `role_permissions`, `user_role_assignments`, `tasks`, extension `admin_action_log`, fonction `user_can`, seed rôles système + matrice par défaut. GRANTs + RLS.
2. **Core lib** : `src/lib/team/permissions.ts` (`canResource`, `useCan`), `src/lib/team/task-routing.ts`, hook `useActivityLogger`.
3. **Hook `useAuth`** : exposer `customRoles[]`, `userCan(resource, action)` (sans casser l'API existante).
4. **Pages Super Admin** : `/admin/team`, `/admin/team/roles`, `/admin/team/activity`.
5. **Tâches** : `/tasks` + server functions + génération auto branchée sur les transitions workflow existantes.
6. **Interfaces métier** : `/admin/orders-desk`, `/admin/import`, `/delivery`.
7. **Navigation & redirections** : `/admin` home adapte selon rôle ; nav latéral filtré.
8. **Recette** : tests E2E par rôle ; vérification non-régression Cockpit.

---

Aucun code n'est encore écrit. Merci de valider (ou ajuster) cette architecture — notamment :
- nom des rôles (`agent_commandes` / `agent_import` / `livreur` OK ?),
- périmètre exact de l'Agent Commandes vs Super Admin sur les paiements,
- préférence : page `/tasks` unique adaptative **ou** une page par rôle (`/orders-desk`, `/import`, `/delivery`) ?
