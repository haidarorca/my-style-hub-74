
## Vision cible (rappel)

**Circuit B — Poids connu** : prix final affiché dès la fiche produit, paiement unique (produit + transport), workflow cockpit court (Réception → Vérif poids → Prête → Expédiée → Livrée), aucun paiement complémentaire client.

**Circuit A — Poids inconnu** : estimation indicative, paiement initial du produit, workflow long actuel (Pesée → Calcul frais → Paiement complémentaire → …).

**Panier** : chaque ligne possède son propre transport, indépendant des autres lignes.

**Affichage client** : un seul prix consolidé (produit + transport), pas de ventilation visible côté client.

**Finances** : `orders.total` = produit + fret payé. Plus jamais `Fret = 0` quand le client a déjà payé le fret.

---

## Diagnostic de l'existant

1. **Cart ligne ≠ transport ligne** : `__shipping_service_id` est stocké dans `customization` ; mais `cart.tsx` agrège un seul `shippingServiceId` global pour TOUT le panier (`preferredShippingServiceId` prend le premier). → On ne respecte pas la règle "par article".
2. **Checkout** : `createCheckoutOrder` reçoit UN `shippingServiceId` global et applique le fret à tous les internationaux. Si certains items sont poids inconnu, ils contaminent la logique "all declared".
3. **Cockpit / circuit B** : `getNextStep` se base sur `weightStatus` (declared/verified/anomaly) mais la création de `order_shipment_assessments` au checkout met `status='fees_calculated'` SANS poser de drapeau `declared`. Le cockpit retombe alors sur le circuit A par défaut.
4. **Fiche produit** : `EstimatedShippingPanel` affiche le prix transport mais le prix produit principal au-dessus n'inclut PAS le transport sélectionné — le client ne voit pas le prix final consolidé.
5. **Affichage panier** : la ligne affiche le prix produit séparément ; la barre du bas montre "Sous-total + Transport" ventilés.
6. **Finances** : `orders.total` est correct au checkout (16 137,5), mais l'affichage cockpit/finance ventile parfois `Fret = 0` car la lecture s'appuie sur `order_shipment_assessments.air_freight_fee` seul, sans prise en compte du fret pré-payé.

---

## Plan d'action

### 1. Données & contrat

- Ajouter une colonne `weight_mode` ('declared' | 'unknown') sur `order_shipment_assessments` pour rendre le circuit explicite, calculée et écrite au checkout.
- Stocker au niveau de chaque `order_items.customization.__shipping_service_id` le service choisi pour la ligne (déjà fait), ET un champ `__freight_fee` (FCFA) figé pour les lignes poids connu.
- `orders.total` reste la source de vérité du payé. Une vue/agrégat `order_finance_breakdown` (calcul à la volée côté serveur) retournera `{ products_total, freight_paid_total, total }` pour le cockpit.

### 2. Panier (`cart.tsx` + `use-cart.tsx`)

- Supprimer le sélecteur de transport GLOBAL en bas de panier pour les articles à poids connu : ils utilisent déjà leur service choisi en fiche produit. On garde un sélecteur global UNIQUEMENT pour les lignes poids inconnu (préférence).
- Ajouter sur chaque ligne panier internationale :
  - poids connu → mini-sélecteur transport (3 modes) + prix unitaire final (produit + transport) recalculé à la volée
  - poids inconnu → mention "Transport calculé après pesée" + service de préférence partagé
- Bottom bar : afficher UN seul total (produits + fret connu cumulé). Pas de ventilation.

### 3. Checkout (`checkout.functions.ts`)

- Calculer le fret **ligne par ligne** :
  - ligne poids connu + service choisi → fret figé, ajouté à `orders.total`
  - ligne poids inconnu → fret = 0 au checkout, à calculer plus tard
- Créer `order_shipment_assessments` avec `weight_mode = 'declared'` SEULEMENT si TOUTES les lignes internationales sont en poids connu. Sinon `weight_mode = 'unknown'` et statut `pending_arrival` (circuit A).
- Persister `__freight_fee` et `__shipping_service_id` dans `order_items.customization`.

### 4. Cockpit (`workflow.ts` + `WorkflowControlPanel.tsx` + `useRealOrders.ts`)

- `getNextStep` : prendre en entrée `weight_mode` (de l'assessment) au lieu de déduire de `weight_status`. Si `weight_mode='declared'` → circuit B systématique.
- KPI / colonnes : pour les commandes B, ne plus afficher "Pesée / Calcul frais / Paiement".
- `safeLogStatus` : `fees_calculated` + `weight_mode=declared` → libellé "Vérification poids".
- Finance row : `freight_paid = SUM(__freight_fee)` depuis `order_items` pour les commandes B, plus la valeur `air_freight_fee` pour les A après pesée.

### 5. Fiche produit (`product.$productId.tsx` + `EstimatedShippingPanel.tsx`)

- Pour produit poids connu international :
  - le prix principal affiché = `prix produit + prix transport sélectionné`
  - sélecteur 3 modes intégré, prix change instantanément
  - sous-texte discret : "Transport inclus — modifiable au panier"
- Pour produit poids inconnu : panneau séparé (sans prix consolidé) avec "Estimation après pesée — ~7500 FCFA/kg".
- Le `addToCart` envoie `shippingServiceId` ET le `freight_fee` figé.

### 6. Affichage client global

- Cart, fiche produit, récap commande, page commandes : un seul prix (FCFA). Pas de "Produit X / Fret Y".
- Côté admin : conserver la ventilation.

### 7. Migration de correction des données existantes

- Pour les commandes test déjà créées (16 137,5) : recalculer/figer `__freight_fee` sur les `order_items` internationaux, marquer leur assessment en `weight_mode='declared'` si le produit a un poids déclaré.

---

## Technique — fichiers touchés

- **Migration SQL** : ajout `order_shipment_assessments.weight_mode`, backfill, recalcul `order_items.customization.__freight_fee` pour commandes existantes.
- **Server** : `src/lib/checkout.functions.ts` (split fret par ligne, weight_mode), `src/lib/admin-logistics.functions.ts` (lire weight_mode, exposer freight_paid).
- **Cockpit** : `src/cockpit/lib/workflow.ts` (getNextStep basé sur weight_mode), `WorkflowControlPanel.tsx`, `useRealOrders.ts`.
- **Frontend produit/panier** : `src/routes/product.$productId.tsx`, `src/components/product/EstimatedShippingPanel.tsx` (mode "consolidé"), `src/routes/cart.tsx` (sélecteur par ligne), `src/hooks/use-cart.tsx` (passer freight figé).

---

## Hors scope (à confirmer si à inclure)

- Refonte de l'UI Finance (`admin.cockpit.finance.tsx`) — je toucherai uniquement la fonction de lecture pour que `Fret` ne soit plus 0. Refonte visuelle séparée si demandée.
- Pas de changement aux notifications vendeur ni aux WhatsApp dispatch.

Confirmation : je peux exécuter ce plan en un seul cycle. Veux-tu que je procède maintenant, ou y a-t-il un point à ajuster (notamment le hors-scope) ?
