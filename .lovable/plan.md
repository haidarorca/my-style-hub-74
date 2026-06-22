
# Vague 2 — Verrouillage de la logique métier SAV

Objectif : compléter le modèle de données et le moteur de règles pour couvrir tous les scénarios réels (annulations par étape, imports, échanges typés, garanties, ventilation des frais, administration assistée) **avant** de construire les notifications, compteurs, menus et écrans finaux.

## 1. Audit du modèle actuel vs scénarios demandés

Légende : ✅ couvert · ⚠️ partiel · ❌ manquant

| Scénario | État actuel | Action |
|---|---|---|
| Annulation par étape (11 cas) | ⚠️ `case_type=cancellation` existe, mais aucune politique par étape, aucun snapshot de l'étape déclenchante, pas de calcul automatique du remboursable | Ajouter rule_key `cancellation_policy` + colonne `cancellation_stage` |
| Qui paie / part remboursable | ⚠️ `shipping_cost_attribution` global unique | Ventilation détaillée via nouvelle table `sav_fee_charges` |
| Produits importés (CN/TR/LB) | ❌ Pas de scope `source_country`, pas de notion de disposition (liquidation/destruction/revente) | Étendre `sav_rule_scope` + nouvelles rule_keys `import_returns_policy`, `disposition_default` |
| Échanges typés (taille/couleur/variante/produit) | ⚠️ `sav_exchanges` stocke le remplacement mais pas le **type** ni l'intention | Ajouter colonne `exchange_kind` enum |
| Garantie vendeur vs constructeur vs réparation | ⚠️ `warranty` unique, `repair` n'existe qu'en `resolution`, pas en `case_type` | Ajouter `repair` à `sav_case_type` + colonne `warranty_scope` (vendor/manufacturer/none) |
| Frais (livraison, retour, emballage, préparation, import, manutention) | ❌ Un seul rule_key global | Table `sav_fee_charges` (case_id, fee_kind, payer_party, amount) + rule_keys par type |
| Transporteur comme partie payante | ❌ `sav_party` n'inclut pas `carrier` | Ajouter `carrier` à `sav_party` + `sav_owner_party` |
| Administration assistée (Sénégal) | ⚠️ `on_behalf_of_user_id` existe, mais pas de canal ni de raison | Ajouter `assisted_channel`, `assisted_reason` |

## 2. Politique d'annulation par étape (rule engine)

Une seule rule `cancellation_policy` (JSONB) résolue par cascade Produit → Catégorie → Boutique → Pays → Global. Structure :

```json
{
  "new":               {"allowed": true,  "decider": "client",  "fees_to": "none",     "refund_pct": 100},
  "confirmed":         {"allowed": true,  "decider": "client",  "fees_to": "none",     "refund_pct": 100},
  "preparing":         {"allowed": true,  "decider": "admin",   "fees_to": "client",   "refund_pct": 95},
  "ordered_supplier":  {"allowed": true,  "decider": "admin",   "fees_to": "client",   "refund_pct": 80},
  "received_warehouse":{"allowed": true,  "decider": "admin",   "fees_to": "client",   "refund_pct": 70},
  "awaiting_weighing": {"allowed": true,  "decider": "admin",   "fees_to": "client",   "refund_pct": 70},
  "fees_calculated":   {"allowed": true,  "decider": "admin",   "fees_to": "client",   "refund_pct": 70},
  "payment_fees":      {"allowed": true,  "decider": "admin",   "fees_to": "client",   "refund_pct": 70},
  "ready_delivery":    {"allowed": true,  "decider": "admin",   "fees_to": "client",   "refund_pct": 60},
  "shipped":           {"allowed": false, "decider": "admin",   "fees_to": "client",   "refund_pct": 0},
  "delivered":         {"allowed": false, "decider": "admin",   "fees_to": "none",     "refund_pct": 0, "fallback": "return"}
}
```

`delivered` bascule automatiquement le case_type vers `return` (pas d'annulation post-livraison).

Snapshot : à l'ouverture du cas on remplit `sav_cases.cancellation_stage` (= `orders.status` instantané) → la décision reste rejouable même si la commande progresse.

## 3. Politique produits importés

Nouveau scope `source_country` (rattaché aux pays sources CN/TR/LB via `countries`). Nouvelles rule_keys :

- `import_returns_policy` : `{"allowed": false}` ou `{"allowed": true, "client_pays_return": true}`
- `import_exchanges_policy` : idem
- `disposition_default` : `"liquidation_local" | "destruction" | "resale" | "return_to_supplier"`
- `refund_policy` : `{"mode": "partial", "max_pct": 50}` quand retour impossible

Résolution finale : Produit > Catégorie > Boutique > **source_country** > Pays destination > Global.

## 4. Échanges typés

Ajouter à `sav_exchanges` :

```sql
exchange_kind sav_exchange_kind NOT NULL DEFAULT 'variant'
-- enum: size_only, color_only, variant, different_product, repair_replacement
surcharge_amount numeric -- si delta > 0
partial_refund_amount numeric -- si delta < 0
```

Le `delta_amount` existant reste la source de vérité financière, les deux colonnes ci-dessus servent au reporting et à la résolution de règles (un échange taille seul peut être gratuit, un échange produit différent jamais).

Rules associées : `exchange_size_free`, `exchange_color_free`, `exchange_variant_requires_approval`, `exchange_different_product_requires_approval`.

## 5. Garantie / SAV / réparation

- Ajouter `repair` à `sav_case_type` (case_type final, pas seulement résolution).
- Ajouter colonne `warranty_scope sav_warranty_scope` à `sav_cases` (`none | vendor | manufacturer | kawzone_commercial`).
- Nouvelles rule_keys : `warranty_vendor_months`, `warranty_manufacturer_months`, `repair_allowed`, `repair_pays_party` (`client|vendor|kawzone`).

Distinction métier :
- **retour commercial** = `case_type=return`, fenêtre `return_window_days`
- **échange** = `case_type=exchange`, kind selon §4
- **SAV/dispute** = `case_type=dispute`
- **réparation** = `case_type=repair`
- **garantie vendeur** = `case_type=warranty`, `warranty_scope=vendor`
- **garantie constructeur** = `case_type=warranty`, `warranty_scope=manufacturer`

## 6. Ventilation des frais

Nouvelle table `sav_fee_charges` (append-only via trigger existant) :

```sql
case_id          uuid not null
fee_kind         sav_fee_kind not null
  -- enum: shipping_outbound, shipping_return, packaging,
  --       preparation, import_logistics, handling, restocking
payer_party      sav_party not null  -- client|vendor|admin|carrier|kawzone
amount           numeric not null
currency         text not null default 'XOF'
reason           text
created_by       uuid
created_at       timestamptz
```

Rule_keys associés (par fee_kind) : `fee_{kind}_payer_default`. Le moteur produit automatiquement les lignes `sav_fee_charges` à la décision admin (overridable).

Ajouter `carrier` à `sav_party` et `sav_owner_party`.

## 7. Administration assistée

Sur `sav_cases` :
- `assisted_channel sav_assisted_channel` (`phone | whatsapp | in_person | email | other`)
- `assisted_reason text`
- `on_behalf_of_user_id` déjà présent ✅

Garantie d'audit : `sav_actions` capture déjà l'acteur réel ; on filtre les listings admin par `on_behalf_of_user_id IS NOT NULL` pour reporting "dossiers ouverts pour le client".

## 8. Migration unique proposée (étapes SQL)

1. `ALTER TYPE sav_case_type ADD VALUE 'repair'`
2. `ALTER TYPE sav_party ADD VALUE 'carrier'` + idem `sav_owner_party`
3. `ALTER TYPE sav_rule_scope ADD VALUE 'source_country'`
4. `ALTER TYPE sav_rule_key ADD VALUE` × N (cancellation_policy, import_*, disposition_default, refund_policy, exchange_*, warranty_*_months, repair_*, fee_*_payer_default)
5. `CREATE TYPE sav_exchange_kind`, `sav_warranty_scope`, `sav_assisted_channel`, `sav_fee_kind`
6. `ALTER TABLE sav_cases ADD COLUMN cancellation_stage text, warranty_scope sav_warranty_scope, assisted_channel sav_assisted_channel, assisted_reason text`
7. `ALTER TABLE sav_exchanges ADD COLUMN exchange_kind, surcharge_amount, partial_refund_amount`
8. `CREATE TABLE sav_fee_charges (...)` + GRANT + RLS (admin write, client/vendor read own) + trigger append-only
9. Seed étendu : politique d'annulation par défaut (cf. §2), politiques imports CN/TR/LB par défaut, frais par défaut
10. Mise à jour `resolve_sav_rules` pour intégrer le scope `source_country` (Produit > Catégorie > Boutique > source_country > Pays destination > Global)

## 9. Ce qu'on ne touche PAS encore (volontairement)

- Notifications in-app et compteurs
- Liens sidebar / badges
- Cron SLA
- Workflow d'échange (création auto des `order_items` de remplacement)
- Écrans finaux client/vendeur/admin
- PDF avoirs

Tout cela sera construit en Vague 3 **après** validation de cette migration et de la politique par défaut.

## 10. Validation demandée avant exécution

Réponds par OUI/NON/ajustement sur :

1. Politique d'annulation par étape proposée au §2 (pourcentages, qui paie) — convient-elle comme défaut global modifiable par règle ?
2. Ajout du scope `source_country` (au lieu de réutiliser `country`) pour les imports — d'accord ?
3. Ajout de `repair` comme `case_type` distinct de `warranty` — d'accord ?
4. Table `sav_fee_charges` avec ventilation par `payer_party` (incluant `carrier`) — d'accord ?
5. Ajout des champs `assisted_channel` / `assisted_reason` sur `sav_cases` — d'accord ?
6. Migration unique englobant tous ces changements (vs plusieurs petites migrations) — d'accord ?

Dès que tu valides (même partiellement), j'exécute la migration et je seede les politiques par défaut. Aucun écran final ne sera touché avant.
