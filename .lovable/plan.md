## Vision

L'article devient l'unité métier centrale du Cockpit. La commande n'est qu'un conteneur. Chaque article a son cycle de vie, son type (LOCAL ou IMPORT), son responsable (vendeur ou fournisseur), ses verrous, ses décisions et son impact financier — affichés et actionnables directement dans sa ligne, sans changer d'écran.

Aucune migration ni nouvelle colonne. Tout est dérivé du JSON existant (`metadata.articles`, `stock_break`, `stock_break.settlement`, `payments`).

---

## 1. Séparation stricte LOCAL / IMPORT (fondation)

Aujourd'hui, `ArticleStatus` mélange les deux flux. Je sépare en deux machines d'état distinctes, dérivées du même champ `status` mais interprétées selon `is_import`.

```text
LOCAL:   pending → available → preparing → ready → delivered
IMPORT:  pending → supplier_ordered → received_warehouse → weighing
                 → fees_calculated → ready → delivered
```

Fichier `src/cockpit/lib/article-states.ts` :
- Ajout `LOCAL_FLOW` / `IMPORT_FLOW` (tableaux ordonnés).
- Helpers `getArticleFlow(article)`, `getNextArticleStep(article)`, `getAllowedArticleActions(article, orderStatus, role)`.
- Les actions retournées dépendent strictement de `is_import` : un LOCAL ne verra jamais "commander fournisseur" / "pesée" / "réception entrepôt" ; un IMPORT ne verra jamais "lancer préparation locale".

Les statuts existants (`ordered`, `received`, `shipped`) restent en DB mais sont labellisés différemment selon le flux (ex : `ready` LOCAL = "Prêt vendeur", `ready` IMPORT = "Prêt livraison").

## 2. Rupture comme vrai processus métier (verrou exclusif)

Aujourd'hui une rupture coexiste avec les actions normales. Nouveau comportement :

- Dès `stock_break` posé et non résolu : toutes les actions normales (avancer statut, livrer, etc.) disparaissent. Seules options : `Résoudre la rupture` ou `Annuler la rupture` (Super Admin uniquement).
- Une fois résolue : l'article entre dans un état terminal métier (`refunded`, `excluded_from_shipment`, `waiting_restock`, `replaced`) qui verrouille toute régression.
- Garanties dans `canChangeArticleStatus` / `canPartialDeliver` / `canSignalBreak` : un article résolu ne peut plus redevenir `available` / `ready` / `delivered` sans override Super Admin tracé.

Nouvelle fonction `getArticleBusinessState(article)` qui retourne l'état métier réel :
`active | waiting_restock | excluded | refunded | credited | replaced | delivered`.
C'est ce que l'UI affiche, pas le `status` brut.

## 3. Les 5 décisions de rupture — chacune un vrai métier

| Décision     | État article            | Pending financier            | Reprise workflow possible |
|--------------|-------------------------|------------------------------|---------------------------|
| refund       | refunded                | refund_pending               | non                       |
| credit       | credited (trace admin)  | credit_pending               | non                       |
| partial_ship | excluded_from_shipment  | aucun                        | non (verrouillé)          |
| wait_restock | waiting_restock         | aucun                        | oui (retour flux normal)  |
| replace      | replaced + sous-flux    | extra_payment / refund / credit pending selon delta | oui (nouvel article suit le flux) |

Le `replace` reste un mini-workflow : choix produit + prix → calcul automatique du delta → choix admin pour différence → pending financier dérivé. (Déjà partiellement implémenté, à durcir : empêcher toute action normale tant que le replace n'est pas confirmé.)

`wait_restock` : nouveau bloc dédié dans la ligne article — bouton "Stock revenu → reprendre" qui remet l'article dans son flux d'origine (`available` LOCAL ou `received_warehouse` IMPORT), avec trace d'audit. Sans ce bouton, l'article reste figé en attente.

## 4. Livraison partielle comme état officiel de commande

Aujourd'hui dérivée mais peu visible. Refonte :

- Bandeau `PartialDeliveryBanner` enrichi en tête de drawer (déjà présent — à étoffer) :
  - X livrés / Y restants / Z en réappro / W exclus / V à remplacer
  - Bouton "Préparer expédition partielle" si au moins un article `ready` et au moins un bloqué.
- Le statut commande affiche `partial_delivery_in_progress` (dérivé, non persisté) tant que des articles restent à traiter après une expédition partielle.
- `canMarkDelivered` (commande) ne passe à `delivered` final que si TOUS les articles sont en état terminal cohérent (delivered, refunded, credited, excluded, replaced+delivered) ET aucun pending financier.

## 5. Finances : séparation Produits / Fret

Nouveau composant `FinanceSummaryCard` (remplace l'affichage actuel fusionné dans `OrderDrawer`) :

```text
PRODUITS
  Total      : 45 000
  Payé       : 30 000
  Reste      : 15 000

FRET (IMPORT uniquement)
  Estimé     : 8 000
  Final      : 9 200
  Payé       : 0
  Reste      : 9 200

EN ATTENTE DE TRAITEMENT
  Remboursements : 5 000 (1 article)
  Avoirs         : 2 000 (1 article)
  Compléments    : 1 500 (1 article)
```

Dérivé de `payments` (filtré par `metadata.kind === "freight"` vs reste) + `getPendingFinancialActions`. Aucune nouvelle table. Si la distinction freight/produit n'existe pas encore dans payments, on l'infère depuis le contexte de saisie (champ `kind` ajouté à `PaymentRecord` côté front uniquement, persisté dans metadata du payment).

## 6. Verrous et overrides Super Admin

- `canChangeArticleStatus`, `canPartialDeliver`, `canSignalBreak` durcis selon la table de la section 3.
- Tout override passe par `DecisionOverrideDialog` (déjà créé) avec motif obligatoire, ancien état → nouvel état, écrit dans `stock_break.override_history`.
- Nouveau : override d'un état terminal article (refunded → active, excluded → active, etc.) avec même dialog, écrit dans `article.status_history` enrichi (`{from, to, by, at, reason}`).

## 7. Audit unifié exploitable

`OrderAuditTimeline` (déjà créé) étendu :
- Filtres par catégorie : Statut / Paiement / Rupture / Override / Livraison.
- Chaque ligne affiche `qui / quand / quoi / pourquoi` (motif obligatoire pour override et annulation).
- Export texte simple (copier dans presse-papier) pour reporting.

## 8. UX article-centric dans `ArticlesPanel`

Refonte de la ligne article pour que TOUT soit visible sans ouvrir d'écran :

```text
┌─────────────────────────────────────────────────┐
│ [img] Nom produit · variant            15 000 F │
│       🏪 Vendeur · LOCAL  |  ✈ Fournisseur · IMPORT │
│       État métier : [badge contextuel]          │
│       Prochaine action : [chip]   [↳ Agir]      │
│       Impact financier : +1 500 à encaisser     │
│       ─ verrou : 🔒 décision validée            │
└─────────────────────────────────────────────────┘
```

- Badge décision DANS la ligne (déjà fait — statique, à conserver).
- Bouton "Agir" unique qui ouvre le bon flow (avancer statut, résoudre rupture, traiter pending, reprendre après restock) selon `getAllowedArticleActions`.
- Pas de boutons multiples confus : un seul appel à l'action contextuelle.

## 9. Mobile-first

- Toutes les listes < 80% de la hauteur viewport, scroll interne.
- Boutons d'action toujours visibles en bas (sticky footer) du drawer, pas hors écran.
- Timeline d'audit collapsible (collapsed par défaut).
- Accordéons LOCAL / IMPORT déjà mémorisés en localStorage (à conserver).
- Tester chaque écran à 384px de large (viewport actuel de l'utilisateur).

---

## Fichiers touchés (aucune migration)

```text
src/cockpit/lib/article-states.ts        ← flows LOCAL/IMPORT, business state, verrous durcis
src/cockpit/lib/workflow.ts              ← canMarkDelivered durci (état terminal cohérent)
src/cockpit/components/ArticlesPanel.tsx ← ligne article-centric, bouton "Agir" unique
src/cockpit/components/StockBreakDialog.tsx  ← verrou exclusif post-rupture
src/cockpit/components/OrderDrawer.tsx   ← intègre FinanceSummaryCard + PartialDeliveryBanner étoffé
src/cockpit/components/PartialDeliveryBanner.tsx  ← compteurs enrichis (excluded, replaced, restock)
src/cockpit/components/PendingFinancialActions.tsx  ← déjà OK, juste relié
src/cockpit/components/OrderAuditTimeline.tsx  ← filtres par catégorie
src/cockpit/components/FinanceSummaryCard.tsx  ← NOUVEAU (Produits / Fret / Pending)
src/cockpit/components/RestockResumeButton.tsx ← NOUVEAU (wait_restock → reprise)
src/cockpit/components/DecisionOverrideDialog.tsx  ← étendu aux états terminaux article
```

## Hors-scope (à valider plus tard)

- Persistance long terme `freight` vs `product` payment kind si pas dans metadata actuelle → on infère depuis le contexte d'abord.
- Portefeuille / solde client réutilisable pour `credit` → reste une trace admin pure (déjà validé v3).
- Notifications vendeur / fournisseur automatisées sur changement d'état article.

---

## Ordre d'implémentation proposé

1. Fondation article-states (flows LOCAL/IMPORT, business state, verrous durcis) — fichier `article-states.ts`.
2. Refonte `ArticlesPanel` ligne article-centric + bouton "Agir" unique.
3. `FinanceSummaryCard` + intégration dans `OrderDrawer`.
4. `PartialDeliveryBanner` étoffé.
5. `RestockResumeButton` + flow reprise wait_restock.
6. `DecisionOverrideDialog` étendu + audit enrichi.
7. Pass mobile (384px) sur tous les écrans touchés.

Chaque étape laisse le Cockpit utilisable (pas de big-bang).

---

Valides-tu ce plan global avant que je commence l'étape 1 (fondation `article-states.ts`) ?
