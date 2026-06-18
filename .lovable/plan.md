# Refonte moteur logistique — Deux circuits import distincts

Objectif : séparer réellement le circuit **Import poids inconnu** (workflow actuel) et **Import poids déclaré** (workflow simplifié), avec contrôle interne agent, saisie article par article, gestion mixte, anomalies bloquantes et badge pays.

---

## 1. Statut initial dépendant du poids déclaré

Aujourd'hui, `getOrCreateShipmentAssessment` crée systématiquement un assessment et bascule en `awaiting_weighing` dès qu'au moins un item n'a pas de poids déclaré. Résultat : tout passe par la pesée client.

**Nouveau comportement (`src/lib/shipment-assessments.functions.ts`)** :
- Calculer `declared_count` / `unknown_count` / `total_count` sur les items de la sous-commande.
- Si **tous les items** ont un poids déclaré > 0 → statut initial `pending_verification` (Circuit B), `weight_status='declared'`, frais pré-remplis depuis l'estimation produit + service choisi par le client (transport déjà sélectionné en checkout).
- Sinon → statut initial `awaiting_weighing` (Circuit A inchangé), `weight_status='unknown'`.
- Persister `declared_items_count`, `unknown_items_count`, `total_items_count` sur `order_shipment_assessments`.

## 2. Workflow Circuit B (poids déclaré)

Étapes :  
`new → confirmed → ordered_supplier → received_warehouse → pending_verification → ready_delivery → shipped → delivered`

Supprimer pour ce circuit : `awaiting_weighing`, `fees_calculated`, `awaiting_client_validation`, `payment_fees`.

- `IMPORT_STEPS_DECLARED` mis à jour dans `src/lib/workflow.config.ts` et `src/cockpit/lib/workflow.ts`.
- `getSteps()` choisit le bon set en fonction de `weight_status`.
- Transitions admin (`admin-logistics.functions.ts` ALLOWED) : ajouter `pending_verification → ready_delivery` (cas OK) et `pending_verification → anomaly` (cas écart).

## 3. Saisie article par article

Création table **`order_shipment_item_weights`** :

```text
id uuid pk
assessment_id uuid fk → order_shipment_assessments (cascade)
order_item_id uuid fk → order_items
declared_weight_kg numeric null
real_weight_kg numeric null
length_cm / width_cm / height_cm numeric null
volumetric_weight_kg numeric (calculé)
verified_at timestamptz null
verified_by uuid null
created_at / updated_at
unique(assessment_id, order_item_id)
```

GRANT + RLS (admin + service_role read/write ; client jamais).

- Nouveau serveur fn `upsertItemWeights` : reçoit la liste, recalcule `total_real_weight`, `chargeable_weight`, `weight_gap_pct` au niveau assessment et met à jour `order_shipment_assessments`.
- Vérification déclenche automatiquement :
  - écart global ≤ tolérance (10 % ou 0.5 kg) → `weight_status='verified'`, statut → `ready_delivery`.
  - sinon → `weight_status='anomaly'`, statut figé sur `pending_verification`, expédition bloquée.

## 4. UI agent — formulaire article par article

`src/components/shared/ShipmentAssessmentDialog.tsx` :  
- Mode Circuit B → afficher tableau des items (libellé, poids déclaré pré-rempli, champs L×l×h + poids réel par ligne).  
- Totaux calculés en bas (poids déclaré total, poids vérifié total, écart, statut).  
- Bouton « Valider la vérification » → `upsertItemWeights` + transition statut.  
- Mode Circuit A → comportement actuel (saisie globale) conservé.

## 5. Commandes mixtes

Une sous-commande est en Circuit B **seulement si 100 % des items ont un poids déclaré**. Sinon Circuit A.

Affichage dans le détail sous-commande (`WorkflowExpandedForm.tsx`) :  
- bloc « Informations logistiques »  
  - Origine (pays vendeur + drapeau)  
  - Articles poids déclaré : X / Y  
  - Articles poids inconnu : X / Y  
  - Poids déclaré total / Poids vérifié total  

## 6. Badges cockpit

- Pas de badge « Poids connu » sur les cartes principales (KZ + IMP suffisent).  
- Badge IMP enrichi avec drapeau + pays d'origine quand connu (`IMP 🇨🇳 Chine`).  
  - Source : `profiles.source_country_id` agrégé via assessment ; déjà disponible dans `LogisticsOrderRow.source_country_*`. Si absent → IMP simple.  
- Bloc « Informations logistiques » uniquement dans le drawer/expanded.

## 7. Gestion des anomalies

- `weight_status='anomaly'` → expédition bloquée (`ready_delivery` non atteignable).  
- Panneau **Anomalies poids** (déjà partiel : `WeightAnomalyPanel.tsx`) — actions :  
  1. Accepter la perte → marque `verified` + débloque (existant).  
  2. Contacter le client (interne uniquement, jamais visible côté client).  
  3. Annuler la commande.  
  4. **Nouveau** : Modifier les frais → ouvre un mini-formulaire (ajustement `air_freight_fee` / `service_fee`) puis débloque.  
- Aucune notification client n'est envoyée pour l'anomalie : libellés client neutres (`En préparation`).

## 8. Confidentialité client

Aucun composant côté client (cart, orders, product) n'affiche `anomaly`, `weight_check`, `declared vs real`. Audit grep ciblé sur :  
- `src/routes/cart.tsx`, `src/routes/orders.tsx`, `src/routes/product.$productId.tsx`,  
- `src/components/product/*`, `src/components/shared/OrderStatusBadge.tsx`.

Tout `weight_status === 'anomaly'` côté client est mappé sur « En préparation logistique ».

## 9. Filtres & KPI cockpit

Dans `workflow.config.ts` + `cockpit/lib/workflow.ts` :  
- File « À peser » : exclut Circuit B (déjà partiellement fait, à durcir sur `pending_verification`).  
- Nouvelle file « À vérifier » : `pending_verification` (Circuit B).  
- File « Attente paiement » : exclut Circuit B.  
- File « À expédier » : inclut Circuit B passé en `ready_delivery`.  
- File « Anomalies » : `weight_status='anomaly'` (toutes commandes).

## 10. Migrations & code

Migration SQL :
1. `order_shipment_item_weights` (table + GRANT + RLS + trigger updated_at).
2. `order_shipment_assessments` : colonnes `declared_items_count int`, `unknown_items_count int`, `total_items_count int`, `weight_gap_pct numeric`.
3. Statut enum / contrainte CHECK : ajouter `pending_verification` dans la liste autorisée.

Code touché (édition ciblée, pas de réécriture) :
- `src/lib/shipment-assessments.functions.ts` — logique de création + nouveau `upsertItemWeights`.
- `src/lib/admin-logistics.functions.ts` — ALLOWED transitions + agrégation row.
- `src/lib/workflow.config.ts` — étapes Circuit B + filtres.
- `src/cockpit/lib/workflow.ts` + `WorkflowControlPanel.tsx` + `OrderDrawer.tsx` + `PipelineView.tsx` + `OrderCard.tsx` — split steps.
- `src/components/workflow/WorkflowRow.tsx` — badge IMP + drapeau, retirer badge poids des cartes principales.
- `src/components/workflow/WorkflowExpandedForm.tsx` — bloc Informations logistiques.
- `src/components/shared/ShipmentAssessmentDialog.tsx` — mode item-par-item.
- `src/components/admin/WeightAnomalyPanel.tsx` — action « Modifier les frais ».

## 11. Vérification

- Build TS automatique.
- Playwright headless : sous-commande tout-déclaré → suite cockpit ne propose plus « Peser » ni « Calculer frais », bouton « Vérifier poids » disponible ; saisie article par article ; écart > 10 % → anomalie bloquante.
- Sous-commande mixte → reste Circuit A.

---

**Note** : pas de changement côté client e-commerce (déjà fait dans l'itération précédente : prix final estimé, sélection mode transport, panier). Aucune notification d'anomalie au client.
