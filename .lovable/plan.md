# Pivot Cockpit — 1 sous-commande boutique = 1 dossier indépendant

## Vision validée

- Côté **admin** : une commande mère KZ-000101 contenant 3 boutiques apparaît comme **3 lignes indépendantes** dans le Cockpit (`KZ-000101 · 1/3`, `2/3`, `3/3`).
- Cliquer sur une ligne ouvre un drawer **scopé à UNE seule boutique** (articles, workflow, ruptures, remboursements de cette boutique uniquement).
- Une petite zone "Commandes liées" permet de naviguer vers les sœurs (`1/3`, `3/3`) sans jamais charger plusieurs boutiques dans le même conteneur.
- Le mot **MIXTE disparaît complètement** (badge, filtre, logique, calcul).
- Côté **client** : rien ne change. Il voit toujours `KZ-000101`, une seule commande, un seul paiement.

## Architecture cible

```text
Cockpit list (admin)              Drawer (admin)
─────────────────                 ───────────────
KZ-000101 · 1/3  Boutique A       ┌─ Header: KZ-000101 · 2/3 — Boutique B
KZ-000101 · 2/3  Boutique B  ───► ├─ Client + finances mère (lecture seule)
KZ-000101 · 3/3  Boutique C       ├─ Articles de B uniquement
KZ-000102        Boutique D       ├─ Workflow de B (1 accordéon)
                                  ├─ Ruptures / remboursements de B
                                  └─ Commandes liées: [1/3] [3/3] ← navigation

Client orders page (inchangé)
─────────────────────────────
KZ-000101  (vue agrégée)
```

## Décisions par défaut (modifiable)

1. **Tri liste** : les sous-commandes d'une même mère restent groupées (tri secondaire par index), tri primaire par priorité opérationnelle (bloquant > pending > ready).
2. **Filtres** : suppression du filtre `type=mixed`. Nouveau filtre `multi-boutiques` (booléen) si besoin.
3. **Recherche** : `KZ-000101` matche les 3 lignes ; `KZ-000101 2` ne matche que `2/3`.
4. **Paiement** : reste sur la mère (un seul `PaymentForm` accessible depuis chaque drawer, en lecture+action).
5. **Workflow** : 1 `WorkflowControlPanel` par drawer (la boutique = unité de pilotage).

## Chantier (Phase 2)

### Étape A — Modèle "ligne = sub_order" en mémoire
- Nouveau hook `useSubOrderRows()` : à partir de `useRealOrders()`, déplie chaque commande en N lignes `SubOrderRow` (1 par vendor). Pure dérivation, zéro SQL.
- Type `SubOrderRow` = `DerivedSubOrder` enrichi des champs nécessaires à la liste (customer, mother totals lecture seule, `mother_order_id`, `siblings: {label, vendor_id}[]`).

### Étape B — Liste Cockpit
- `OrderCard.tsx` → `SubOrderCard.tsx` (ou même fichier, props adaptées). Affiche `label` (`KZ-000101 · 2/3`), nom boutique, kind (LOCAL/IMPORT), KPI de la sub-order uniquement.
- `CockpitNext.tsx` / `PipelineView.tsx` : itèrent sur `subOrderRows` au lieu de `orders`.
- Buckets / onglets recalculés sur la sub-order (pas sur la mère).
- Filtres : retirer `mixed`, ajuster compteurs.

### Étape C — Drawer scopé sub-order
- `OrderDrawer.tsx` : accepte `{ motherOrderId, vendorId }` au lieu d'`orderId` seul.
- Charge la mère, filtre `articles` au `vendor_id` reçu, dérive UNE sub-order.
- Supprime `SubOrdersPanel` (plus de liste interne).
- 1 seul `WorkflowControlPanel` (celui de la boutique courante).
- `ArticlesPanel` : articles de la boutique uniquement.
- Header : `KZ-000101 · 2/3 — Boutique B`.
- Nouveau composant `RelatedSubOrdersStrip` : chips cliquables vers les sœurs, met à jour `vendorId` dans le drawer (pas de fermeture).
- Bloc finances mère en lecture seule (montant total commande, payé, solde) + lien "Paiement client" qui ouvre la modal `PaymentForm` (action sur la mère).

### Étape D — Nettoyage final MIXTE
- Recherche `rg -i "mixte|mixed|is_mixed|OrderMixType|WORKFLOW_MIXED"` → suppression. Adaptation des types `OrderType`, `OrderTypeBadge`.
- `getOrderTypesBatch` / `orderTypeMap` : supprimés ou remplacés par dérivation sub-order.

### Étape E — Audit / vérif
- Build vert.
- Playwright : ouvrir Cockpit, vérifier que `KZ-000101` apparaît en 3 lignes, ouvrir `2/3`, vérifier le drawer ne contient QUE Boutique B, cliquer sur chip `1/3` → drawer recharge sur A.

## Hors scope (phases ultérieures)

- Soft-delete vendeur + snapshots `vendor_name_snapshot` (Phase 3).
- Panneau rentabilité par article (Phase 4).
- Frais d'expédition multi-colis flexible (Phase 4).

## Risque assumé

Les hooks `useOrderAggregatesBatch`, `useArticleStates`, `usePendingFinancialActions` aujourd'hui calculent par mère. Pour Phase 2 on garde l'agrégat mère mais on l'**utilise** scopé par vendor au niveau de la ligne et du drawer (dérivation in-memory déjà faite par `deriveSubOrders` / `aggregateOrder`). Pas de refonte hooks ce sprint.

**Estimation** : ~10–12 fichiers édités, 1–2 fichiers créés, aucune migration DB.

Dis "go Phase 2" et j'enchaîne directement.
