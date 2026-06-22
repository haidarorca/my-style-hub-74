
# Vague 3 — Système SAV exploitable en production

Avant le code, audit de cohérence avec les Vagues 1-2 et plan d'exécution. Aucun doublon ne sera créé : tout réutilise `sav-workflow.functions.ts`, `SavCaseDrawer`, `SavCaseList`, `resolve_sav_rules`, `sav_fee_charges`.

## 0. Audit anti-contournement / anti-duplication

| Risque | Vérification | Statut |
|---|---|---|
| Décision finale court-circuitée | Seul `adminDecide`/`adminOverride` mute `decided_resolution` ; vendeur reste sur `vendor_recommendation` | ✅ déjà OK, on garde |
| Logique d'annulation codée en dur | Toute lecture de la politique passe par `resolveRules()` → `cancellation_policy` | À enforcer dans la nouvelle `cancelOrder` |
| Imports : règles ignorées | `openSavCase` lit déjà `returns_enabled`/`exchanges_enabled`. Manque le scope `source_country` dans l'appel | À corriger dans `resolveRules` côté TS |
| Stock contourné lors d'un échange | Aucun écrit sur `product_variants.stock` aujourd'hui | À créer via `acceptExchange` |
| Notifications dupliquées | Une seule fonction `notifySav()` interne, jamais d'`INSERT notifications` éparpillé | À créer |
| Compteurs sidebar dispersés | Un unique server fn `getSavCounts()` consommé par tous les espaces | À créer |

## 1. Workflow d'échange complet

Nouveaux server fns dans `sav-workflow.functions.ts` :

- `acceptExchange({ exchange_id })` (admin) : passe `sav_exchanges.status='accepted'`, calcule `surcharge_amount`/`partial_refund_amount` selon `delta_amount`, crée automatiquement les `sav_fee_charges` selon les règles `fee_*_payer_default`, génère un `order_items` de remplacement (lié à l'`order_id` d'origine, flag `is_exchange_replacement=true`), décrémente le stock variant si présent.
- `shipExchange({ exchange_id, tracking? })` : `status='shipped'`.
- `markExchangeDelivered({ exchange_id })` : `status='delivered'` + clôture du `sav_case` parent.
- `cancelExchange({ exchange_id, reason })` : `status='cancelled'` + restock.

Règles consultées (lecture seule, jamais codées en dur) : `exchange_size_free`, `exchange_color_free`, `exchange_variant_requires_approval`, `exchange_different_product_requires_approval`. Si `_requires_approval=true` et admin n'a pas le perm `sav.decide` → refus.

Migration mineure :
- `ALTER TABLE order_items ADD COLUMN is_exchange_replacement boolean DEFAULT false, exchange_source_case_id uuid REFERENCES sav_cases(id)`
- `ALTER TABLE order_items ADD COLUMN source_exchange_id uuid REFERENCES sav_exchanges(id)`

Stock : utilise `product_variants.stock` (déjà présent). Si la variante n'a pas de stock géré, on n'écrit rien (compat futur module stock vendeur). Toute modif passe par une RPC `apply_stock_delta(_variant_id, _delta, _reason)` SECURITY DEFINER pour préserver l'audit.

## 2. Annulation pilotée par règle

Nouveau server fn `cancelOrderItem({ order_item_id, reason })` :
1. Lit `orders.status` → `cancellation_stage`.
2. `resolveRules(product_id, destination_country, vendor_id, source_country)` → `cancellation_policy[stage]`.
3. Si `allowed=false` → refus + suggestion fallback (`return` post-livraison).
4. Si `decider='client'` et appelant = buyer → exécution directe ; sinon création d'un `sav_case` `case_type='cancellation'` avec `decided_resolution='refund'`, `requested_resolution='refund'`, status `accepted` si auto, sinon `open` (admin tranche).
5. Calcul automatique des `sav_refunds` (`amount = paid * refund_pct/100`) et `sav_fee_charges` (`fees_to`).

## 3. Centre SAV cockpit (production)

Refonte `src/cockpit/pages/SavCenter.tsx` (réutilise `SavCaseList` + `SavCaseDrawer` existants) :
- **KPI header** : `open`, `vendor_responded`, `escalated`, `in_arbitration`, SLA dépassé, à clôturer aujourd'hui.
- **Filtres** : client (search), vendeur, boutique, produit, catégorie, pays source, pays destination, statut[], type[], priorité, période, "uniquement assistés admin".
- **Indicateur de priorité** calculé : urgent si `sla_deadline_at < now()+24h`, bloqué si `vendor_responded` depuis >72h sans décision, litige si `case_type='dispute'`. Badge couleur sur chaque ligne.
- Actions bulk (admin uniquement) : assigner, clôturer, escalader.

## 4. Administration assistée — UI

Nouveau composant `<AdminAssistedSavDialog>` dans le drawer admin :
- Recherche client (orders.buyer_id ou nom/tel).
- Sélection commande → article.
- Type de dossier + canal d'assistance (`assisted_channel`) + raison (`assisted_reason`).
- Appelle `openSavCase` avec `on_behalf_of_user_id` rempli.
- Badge "Créé par admin pour [client]" visible partout (drawer header + liste).

`SavCaseList` ajoute colonne `Source` : `Client` / `Vendeur` / `Admin (pour X)`.

## 5. Notifications in-app

Une fonction interne `notifySav(case_id, event)` dans `sav-workflow.functions.ts` insérant dans `notifications` (table existante). Événements :

| Événement | Client | Vendeur | Admin |
|---|---|---|---|
| `case.opened` | ✓ (si admin a ouvert pour lui) | ✓ | ✓ (tous admins avec perm `sav.view`) |
| `vendor.recommended` | — | — | ✓ |
| `admin.decided` | ✓ | ✓ | — |
| `admin.requested_info` | ✓ | — | — |
| `refund.issued` | ✓ | ✓ | — |
| `exchange.proposed` | ✓ | ✓ | — |
| `exchange.shipped` | ✓ | — | — |
| `case.closed` | ✓ | ✓ | — |
| `sla.breached` | — | ✓ | ✓ |

Appelée systématiquement aux endroits déjà existants (`adminDecide`, `vendorRecommend`, `adminIssueRefund`, etc.), pas de duplication.

Architecture canaux : table `notifications` reste seule source de vérité. Champs `payload jsonb` + `channel text default 'in_app'` (migration mineure) pour préparer WhatsApp/Email plus tard sans changer le code appelant.

## 6. Sidebars + compteurs dynamiques

Nouveau server fn `getSavCounts({ scope: 'client'|'vendor'|'admin' })` retournant `{ new, pending, urgent, total }`.

Hook `useSavCounts(scope)` (TanStack Query, refetch toutes les 60s, `realtime` channel sur `sav_cases` pour invalider).

Intégration :
- **Client** : `src/routes/account.tsx` (lien existant) → badge `new+urgent`. `MobileBottomNav` reste inchangé.
- **Vendeur** : `src/routes/vendor.tsx` sidebar → entrée "SAV" avec badge `new+pending`.
- **Admin** : `src/routes/admin.tsx` (déjà "Centre SAV") + `CockpitShell` → badge urgent, ajout entrée "Règles SAV" sous Settings.

## 7. Logique import — vérification

Patch `resolveRules()` côté TS pour passer `source_country_id` (lu sur `profiles.source_country_id` du vendeur). Test : depuis le simulateur de `admin.sav-rules.tsx`, on doit voir une règle posée sur `source_country=Chine` apparaître pour un produit dont le vendeur a `source_country_id=Chine`. Ajout d'un onglet "Pays source" dans `admin.sav-rules.tsx`.

## 8. Garde-fous récapitulatifs

- `adminDecide`/`adminOverride` restent les seules portes vers `decided_resolution`.
- `acceptExchange` exige `sav.decide`.
- `cancelOrderItem` exige `sav.decide` quand `decider='admin'`.
- Toutes les écritures stock passent par `apply_stock_delta`.
- Toutes les notifications passent par `notifySav`.
- Trigger `tg_append_only_guard` reste actif sur `sav_actions`, `sav_fee_charges`.

## 9. Découpage en livraisons

1. **Migration mineure** : `is_exchange_replacement`, `source_exchange_id`, `exchange_source_case_id` sur `order_items` ; RPC `apply_stock_delta`.
2. **Server fns** : `acceptExchange` + `shipExchange` + `markExchangeDelivered` + `cancelExchange` + `cancelOrderItem` + `getSavCounts` + `notifySav` (interne).
3. **Patch `resolveRules` TS** pour `source_country_id`.
4. **Refonte SavCenter** (KPI + filtres + priorité + bulk).
5. **`AdminAssistedSavDialog`** + colonne Source dans `SavCaseList`.
6. **Hook `useSavCounts`** + badges dans `admin.tsx` / `vendor.tsx` / `account.tsx` / `CockpitShell`.
7. **Onglet "Pays source"** dans `admin.sav-rules.tsx`.

## 10. Hors périmètre Vague 3 (volontairement)

- Module stock vendeur complet (interface plein-écran de gestion stock).
- WhatsApp / Email réels (architecture posée, intégration plus tard).
- Cron SLA (le calcul `urgent` se fait côté lecture).
- PDF avoirs.

---

Je commence l'implémentation point par point dès validation, en respectant strictement l'ordre du §9 pour ne casser aucun écran existant.
