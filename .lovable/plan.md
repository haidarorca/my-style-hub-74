
# Système SAV unifié KawZone — Architecture fondation

Objectif : un seul système couvrant annulations, retours, échanges, garanties, litiges, remboursements, avoirs et exceptions admin, centré sur l'article mais capable de gérer la commande entière. Le Cockpit reste le centre de pilotage ; la source de vérité reste commandes / sous-commandes / articles / dossiers.

Cette phase = **fondation uniquement** : modèle de données, workflow, règles, permissions, audit. Aucun écran final.

---

## 1. Principes directeurs

- **Granularité article** : un dossier vise par défaut `order_item_id` (taille, couleur, défaut, casse, manquant, échange, garantie).
- **Granularité commande** : un dossier peut viser `order_id` sans article (colis perdu, retard global, livraison, facturation, paiement).
- **Source de vérité** : tables `orders`, `order_items`, et `sav_cases` existante (étendue, pas remplacée).
- **Triple acteur** : Client soumet → Vendeur recommande → Admin arbitre. Seul l'admin valide définitivement.
- **Décisions traçables** : chaque changement = un événement immuable + une décision liée. Append-only.
- **Règles dynamiques** : configurables en base sans toucher au code, résolues par cascade (produit > catégorie > boutique > pays > global).
- **Réutilisation** : on étend `sav_cases`, `order_events`, `order_decisions`, `financial_movements` déjà en place — pas de système parallèle.

---

## 2. Modèle de données (extensions)

### 2.1 Extension `sav_cases`
Colonnes ajoutées :
- `case_type` enum : `cancellation | return | exchange | warranty | dispute | refund | credit_note | admin_exception | other`
- `scope` enum : `item | order` (déjà partiellement implicite via `order_item_id`)
- `requested_resolution` enum : `refund | exchange | repair | credit | replacement | partial_refund | none`
- `decided_resolution` enum (mêmes valeurs, rempli à l'arbitrage)
- `requested_by_party` enum : `client | vendor | admin`
- `vendor_recommendation` enum : `accept | refuse | propose_refund | propose_exchange | propose_other | none`
- `vendor_recommendation_note` text
- `admin_decision` enum : `pending | accepted | refused | partially_accepted | escalated | overridden`
- `admin_decision_reason` text
- `sla_deadline_at` timestamptz (calculée à partir des règles)
- `client_visible` boolean (certaines exceptions admin restent internes)
- `evidence_count` int (compteur dénormalisé)

### 2.2 Nouvelles tables

**`sav_attachments`** — pièces jointes (photos casse, vidéo défaut, facture, preuve livraison)
- `id`, `case_id` FK, `uploader_id`, `uploader_role` (client/vendor/admin), `storage_path`, `mime_type`, `size_bytes`, `caption`, `created_at`.

**`sav_messages`** — fil de discussion par dossier
- `id`, `case_id`, `sender_id`, `sender_role`, `body`, `is_internal_note` (admin only), `created_at`.
- Distinct du système support : un dossier SAV a sa propre timeline structurée.

**`sav_actions`** — log append-only de toutes les actions sur le dossier
- `id`, `case_id`, `actor_id`, `actor_role`, `action_type` (`open | client_response | vendor_recommend | admin_decide | admin_override | escalate | close | reopen | refund_issued | exchange_shipped | attachment_added | message_added | sla_breached | rule_applied`), `from_state` jsonb, `to_state` jsonb, `note`, `created_at`.

**`sav_rules`** — moteur de règles configurable
- `id`, `scope` enum (`global | country | category | shop | product`), `scope_id` (uuid nullable selon scope), `rule_key` enum (`returns_enabled | exchanges_enabled | warranty_enabled | return_window_days | warranty_months | requires_evidence | auto_accept_under_amount | refund_method_default | shipping_cost_attribution`), `value` jsonb, `priority` int, `is_active`, `note`, `created_by`, `created_at`, `updated_at`.
- Résolution par fonction SQL `resolve_sav_rules(_product_id, _destination_country_id, _shop_id)` → jsonb consolidé selon cascade : produit (le plus spécifique) → catégorie (en remontant l'arbre) → boutique → pays → global.

**`sav_refunds`** — opérations financières liées
- `id`, `case_id`, `amount`, `currency`, `method` (`wave | orange_money | cash | bank_transfer | credit_note | other`), `direction` (`to_client | from_vendor | from_kawzone`), `status` (`pending | issued | failed | cancelled`), `linked_movement_id` FK `financial_movements`, `issued_by`, `issued_at`.

**`sav_exchanges`** — pour les échanges
- `id`, `case_id`, `original_item_id`, `replacement_product_id`, `replacement_variant_id`, `replacement_quantity`, `delta_amount` (peut être positif ou négatif), `replacement_order_item_id` (créé une fois validé), `status`.

### 2.3 Relations clés
- `sav_cases.order_id` → `orders.id`
- `sav_cases.order_item_id` → `order_items.id` (nullable si `scope='order'`)
- `sav_cases.source_event_id` → `order_events.id` (déjà présent)
- `sav_cases.source_decision_id` → `order_decisions.id` (déjà présent)
- Toutes les opérations financières restent dans `financial_movements`, juste référencées.

---

## 3. Workflow unifié

États (`sav_cases.status` étendu) :
`draft → open → in_review → vendor_responded → in_arbitration → accepted | refused | partially_accepted → in_execution → resolved → closed`
Branches : `waiting_client`, `waiting_vendor`, `escalated`, `reopened`.

```text
Client/Admin ──open──▶ open
                        │
                        ▼
                     in_review  ───────────────┐
                        │                      │
              vendor recommendation            │ (admin peut court-circuiter)
                        │                      │
                        ▼                      │
              vendor_responded ────────────────┤
                        │                      │
                        ▼                      ▼
                  in_arbitration  ◀────── admin_override
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
     accepted    partially_accepted  refused
        │               │
        ▼               ▼
              in_execution
              (refund/exchange/repair)
                        │
                        ▼
                    resolved
                        │
                        ▼
                     closed
```

Règles invariantes :
- Vendeur ne peut jamais écrire `accepted`/`refused` finaux. Il écrit `vendor_recommendation`.
- Admin peut sauter toute étape (`admin_override`).
- Tout changement d'état → ligne `sav_actions` + `order_events` miroir (pour la timeline commande globale).
- Clôture = `closed_at` + `last_activity_at` figés, `client_visible` peut basculer pour retirer du portail client.

---

## 4. Moteur de règles

Cascade de résolution (du plus spécifique au plus général) :
1. Règle `scope='product'` matching `product_id`
2. Règles `scope='category'` en remontant l'arbre des catégories (la plus proche gagne)
3. Règle `scope='shop'` matching `vendor_id`
4. Règles `scope='country'` : source ou destination
5. Règle `scope='global'`

Clés gérées dès la fondation :
- `returns_enabled`, `exchanges_enabled`, `warranty_enabled`
- `return_window_days` (défaut 7), `warranty_months` (défaut 0)
- `requires_evidence` (photo obligatoire)
- `auto_accept_under_amount` (montant en XOF en-dessous duquel l'admin auto-accepte)
- `shipping_cost_attribution` : `client | vendor | kawzone`
- `refund_method_default`

La résolution n'est jamais figée dans le code applicatif ; le frontend appelle `resolve_sav_rules` au moment de l'ouverture pour savoir quelles options proposer.

---

## 5. Permissions

Nouvelles `admin_permission` ajoutées :
- `sav.view_all`
- `sav.assign`
- `sav.decide` (arbitrage final)
- `sav.override` (passer outre vendeur)
- `sav.rules_manage` (éditer `sav_rules`)
- `sav.refund_issue`
- `sav.exception_create` (créer dossier hors workflow standard)

Matrice :
| Action | Client | Vendeur | Admin standard | Super admin |
|---|---|---|---|---|
| Ouvrir dossier sur son article | ✓ | — | ✓ (au nom du client) | ✓ |
| Voir dossiers de sa boutique | — | ✓ | ✓ | ✓ |
| Recommander | — | ✓ | — | — |
| Décider | — | — | ✓ (`sav.decide`) | ✓ |
| Override vendeur | — | — | ✓ (`sav.override`) | ✓ |
| Éditer règles | — | — | ✓ (`sav.rules_manage`) | ✓ |
| Émettre remboursement | — | — | ✓ (`sav.refund_issue`) | ✓ |
| Créer commande pour client (Sénégal) | — | — | ✓ (perm existante `order.create_for_user`) | ✓ |

RLS :
- Client : SELECT/INSERT sur `sav_cases` où `buyer_id = auth.uid()` (via jointure `orders`).
- Vendeur : SELECT/UPDATE limité aux dossiers de ses produits, et seulement sur les champs `vendor_recommendation*`.
- Admin : tout via `has_admin_permission`.
- `sav_actions` : SELECT large, INSERT via triggers/server functions uniquement (append-only guard).

---

## 6. Cas Sénégal — assistance admin

L'admin peut, journalisé dans `admin_action_log` :
- Créer un dossier au nom d'un client (`requested_by_party='admin'`, `created_by` = admin).
- Modifier une commande existante (déjà couvert par `protect_order_vendor_update` qui laisse passer admin).
- Enregistrer un paiement manuel (déjà couvert par `order_payments`).
- Créer une exception (`case_type='admin_exception'`, `client_visible=false` par défaut).

Tout passe par `logAdminAction` (`admin-auth.core.ts`) → audit complet déjà en place.

---

## 7. Intégration Cockpit

Le Centre SAV (`/admin/cockpit/sav`) devient une **vue de pilotage** au-dessus de `sav_cases` :
- Filtres : type de cas, statut, owner_party, ancienneté, impact financier, boutique, pays, SLA dépassé.
- Actions de masse : assigner, escalader, clôturer.
- Drill-down : ouverture du dossier dans un drawer avec onglets `Timeline (sav_actions)`, `Messages`, `Pièces jointes`, `Décisions`, `Remboursements`, `Règles appliquées`.
- Lien bidirectionnel avec la commande : depuis `OrderDrawer`, onglet "SAV" listant les dossiers liés ; depuis le dossier, lien vers la commande.

L'escalade depuis le Cockpit utilise `escalateToSav` (déjà en place) qui sera étendue pour pré-remplir `case_type` et `requested_resolution`.

---

## 8. Espace client & vendeur (contrats backend)

Server functions à prévoir (phase suivante, pas dans cette fondation) :
- `openSavCase` (client) — validation contre `resolve_sav_rules`
- `respondSavCase` (vendor) — écrit `vendor_recommendation` uniquement
- `decideSavCase` (admin) — écrit `admin_decision` + transition d'état
- `addSavMessage`, `addSavAttachment`
- `issueSavRefund`, `createSavExchange`
- `listMySavCases` (client), `listVendorSavCases` (vendor), `listAllSavCases` (admin, déjà partiel)

Toutes utilisent `requireSupabaseAuth` et écrivent dans `sav_actions` via trigger.

---

## 9. Livrables de cette phase (fondation seulement)

1. Migration unique étendant `sav_cases` + créant `sav_attachments`, `sav_messages`, `sav_actions`, `sav_rules`, `sav_refunds`, `sav_exchanges` avec GRANT + RLS + triggers append-only + trigger miroir vers `order_events`.
2. Fonction SQL `resolve_sav_rules(_product_id, _destination_country_id, _shop_id)`.
3. Enum `admin_permission` étendue (sav.*).
4. Seed des règles globales par défaut (`returns_enabled=true`, `return_window_days=7`, etc.).
5. **Aucun écran**. Aucune server function client/vendeur. Aucun bouton.

---

## 10. Points à valider avant de coder

1. **Périmètre des `case_type`** ci-dessus — en manque-t-il (ex. `chargeback`, `fraud`) ?
2. **États du workflow** — la branche `partially_accepted` (ex. rembourser 50%) est-elle souhaitée dès la v1 ?
3. **Règles** — la liste des `rule_key` couvre-t-elle vos besoins métier immédiats, ou faut-il ajouter (ex. `return_address_id`, `restocking_fee_percent`) ?
4. **Visibilité vendeur** — le vendeur voit-il les messages client/admin, ou seulement un résumé ?
5. **Pièces jointes** — bucket Storage dédié `sav-evidence` privé, avec URLs signées : OK ?
6. **SLA** — voulez-vous une notification automatique (cron) quand `sla_deadline_at` est dépassé ?
7. **Échanges** — quand un échange est accepté, on crée une nouvelle ligne `order_items` rattachée à la commande d'origine, ou une nouvelle commande ?

Réponds aux 7 points (ou valide tels quels) et je lance la migration de fondation.
