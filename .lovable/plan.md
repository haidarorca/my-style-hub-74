
# Système SAV / Retours / Échanges / Remboursements — Implémentation complète

La fondation DB est en place (`sav_cases` étendu, `sav_attachments`, `sav_messages`, `sav_actions`, `sav_rules`, `sav_refunds`, `sav_exchanges`, `resolve_sav_rules()`). Cette phase livre les **server functions métier**, l'**UI 3 espaces** (Client / Vendeur / Admin) et le **moteur de règles** pilotable.

## Principes d'ergonomie

- **Un seul composant `SavCaseDrawer`** réutilisé par les 3 espaces, avec rôles (`client` / `vendor` / `admin`) qui affichent/masquent les actions. Évite 3 écrans dupliqués.
- **Une seule liste `SavCaseList`** avec filtres dynamiques, montée dans 3 routes différentes (vue filtrée par rôle).
- Le **Centre SAV Cockpit** est l'écran admin maître ; client/vendeur ont des versions allégées.
- Les **règles SAV** ont leur propre route `/admin/sav-rules` (séparé des paramètres généraux).

## Phase 1 — Couche métier (server functions)

Fichier unique `src/lib/sav-workflow.functions.ts` (toutes `requireSupabaseAuth`) :

**Client :**
- `openSavCaseClient` — ouvre dossier sur un `order_item_id`. Vérifie via `resolve_sav_rules` si le `case_type` est autorisé (returns_enabled, return_window_days…). Insert `sav_cases` + `sav_actions(open)`.
- `addSavMessageClient`, `addSavAttachmentClient`, `respondToInfoRequestClient`, `cancelMyCase`.
- `listMyCases` — dossiers du client connecté.

**Vendeur :**
- `vendorRecommend` — pose `vendor_recommendation` (accept / refuse / partial / counter_offer) + commentaire. Ne décide pas.
- `vendorAddMessage`, `vendorAddAttachment`, `vendorRequestInfo`.
- `listMyShopCases` — dossiers sur produits du vendeur.

**Admin :**
- `adminDecide` — pose `admin_decision` (accepted / refused / partially_accepted / overridden), `decided_resolution`, déclenche transition vers `in_execution`.
- `adminOverride` — force une décision quelle que soit la recommandation vendeur.
- `adminReopen`, `adminAssign`, `adminCreateCaseOnBehalf` (Sénégal : créer un dossier pour le client).
- `adminIssueRefund` — crée `sav_refunds` + lien `financial_movements`.
- `adminCreateExchange` — crée `sav_exchanges` ; option génère un `order_item` de remplacement.
- `adminEscalateToDispute`, `adminCloseCase`.
- `listAllCases` avec filtres complets (statut, type, pays, boutique, catégorie, produit, date, recherche texte).

**Règles :**
- `listSavRules`, `upsertSavRule`, `deleteSavRule`, `previewRuleResolution(product_id, country_id, shop_id)`.

**Storage :** bucket `sav-evidence` (privé, signed URLs 1h), helper `uploadSavAttachment` côté client.

## Phase 2 — UI partagée

`src/components/sav/` :

- `SavCaseDrawer.tsx` — drawer universel à onglets : **Détails**, **Timeline** (`sav_actions`), **Messages** (`sav_messages`), **Preuves** (`sav_attachments`), **Décision** (vendeur recommend / admin decide), **Finance** (refunds + exchanges). Prop `role: 'client'|'vendor'|'admin'` qui contrôle les boutons et la visibilité (`client_visible`).
- `SavCaseList.tsx` — table+filtres (statut, type, owner_party, dates, recherche). Prop `scope` pour pré-filtrer (mes dossiers / dossiers boutique / tous).
- `SavCaseBadges.tsx` — pills statut / type / SLA.
- `OpenSavCaseDialog.tsx` — formulaire d'ouverture (utilisé par client ET admin "on behalf").
- `SavEvidenceUploader.tsx` — multi-fichiers vers `sav-evidence`.
- `SavRuleResolver.tsx` — affiche les règles applicables à un produit (transparence vendeur).

## Phase 3 — Routes par espace

**Client :**
- Sur `product.$productId.tsx` & `orders.tsx` : bouton "Demande SAV" par ligne de commande → `OpenSavCaseDialog`.
- `src/routes/account.sav.tsx` — liste de mes dossiers + drawer (`role=client`).

**Vendeur :**
- `src/routes/vendor.sav.tsx` — liste filtrée sur les boutiques du vendeur + drawer (`role=vendor`).
- Compteur dossiers en attente dans la sidebar vendeur.

**Admin (Centre SAV Cockpit) :**
- `src/routes/admin.cockpit.sav.tsx` (réécriture de `SavCenter.tsx`) :
  - **En-tête KPI** : Nouveaux / En attente vendeur / En attente client / En attente admin / Acceptés / Refusés / Remboursés / Échangés / Clôturés / Litiges.
  - **Filtres** : client, boutique, produit, catégorie, pays, type, statut, dates, recherche globale.
  - **Liste + drawer** (`role=admin`) avec actions complètes (override, refund, exchange, exception, on-behalf).
  - **Lien deep-link** vers `/admin/cockpit?orderId=...` depuis chaque dossier.
- `src/routes/admin.sav-rules.tsx` — éditeur de règles :
  - Onglets **Global / Pays / Boutique / Catégorie / Produit**.
  - Pour chaque scope : table des règles, formulaire upsert pour chaque `rule_key` (returns_enabled, exchanges_enabled, warranty_enabled, return_window_days, warranty_months, requires_evidence, auto_accept_under_amount, refund_method_default, shipping_cost_attribution).
  - Panneau "Simuler" : choisir produit/pays/boutique → affiche les règles résolues.

## Phase 4 — Permissions

Migration : ajouter dans l'enum `admin_permission` les valeurs `sav.view_all`, `sav.assign`, `sav.decide`, `sav.override`, `sav.rules_manage`, `sav.refund_issue`, `sav.exception_create`. Gates via `<PermissionGate perm="...">` sur chaque action sensible. `assertPermission()` côté server.

## Phase 5 — Audit & intégrations existantes

- Toutes les écritures admin appellent `logAdminAction()` (en plus de `sav_actions`).
- Trigger DB existant `tg_emit_sav_for_deletion_event` continue d'auto-créer dossiers — on l'aligne sur le nouveau modèle (case_type='other'/'admin_exception').
- Pont déjà existant `escalateToSav` (lib/sav-escalation.functions.ts) : conservé, met à jour `case_type` correctement.

## Détails techniques

| Élément | Décision |
|---|---|
| Storage | Bucket privé `sav-evidence`, accès via `createSignedUrl` (1h), policies RLS basées sur l'appartenance au dossier |
| `client_visible` sur `sav_messages` | filtre côté server selon rôle ; vendeur voit messages client + admin non-internes |
| SLA breach | colonne `sla_deadline_at` déjà en place ; alerte UI (badge rouge) ; pas de cron en v1 |
| Échange | crée `sav_exchanges` + (option) nouvelle ligne `order_items` liée via `replacement_for_item_id` |
| Refund | crée `sav_refunds` + `financial_movements` (direction=`out`) ; ne touche pas au statut commande |
| Senegal on-behalf | `adminCreateCaseOnBehalf` insert avec `created_by=admin.userId`, `on_behalf_of_user_id=client.id`, action `created_on_behalf` |

## Livrables

1. Migration permissions SAV (Phase 4).
2. Migration bucket Storage + policies.
3. `src/lib/sav-workflow.functions.ts` (toutes les server fns).
4. `src/components/sav/*` (drawer, list, dialogs, uploader, resolver, badges).
5. Routes : `account.sav`, `vendor.sav`, `admin.sav-rules`, refonte `admin.cockpit.sav`.
6. Boutons "Demande SAV" sur `orders.tsx` + page commande client.
7. Compteurs/badges nav vendeur + admin.

## Hors scope v1 (à valider plus tard)

- Cron notifications SLA dépassé.
- Chargeback / fraud workflows automatiques.
- Génération PDF avoirs.
- Notifications email/SMS (les notifications in-app suffisent en v1).
- Workflow `partially_accepted` côté UI vendeur (admin only en v1).

---

**Estimation :** ~1 migration + ~12 nouveaux fichiers + ~6 routes éditées. Volume important — je découperai l'implémentation en 3 vagues (couche métier → UI partagée → routes par espace) pour rester contrôlable. Confirme et je démarre par la migration permissions + storage, puis la couche server functions.
