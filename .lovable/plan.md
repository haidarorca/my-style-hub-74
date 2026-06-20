
## Analyse — Page actuelle vs maquette

Page `/admin/commandes` (état actuel)
- Filtres : recherche, pays (texte), type, circuit, onglets de statut.
- Affichage : KZ, client, pays texte, sous-commandes (avec `step/total` par sous-commande), paiement, statut global, barre de progression `done/total` (livrées), dernière activité.
- Au clic : rien. Pas de drawer.

Manques par rapport à la maquette
1. **Filtre par dates** : aucun sélecteur de période (Aujourd'hui / Hier / Cette semaine / Ce mois / Ce trimestre / Personnalisé + calendrier début/fin).
2. **Drapeaux pays** : remplacés par `🏳️`. Aucun mapping pays → drapeau.
3. **Ouverture en fenêtre** : aucun drawer. Pour gérer une commande, il faut aller dans le Cockpit.
4. **Progressions** : la barre globale `done/total` est correcte par spec (sous-commandes 100% terminées) — à conserver. La progression individuelle `step/total` redéfinit `FLOW_STEPS` localement au lieu de réutiliser `IMPORT_STEPS` / `getImportStepIndex` du Cockpit → risque de divergence.

## Architecture proposée — zéro duplication

Le `OrderDrawer` du Cockpit est piloté par ~15 props (paiements, audit, weighings, articles, handlers de mutation, assessment, history, etc.) que le `Dashboard` calcule via `useRealOrders`, `useArticleStates`, `useSubAssessments`, `useSubOrderHistories`. Copier ce wiring dans `admin.commandes.tsx` = duplication massive.

Solution : **extraire le wiring du drawer dans un composant partagé** `<CockpitOrderDrawerHost>` qui :
- prend en entrée : `selectedOrder`, `selectedSubKey`, `onClose`, plus les ressources déjà calculées par le parent (`orders`, hooks `useRealOrders`), 
- gère en interne tous les handlers (status, paiement, weighing, articles, settlement, restock, cancel, items panel),
- monte les dialogs internes (`CancelDialog`, `CloseConfirmDialog`, `OrderItemsPanel`),
- est consommé à la fois par `Dashboard.tsx` (Cockpit) et par `admin.commandes.tsx`.

Résultat : **une seule source de vérité** pour l'ouverture/édition d'une sous-commande. Toute évolution du workflow se propage aux deux écrans.

## Changements

### 1. Nouveau composant partagé
`src/cockpit/components/CockpitOrderDrawerHost.tsx`
- Props : `{ selectedOrder, selectedSubKey, onSubOrderChange, onClose, orders, realOrders, adminName }` (où `realOrders` = l'instance déjà créée de `useRealOrders` par le parent).
- Encapsule : `useArticleStates`, `useSubAssessments` (scope = un id), `useSubOrderHistories` (scope = un id), tous les handlers, `<OrderDrawer>` et les 3 dialogs.
- Code déplacé depuis `Dashboard.tsx` (≈140 lignes).

### 2. `Dashboard.tsx` (Cockpit)
- Supprime tout le wiring drawer/articles/assessment/dialogs/handlers déplacés.
- Conserve la sélection et délègue à `<CockpitOrderDrawerHost>`.
- Aucune régression fonctionnelle.

### 3. `admin.commandes.tsx`
- **Filtres dates** : nouveau composant `DateRangePicker` avec presets (Aujourd'hui, Hier, Cette semaine, Ce mois, Ce trimestre, Personnalisé) + calendriers `Calendar` shadcn pour début/fin. Filtre appliqué sur `order.order_created_at`.
- **Drapeaux pays** : helper `countryFlag(code)` mappant `country_code` → emoji drapeau (utiliser `destination_country_id` ou un mapping ISO). Pour les codes inconnus → `🏳️`.
- **Clic ligne/carte** : ouvre un état local `selectedOrder` + `selectedSubKey`.
- **Drawer** : monte `<CockpitOrderDrawerHost>` avec la même instance `useRealOrders()` déjà présente sur la page.
- **Sous-commandes en boutons** : la `RelatedSubOrdersStrip` est déjà rendue par `OrderDrawer` quand on est scopé, donc dès qu'on ouvre depuis le bouton "1/3" on a la navigation cross-sous-commandes. Au clic initial sur une ligne sans sous-commande choisie, on sélectionne automatiquement la première (`subs[0].sub_order_key`).
- **Progression individuelle** : remplacer `FLOW_STEPS` local par `getImportStepIndex` / `IMPORT_STEPS` du Cockpit (`src/cockpit/lib/workflow.ts`) pour les circuits IMPORT, et garder une liste explicite uniquement pour LOCAL (déjà alignée). Tooltip listant les étapes restantes.

### 4. Hooks partagés (sans modification de logique)
- `useArticleStates(orderId, status)` et `useSubAssessments([orderId])` fonctionnent déjà sur un id unique → réutilisables directement depuis le host.
- `useSubOrderHistories([orderId])` idem.

## Données techniques

- Le filtre date opère côté client sur `order_created_at` (déjà dans `LogisticsOrderRow`).
- Mapping drapeaux : préférer un helper dérivé du code ISO 2-lettres (`destination_country_code` si disponible, sinon fallback sur le nom). Si la donnée manque, ajouter une lecture rapide depuis `useRealOrders` ou un fallback texte.
- Aucune migration DB. Aucun changement de workflow, de calcul de fret, ou de logique de sous-commande.

## Hors-scope (explicitement)
- Aucune modification de `WorkflowControlPanel`, `useSubOrderRows`, `sub-orders.ts`, `workflow.ts`, hooks Cockpit.
- Aucune nouvelle route. La page `/admin/commandes` reste la cible.
- Aucun changement de la règle "TERMINÉE" (déjà : toutes livrées ET reste = 0).
