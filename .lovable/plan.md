# Finalisation complète de l'architecture métier

Objectif : que les 3 catégories `LOCAL`, `IMPORT_KNOWN_WEIGHT`, `IMPORT_UNKNOWN_WEIGHT` soient appliquées **uniformément** sur tout le flux, sans logique partielle, sans prorata, sans fret avant pesée.

---

## Règles métier (source de vérité)

| Catégorie | Fret au checkout | Pesée | Paiement fret | Sélecteur transport |
|---|---|---|---|---|
| **LOCAL** | 0 | non | jamais | aucun |
| **IMPORT_KNOWN_WEIGHT** | calculé et **figé** | non | **avec la commande** | choix immédiat (Mode / Prix / Délai) |
| **IMPORT_UNKNOWN_WEIGHT** | **0 / NULL** | oui | **après pesée** | 1 seul choix global (FCFA/kg) pour tous les UNKNOWN |

Regroupement sous-commande : **`(vendor_id + line_kind)`** partout (clé `${vendor_id}::${line_kind}`).

---

## Vague 1 — Panier (`src/routes/cart.tsx` + `use-cart.tsx`)

1. Remplacer le sectionnement `import / local` par **3 sections** : LOCAL, IMPORT_KNOWN_WEIGHT, IMPORT_UNKNOWN_WEIGHT.
2. **Supprimer définitivement le sélecteur transport par ligne** (le `<select>` mt-1 actuellement rendu par ligne international).
3. **KNOWN** : un seul sélecteur de service par sous-commande (vendor+KNOWN) affichant `Mode / Prix figé / Délai`. Prix = somme des frets ligne calculés avec le service choisi.
4. **UNKNOWN** : un seul sélecteur global "Choisissez votre service de transport" affichant uniquement `Mode / FCFA-par-kg / Délai`. Aucun montant. Stocké comme préférence client sur chaque ligne UNKNOWN (`__shipping_service_id`).
5. Total panier = `produits + fret KNOWN` uniquement. UNKNOWN n'ajoute jamais rien au total. Bandeau "Transport poids inconnu calculé après pesée" sous la section UNKNOWN.
6. Bouton checkout désactivé si une section KNOWN ou UNKNOWN existe sans service choisi.
7. `updateLineShipping` reste, mais n'est plus utilisé pour de l'UI par-ligne — utilisé par la propagation "section → toutes les lignes de cette section".

## Vague 2 — Checkout (`src/lib/checkout.functions.ts`)

1. Étendre `CheckoutSchema.items[]` : ajouter `__line_kind` indicatif, accepter un `shippingServiceId` par ligne (déjà fait).
2. Le serveur **recalcule** `line_kind` (source de vérité) ; `shippingServiceId` par ligne accepté pour KNOWN.
3. UNKNOWN : `__freight_fee = 0`, `air_freight_fee = NULL` sur l'assessment, status `pending_arrival`, `weight_mode = "unknown"`. Aucune note d'estimation.
4. KNOWN : `__freight_fee` figé sur la ligne, somme reflétée dans `assessment.declared_freight` (rendu à titre indicatif), status `fees_calculated`, `weight_mode = "declared"`.
5. Branche guest (cart.tsx l. 778-810) : retirer la `shipping_estimate_note` qui parle d'estimation pour UNKNOWN.

## Vague 3 — Cockpit groupage & statuts

Fichiers : `cockpit/lib/sub-orders.ts`, `useSubOrderRows.ts`, `useArticleStates.ts`, `OrderDrawer.tsx`, `SubOrderCard.tsx`, `SubOrdersPanel.tsx`, `Dashboard.tsx`, `WorkflowControlPanel.tsx`, `cockpit/lib/workflow.ts`.

1. Vérifier que **toutes** les lectures (Drawer, Panel, Dashboard, Workflow, history) consomment `sub_order_key` issu de `deriveSubOrders`.
2. `useArticleStates` + `updateStatus` : 100% scopés par `subOrderKey`. Supprimer toute branche "global order status" qui contourne la sous-commande.
3. `WorkflowControlPanel` : actions de transition lisent/écrivent le statut depuis `sub_order_states` via la clé.
4. Pour UNKNOWN : bloquer l'avancement workflow tant que `air_freight_fee IS NULL` (sauf annulation).

## Vague 4 — Pesée (`WeightForm.tsx` + `shipment-assessments.functions.ts`)

1. Form scopé `sub_order_key` UNKNOWN uniquement (déjà partiellement fait → vérifier).
2. Mode global : `real_weight_kg` requis, dimensions L/l/H optionnelles, calcul `volumetric = L*l*H/5000`, `chargeable = max(real, volumetric)`, `air_freight_fee = chargeable * service.price_per_kg`.
3. **Mode `per_item`** : pour chaque order_item UNKNOWN, saisir `real_weight_kg` (requis) + L/l/H (optionnels), calcul volumétrique par article, `air_freight_fee = Σ chargeable_i * rate`.
4. Persistance par article : nouvelle colonne JSON sur `order_shipment_assessments.per_item_weights` (déjà présente ou à ajouter via migration), structure `{ order_item_id: { real_kg, l_cm, w_cm, h_cm, chargeable_kg } }`.
5. À l'écriture : UPDATE de l'assessment scopé par `(order_id, sub_order_key)` UNIQUEMENT.

## Vague 5 — Finances (`finance.functions.ts`, `cockpit-payments.functions.ts`, `admin-logistics.functions.ts`, `OrderDrawer`, `FinanceCenter`)

1. **Plus aucun prorata.** Toute somme s'agrège par `sub_order_key`.
2. `getOrderFinancials` (ou équivalent) renvoie par sous-commande :
   - `products_total` (somme `line_total` non annulés)
   - `freight_total` = KNOWN → Σ `freight_fee` ligne ; UNKNOWN → `air_freight_fee` (0 si NULL) ; LOCAL → 0
   - `commission_total`, `refund_total`, `credit_total`
   - `total_due`, `paid`, `balance`
3. Vue Finance : afficher 1 ligne par sous-commande, jamais une somme mère reconstituée par prorata.
4. `OrderDrawer` : retirer toute trace de `productShare * motherFreight`.

## Vague 6 — Workflow, Paiements, Dashboard

1. `WorkflowDrawer` + `WorkflowExpandedForm` + `useWorkflowActions` : actions par sous-commande (ouvrir avec `sub_order_key` + `order_id`).
2. `PaymentForm` : un paiement est lié à une sous-commande (ajouter `sub_order_key` au formulaire, à `order_payments` si la colonne existe — migration sinon).
3. `Dashboard` : KPIs et listes regroupés sur `sub_order_key`, pas sur `order_id`.
4. History (`useSubOrderHistories`) : déjà keyé sub-order ; vérifier que les events sont créés avec `sub_order_key`.

---

## Détails techniques

- Nouvelle migration (si nécessaire) :
  - `order_shipment_assessments.per_item_weights jsonb`
  - `order_payments.sub_order_key text` + index
- Aucune RLS modifiée.
- Aucune table ajoutée hors migrations existantes (`sub_order_states`).

## Ordre d'exécution

1. Vague 2 (serveur checkout) — pré-requis pour cart.
2. Vague 1 (cart UI).
3. Vague 3 (cockpit grouping/status).
4. Vague 4 (pesée).
5. Vague 5 (finances).
6. Vague 6 (workflow/paiements/dashboard).
7. Vérification finale : `rg` pour `prorata`, `productShare`, `__freight_fee` mal lu, `motherFreight`, et tout chemin lisant l'ancien `is_import` sans `line_kind`.

## Livrable final

Rapport listant pour chaque vague : fichiers modifiés, fonctions modifiées, et 1 phrase par règle métier expliquant où elle est désormais appliquée.
