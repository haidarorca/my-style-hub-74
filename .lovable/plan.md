
# Implémentation finale — Circuit Import Poids Connu

## 1. Affichage client — Prix total estimé (produit + transport)

**Fichiers** : `src/components/product/ProductCard.tsx`, `src/routes/product.$productId.tsx`, `src/components/product/DeliveryAvailabilityBadge.tsx`, nouveau hook `src/hooks/use-estimated-total.tsx`.

- Créer `useEstimatedTotal(product)` : combine `useProductDisplayPrice` + le mode de transport le moins cher disponible pour la destination courante (via `useShippingServices` + `useDeliveryCountry`).
- Sur `ProductCard` : si `is_international && weight_kg > 0` → afficher `TOTAL ESTIMÉ : X FCFA` à la place du prix produit seul, avec petite mention "produit + transport".
- Sur la page produit : bloc "Coût total estimé" listant les modes (Maritime / Avion / Express) avec **prix final + délai uniquement** (jamais FCFA/kg, CBM, poids facturable).
- Cas local ou poids inconnu → on garde le comportement actuel (prix produit seul + badge existant).

## 2. Panier / Checkout — Modes de transport épurés

**Fichier** : `src/routes/cart.tsx`.

- Remplacer l'affichage actuel `price_per_kg` par : nom du mode + prix final estimé pour le panier + délai.
- Garder l'auto-sélection du moins cher (déjà faite), bouton "Changer" pour ouvrir la liste.
- Message client adaptatif selon le statut :
  - inconnu : "Le coût du transport sera calculé après réception et pesée du colis."
  - déclaré : "Le coût du transport affiché est calculé à partir des informations fournies par le vendeur et sera vérifié par notre équipe logistique."
  - vérifié : "Le coût du transport a été confirmé par notre équipe logistique."

## 3. Workflow cockpit — Deux pistes distinctes

**Fichiers** : `src/cockpit/lib/workflow.ts`, `src/components/workflow/WorkflowStepBar.tsx`, `src/lib/admin-logistics.functions.ts`.

- Ajouter dans `workflow.ts` : `getImportFlow(weightStatus)` qui retourne :
  - **Poids inconnu** (workflow A) : `new → confirmed → ordered_supplier → received_warehouse → awaiting_weighing → fees_calculated → payment_fees → ready_delivery → shipped → delivered`.
  - **Poids déclaré/vérifié** (workflow B) : `new → confirmed → ordered_supplier → in_transit → received_warehouse → weight_check → ready_delivery → shipped → delivered` (pas d'étapes pesée / calcul frais / paiement complémentaire).
- `WorkflowStepBar` lit `order.weight_status` pour rendre la bonne séquence.
- Côté serveur (`admin-logistics.functions.ts`), masquer les filtres "À peser / Calculer frais / Attente paiement transport" pour les commandes à poids connu (filtrage côté requête + côté UI dans `QuickFilterBar`).

## 4. Vérification agent (interne)

**Fichier** : `src/components/shared/ShipmentAssessmentDialog.tsx` (déjà en mode vérification).

- À la validation :
  - Si écart ≤ tolérance → statut `verified`, on continue automatiquement vers `ready_delivery`.
  - Si écart > tolérance → statut `anomaly`, blocage expédition + création dossier (voir §5).
- Le client ne voit jamais cette étape (déjà masquée côté `WorkflowStepBar` public).

## 5. File d'anomalies admin

**Fichiers** : nouveau composant `src/components/admin/WeightAnomalyPanel.tsx`, intégré dans `src/routes/admin.logistics.tsx`.

- Liste des commandes `weight_status = 'anomaly'` avec : poids déclaré, poids réel, écart kg, écart %, vendeur, transport choisi initialement.
- Trois actions par dossier :
  1. **Accepter la perte** → passe en `verified` + déverrouille expédition (RPC `resolve_weight_anomaly` avec action `accept_loss`).
  2. **Contacter le client** → ouvre `support_conversations` pré-rempli (complément à payer / changer de mode).
  3. **Annuler la commande** → cancel + remboursement standard.
- Côté serveur : `src/lib/weight-anomalies.functions.ts` (server fn `resolveWeightAnomaly` avec `requireSupabaseAuth` + check `support` permission).

## 6. Migration BDD (légère)

**Nouvelle migration** : colonne `anomaly_resolution` (text nullable) + `anomaly_resolved_by` (uuid) + `anomaly_resolved_at` (timestamptz) sur `order_shipment_assessments`. Aucune nouvelle table.

## Hors scope

- Pas de nouvelle colonne produit, pas de nouveau prix BDD : tout reste calculé à la volée via `logistics-rules.ts`.
- Pas de modification du formulaire vendeur ni des migrations existantes.
- Pas de refonte visuelle générale (cartes produit gardent leur layout).

## Technique

- `useEstimatedTotal` : hook React Query qui dépend de `[productId, destinationCountryId]`, réutilise les services déjà chargés par `useShippingServices`.
- Tolérance : constantes existantes `WEIGHT_TOLERANCE_PCT` / `WEIGHT_TOLERANCE_KG` dans `logistics-rules.ts`.
- Branchement workflow B : ne crée pas d'`order_shipment_assessments` avec `status = awaiting_weighing` quand `getOrCreateShipmentAssessment` détecte poids déclaré complet (déjà partiellement fait — on rend la pré-saisie obligatoire et on saute `awaiting_weighing` côté cockpit).

Validation : vérification visuelle via Playwright sur (a) fiche produit international avec poids, (b) panier avec auto-sélection, (c) cockpit d'une commande poids connu (absence des étapes pesée), (d) panneau anomalie.
