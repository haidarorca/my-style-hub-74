# Audit & plan de nettoyage de l'espace Administration

Objectif : faire du **Cockpit** l'unique centre opérationnel, sans perte de logique métier.

---

## 1. Découverte importante (à valider avant toute suppression)

Deux des modules listés sont **des zones internes du Cockpit lui-même**, accessibles via les onglets de `CockpitShell` (`Cockpit ▸ SAV ▸ Finance ▸ Archive ▸ Clôture du jour`) :

- **Centre Financier** = `/admin/cockpit/finance` → page `FinanceCenter.tsx`
- **Archive Cockpit** = `/admin/cockpit/archive` → page `ArchiveCenter.tsx`

Les supprimer signifie **retirer ces deux onglets du Cockpit**. La page **Clôture du jour** (`DailyClose`) contient 3 liens "Voir détails" qui pointent vers `/admin/cockpit/finance` — ces liens seront aussi à neutraliser.

⚠️ **Question à confirmer avant action** : veux-tu vraiment retirer ces deux zones du Cockpit, ou simplement supprimer leurs **doublons dans le menu latéral admin** (lignes 74-75 de `admin.tsx`) en laissant les onglets dans le Cockpit ? Mon plan ci-dessous **les retire complètement** comme demandé.

---

## 2. Audit module par module

### A. Expéditions Chine — `/admin/shipments`
- **Contenu** : tableau des évaluations d'expédition (poids, prix transport, validation admin), envoi WhatsApp client.
- **Déjà couvert par le Cockpit** : toute la logique d'évaluation est intégrée dans le drawer Cockpit via `ShipmentAssessmentDialog` + `shipment-assessments.functions.ts`.
- **À migrer** : rien. La lib `shipment-assessments.functions.ts` est déjà partagée et **reste**.
- **À supprimer** : route + page UI uniquement.

### B. Cmd Commission — `/admin/commission-orders`
- **Contenu** : liste filtrée des commandes "commission", WhatsApp vendeur, archivage manuel.
- **Déjà couvert** : le Cockpit affiche toutes les commandes (commission incluses) avec le même drawer. L'archivage est géré par les statuts terminaux + zone Archive.
- **À migrer** : rien d'unique (les utilitaires `whatsapp.ts`, `admin-archive.functions`, `shipment-assessments` sont partagés et restent).
- **À supprimer** : route + page UI uniquement.

### C. Archive Cockpit — `/admin/cockpit/archive`
- **Contenu** : liste lecture seule des sous-commandes terminales sans engagement financier (vue `v_sub_order_accounting`).
- **Déjà couvert** : le filtre "statut terminal" existe dans Cockpit principal et la Clôture du jour donne la même info agrégée.
- **À migrer** : rien (vue SQL conservée, elle est utilisée par Finance/Daily).
- **À supprimer** : route, page `ArchiveCenter.tsx`, fonction `src/lib/archive.functions.ts` (utilisée uniquement ici + une référence morte dans commission-orders qui part avec).
- **Effet UI** : onglet "Archive" retiré de `CockpitShell`, tuile "Archivé 7j" retirée du pulse.

### D. Centre Financier — `/admin/cockpit/finance`
- **Contenu** : KPIs financiers, dettes commissions, remboursements en attente, paiement bulk commissions.
- **Logique unique à préserver** : `markCommissionPaid` / `payAllOutstandingForVendor` (`commission-payments.functions.ts`).
- **À migrer** : intégrer un panneau "Engagements financiers" + bouton paiement commission **dans le drawer Cockpit** (par sous-commande) — ou conserver ces fonctions serveur invoquées depuis le drawer existant. Les fonctions serveur restent ; seule l'UI dédiée disparaît.
- **À supprimer** : route, page `FinanceCenter.tsx`, liens depuis `DailyClose` (les 3 boutons "Voir détails" deviennent statiques ou pointent vers le Cockpit principal), onglet "Finance" + tuiles "Engagements" / "Net du jour" liées dans `CockpitShell`.

### E. Workflow Center — `/admin/workflow-center` (BETA)
- **Contenu** : vue "actions à faire aujourd'hui" basée sur `useWorkflowOrders` / `useWorkflowFilters` / `WorkflowTable` / `WorkflowDrawer` / `WorkflowFilterPanel`.
- **Déjà couvert** : Cockpit a sa propre vue Pipeline + filtres + drawer plus complet.
- **À migrer** : rien (le concept "actions du jour" est déjà couvert par `NextActionBanner` + `PendingFinancialActions` + Daily Close).
- **À supprimer** : route, page, hooks `use-workflow-orders.ts` / `use-workflow-filters.ts` / `use-workflow-actions.ts`, dossier `src/components/workflow/`, type `src/types/workflow.ts`.

### F. Logistique ERP — `/admin/logistics`
- **Contenu** : ancien ERP logistique complet (filtres Excel-like, pesée, paiement transport, notifications client, retours).
- **Logique métier critique** : toute la lib `admin-logistics.functions.ts` (1331 lignes) — **ELLE EST UTILISÉE PARTOUT DANS LE COCKPIT** (`useRealOrders`, `useSubOrderRows`, `OrderDrawer`, `Dashboard`, `Timeline`, `PipelineView`, `OrderCard`, `CockpitOrderDrawerHost`, `OrderAuditTimeline`, `useOrderAggregatesBatch`, `WeightAnomalyPanel`).
- **À migrer** : rien — la lib **reste intacte**. Le Cockpit est déjà l'évolution moderne de cette page.
- **À supprimer** : route `admin.logistics.tsx` + page UI uniquement. La lib `admin-logistics.functions.ts` est **conservée**.

### G. Commandes (Legacy) — `/admin/orders`
- **Contenu** : Order Hub legacy (fusion ancienne de orders + logistics + shipments + commission), utilise `admin-orders.functions` + `admin-logistics.functions`.
- **Déjà couvert** : `/admin/commandes` (vue mère) + Cockpit (drawer sous-commande).
- **À migrer** : rien.
- **À supprimer** : route + page UI uniquement. La lib `admin-orders.functions.ts` est gardée si utilisée ailleurs (à vérifier au moment du retrait — sinon supprimée aussi).

### Bonus détecté — `/admin/admin1`
Pointe vers `Admin1WorkflowCenter` (alias du Workflow Center). Aucun lien dans le menu. **À supprimer** avec le module Workflow Center (route + dossier `src/admin1/`).

---

## 3. Tableau de synthèse

| Module | Route à supprimer | Fichiers UI à supprimer | Logique métier à migrer | Lib serveur conservée |
|---|---|---|---|---|
| Expéditions Chine | `admin.shipments.tsx` | la route | — | `shipment-assessments.functions.ts` |
| Cmd Commission | `admin.commission-orders.tsx` | la route | — | `admin-archive.functions.ts` |
| Archive Cockpit | `admin.cockpit.archive.tsx` | `cockpit/pages/ArchiveCenter.tsx`, `lib/archive.functions.ts` | — | vue SQL `v_sub_order_accounting` |
| Centre Financier | `admin.cockpit.finance.tsx` | `cockpit/pages/FinanceCenter.tsx` | Boutons "Payer commission" à brancher dans le drawer Cockpit | `commission-payments.functions.ts` |
| Workflow Center | `admin.workflow-center.tsx`, `admin.admin1.tsx` | page + `components/workflow/`, hooks `use-workflow-*`, `types/workflow.ts`, dossier `src/admin1/` | — | — |
| Logistique ERP | `admin.logistics.tsx` | la route uniquement | — | `admin-logistics.functions.ts` (CONSERVÉ — utilisé par Cockpit) |
| Commandes Legacy | `admin.orders.tsx` | la route uniquement | — | `admin-orders.functions.ts` (à vérifier au moment du retrait) |

**Aucune fonction métier unique n'est perdue.** Seule la fonction `listArchive` (lib `archive.functions.ts`) disparaît, car elle ne sert qu'à la page Archive.

---

## 4. Plan d'exécution (ordre proposé)

1. **Migration préalable** : ajouter un petit bouton "Payer commission" dans le drawer Cockpit (`OrderDrawer` → section financière) qui appelle `markCommissionPaid`. Conserver `commission-payments.functions.ts`.
2. **Nettoyer les références entrantes** :
   - `src/routes/admin.tsx` : retirer les 7 lignes du menu latéral (67, 68, 69, 70, 74, 75, 76, 77).
   - `src/cockpit/components/CockpitShell.tsx` : retirer les onglets "Finance" et "Archive", retirer les tuiles Pulse correspondantes ou les rendre non-cliquables vers `/admin/cockpit`.
   - `src/cockpit/pages/DailyClose.tsx` : neutraliser les 3 liens vers `/admin/cockpit/finance` (les retirer ou pointer vers `/admin/cockpit`).
3. **Supprimer les routes & pages** :
   - `src/routes/admin.shipments.tsx`
   - `src/routes/admin.commission-orders.tsx`
   - `src/routes/admin.cockpit.archive.tsx` + `src/cockpit/pages/ArchiveCenter.tsx` + `src/lib/archive.functions.ts`
   - `src/routes/admin.cockpit.finance.tsx` + `src/cockpit/pages/FinanceCenter.tsx`
   - `src/routes/admin.workflow-center.tsx` + `src/components/workflow/` + `src/hooks/use-workflow-*` + `src/types/workflow.ts`
   - `src/routes/admin.admin1.tsx` + `src/admin1/`
   - `src/routes/admin.logistics.tsx` (la lib reste)
   - `src/routes/admin.orders.tsx` (puis vérifier si `admin-orders.functions.ts` peut partir)
4. **Vérifications** : `tsgo` (typecheck) + relecture des imports orphelins + test navigation (menu admin + onglets Cockpit + Daily Close).

---

## 5. Validation demandée

Avant d'exécuter, merci de me confirmer :

- **a)** OK pour retirer **complètement** les zones Finance et Archive du Cockpit (pas seulement les doublons du menu) ?
- **b)** OK pour migrer le bouton "Payer commission" dans le drawer Cockpit (étape 1) ?
- **c)** OK pour supprimer aussi `/admin/admin1` (alias du Workflow Center, non listé mais identique) ?

Dès que tu confirmes, je procède dans l'ordre du §4 avec un typecheck à chaque étape.
