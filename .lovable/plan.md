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

## Phase 2 — LIVRÉE

### Livré
- `useOrderAggregatesBatch` expose désormais `articles` (en plus de `aggregate`).
- Nouveau hook `useSubOrderRows()` → produit N `SubOrderRow` par commande (1 par vendeur), avec `mother_order_id`, `siblings`, `kind` (LOCAL/IMPORT/MIX), KPI, libellé `KZ-000101 · 2/3`.
- Nouveau `SubOrderCard` (carte d'une sous-commande dans une liste).
- Nouveau `RelatedSubOrdersStrip` (chips de navigation vers les boutiques sœurs).
- `PipelineView` accepte `subRows` et `onSelectSubRow` : en mode sub, chaque colonne affiche 1 carte par boutique (label `KZ-XXX · i/N`, vendeur, kind, KPI scopés).
- `OrderDrawer` accepte `vendorId` + `onVendorChange` :
  - Articles, workflow, agrégat, alertes et finances pro-rata scopés à la boutique sélectionnée.
  - Header : `KZ-000101 · 2/3 — Boutique B` + badge "Sous-commande boutique".
  - `RelatedSubOrdersStrip` en haut pour naviguer vers `1/3`, `3/3` sans fermer le drawer.
  - L'ancien `SubOrdersPanel` interne n'apparaît plus quand on est scopé.
- `Dashboard` :
  - Tracks `selectedVendorId` (reset sur cancel/close).
  - `useSubOrderRows(orders)` → injecté dans `PipelineView`.
  - `onSelectSubRow` → ouvre le drawer scopé à la boutique cliquée.
  - Ancien `openOrder()` (sans scope) conservé pour les vues legacy (postes, list).

### Effets pour l'admin
- Pipeline : `KZ-000101` apparaît en 3 cartes distinctes (1 par boutique) au lieu d'une seule.
- Clic sur une carte → drawer ne contient QUE les articles/workflow de cette boutique.
- Navigation entre sœurs via chips, sans rechargement.

## Phase 3 — à venir
- Soft-delete vendeur + snapshots `vendor_name_snapshot`.
- Suppression complète du concept MIXTE (badge, filtres, `getOrderTypesBatch`, onglet "Mixte").
- Workflow 1-per-vendor également dans les vues "postes" (Confirmer, Peser, Encaisser).

## Phase 4
- Panneau rentabilité par article (coût, prix vendu, marge, commission, bénéfice).
- Frais d'expédition multi-colis flexibles.

## Risque assumé
Les vues "postes" (paiement, peser, simple station) du Dashboard restent centrées sur la commande mère (Phase 3). Le pipeline est la première vue à passer au modèle sub-order, conformément à la priorité opérationnelle exprimée.
