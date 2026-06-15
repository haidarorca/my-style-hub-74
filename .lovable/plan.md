# Architecture Kawzone — Split boutique + Responsabilités

Pas de code. Ce plan fige les **concepts**, la **matrice de responsabilité**, et la **séquence d'implémentation**. Chaque décision est justifiée par une réalité métier. Les critiques honnêtes de tes intuitions sont en fin de document.

---

## 1. Les 4 entités fondamentales

On arrête de raisonner en "commande + statuts". On raisonne en **4 objets séparés**, chacun avec une responsabilité unique :

| Entité | Rôle unique | Mutable ? |
|---|---|---|
| **mother_order** | Vue client + paiement global | Lecture seule (sauf paiement) |
| **sub_order** (par boutique) | Unité opérationnelle : stock, prépa, livraison, vendeur | Mutable avant point de non-retour |
| **article_state** | Réalité physique d'un article (en stock, rupture, partiel, livré) | Mutable — reflète le terrain |
| **ledger_entry** | Écriture comptable immuable (qui doit quoi à qui) | **JAMAIS modifié** — on ajoute des contre-écritures |

**Pourquoi 4 et pas 3 :** la séparation `article_state` vs `ledger_entry` est ce qui permet de répondre à "qui supporte le coût ?" indépendamment de "où est l'article ?". Sans cette séparation, on mélange logistique et finance — c'est le piège du modèle actuel.

---

## 2. Les 5 principes figés

### P1 — Paiement unique, imputation dérivée
- Le client paie **une fois** sur la mother_order.
- L'imputation par sub_order est **dérivée** (calcul, pas écriture).
- Un remboursement génère un `ledger_entry` négatif rattaché à la sub_order responsable.

### P2 — Jamais réécrire l'histoire (logique comptable)
- Avant point de non-retour (PNR) : édition directe de la sub_order.
- Après PNR : **uniquement** des évènements compensatoires (`stock_break`, `replacement`, `refund`, `credit_note`, `goodwill`).
- Les `ledger_entry` sont append-only. Une correction = nouvelle écriture, jamais un UPDATE.

### P3 — Matrice de responsabilité explicite (voir §4)
Chaque scénario métier a une ligne dans la matrice qui répond à 4 questions :
qui paie, qui perd, qui est responsable, qui décide.

### P4 — Cockpit = vue d'action, pas vue de statut
Le Cockpit n'affiche pas "Statut: preparing". Il affiche :
- **Ce qui m'attend** (décision admin requise)
- **Ce qui attend le client** (paiement, validation rupture)
- **Ce qui attend un vendeur** (préparation, confirmation stock)
- **Ce qui peut partir aujourd'hui** (prêt + payé)
- **Ce qui est en souffrance** (> seuil SLA)

### P5 — Extensibilité par composition
Litiges, garanties, avances vendeurs → tous se modélisent comme **nouveaux types de `ledger_entry`** + **nouveaux types d'évènements compensatoires**. Le schéma de base ne bouge pas.

---

## 3. Points de non-retour (PNR) — par sub_order

Une sub_order devient immutable sur certains aspects dès qu'elle franchit un de ces seuils. Les PNR sont **indépendants par sub_order** (c'est tout l'intérêt du split).

| PNR | Ce qui devient immutable | Ce qui reste mutable |
|---|---|---|
| Préparation lancée | Composition d'articles | Adresse, instructions |
| Expédition | Quantités, articles | Adresse de livraison (si transporteur le permet) |
| Livraison | Tout sauf retours | Déclencher un retour/avoir |
| Règlement vendeur | Commission, montant vendeur | Litige (= nouvelle écriture) |
| Clôture comptable (mensuelle) | Tout | Avoir sur période suivante |

**Règle de vérification :** avant toute mutation, le système check `is_mutable(sub_order, field)`. Si non → forcer le passage par un évènement compensatoire.

---

## 4. Matrice de responsabilité financière

Cette matrice est aussi importante que le schéma DB. Format : **Scénario → Qui paie / Qui perd / Responsable / Décideur**.

| # | Scénario | Qui paie le coût | Qui perd la marge | Responsable | Décideur |
|---|---|---|---|---|---|
| 1 | Rupture vendeur (article promis, jamais en stock) | Vendeur (pénalité) ou Kawzone (geste) | Vendeur | Vendeur | Admin |
| 2 | Rupture fournisseur (import non arrivé) | Kawzone | Kawzone | Fournisseur | Admin |
| 3 | Annulation client avant prépa | Personne | Personne | Client | Client (auto) |
| 4 | Annulation client après prépa | Client (frais de prépa) ou Kawzone (geste) | Vendeur (partiel) | Client | Admin |
| 5 | Annulation client après expédition | Client (fret + restocking) | Vendeur (si retour endommagé) | Client | Admin |
| 6 | Retour client (défaut produit) | Vendeur | Vendeur | Vendeur | Admin |
| 7 | Retour client (changement d'avis) | Client (fret retour) | Personne | Client | Admin |
| 8 | Remplacement inter-boutiques (B→A pour livraison consolidée) | Kawzone (transfert interne) | Boutique B (vente perdue compensée) | Kawzone | Admin |
| 9 | Geste commercial | Kawzone | Kawzone | Admin | Admin |
| 10 | Erreur logistique (mauvais colis) | Kawzone | Kawzone | Kawzone | Admin |
| 11 | Erreur de stock (vendeur dit "ok" puis rupture) | Vendeur | Vendeur | Vendeur | Admin |
| 12 | Article cassé en transit | Transporteur ou Kawzone (assurance) | Selon assurance | Transporteur | Admin |
| 13 | Client absent à la livraison | Client (frais relivraison) | Personne | Client | Admin |
| 14 | Promo cross-boutique (réduction globale) | Kawzone | Réparti au prorata | Kawzone | Système |
| 15 | Litige paiement (chargeback) | Vendeur si fraude prouvée, sinon Kawzone | — | Banque | Admin |

**Lecture :** chaque ligne génère un `ledger_entry` au moment où le scénario se produit. Le montant et le débiteur sont déterminés par la matrice, pas par un humain.

---

## 5. Structure des évènements compensatoires

Tout évènement post-PNR a la même forme :

```text
event {
  id, timestamp, sub_order_id, article_id (optional)
  type: stock_break | replacement | refund | credit_note | goodwill | return | dispute
  triggered_by: customer | vendor | admin | system
  matrix_row: # (référence ligne matrice §4)
  ledger_entries: [ {debtor, creditor, amount, reason} ]
  visible_to_customer: bool
}
```

**Conséquence :** l'historique d'audit n'est plus une timeline de statuts, c'est une **timeline d'évènements** avec leur impact financier. On peut reconstruire l'état à n'importe quel instant T.

---

## 6. Cockpit — réorganisation par "ce qui attend"

Remplacer les colonnes par statut par des **buckets d'action** :

```text
┌─────────────────────────────────────────────────────┐
│  M'ATTEND (décision admin)              [12]        │
│  → ruptures non résolues, override décisions       │
├─────────────────────────────────────────────────────┤
│  ATTEND LE CLIENT                       [8]         │
│  → paiement, validation remplacement                │
├─────────────────────────────────────────────────────┤
│  ATTEND UN VENDEUR                      [5]         │
│  → confirmation stock, préparation                  │
├─────────────────────────────────────────────────────┤
│  PEUT PARTIR AUJOURD'HUI                [3]         │
│  → prêt + payé + transporteur dispo                 │
├─────────────────────────────────────────────────────┤
│  EN SOUFFRANCE (> SLA)                  [2]         │
│  → bloqué depuis > 7j                               │
└─────────────────────────────────────────────────────┘
```

Chaque carte montre : **qui** attend, **depuis quand**, **impact €**, **prochaine action obligatoire** (1 bouton).

---

## 7. Séquence d'implémentation (phases)

Ordre choisi pour **minimiser le risque** : on commence par ce qui ne casse rien (vue dérivée), on migre la donnée seulement quand les concepts sont validés en vrai.

### Phase 0 — Geler les concepts (en cours)
- Valider la matrice §4 ligne par ligne avec toi.
- Trancher les 3 questions ouvertes (cf §9).

### Phase 1 — Vue dérivée sub_orders (zéro SQL)
- Aggregator front qui groupe `metadata.articles` par `vendor_id`.
- Affichage Cockpit en buckets d'action (§6).
- Aucune migration. Permet de valider l'UX sur des cas réels.

### Phase 2 — Table `ledger_entries` (append-only)
- Migration : créer la table, alimentée par tous les évènements existants (paiement, remboursement, rupture).
- Pas encore de sub_orders en DB — `ledger_entry.sub_order_ref` = dérivé.

### Phase 3 — Table `sub_orders` matérialisée
- Migration : créer la table, backfill depuis les commandes existantes.
- Bascule progressive : lectures depuis sub_orders, écritures dual (mother + sub).

### Phase 4 — Évènements compensatoires unifiés
- Table `order_events` qui remplace `stock_breaks` + `audit_logs` + `refund_requests`.
- Tout post-PNR passe par là.

### Phase 5 — Extensions (litiges, garanties, avances)
- Nouveaux `event.type`, nouvelles lignes de matrice. **Zéro changement de schéma.**

---

## 8. Critiques honnêtes de tes intuitions

Tu m'as demandé d'être franc. Voici 4 points où je pense que ton intuition a une faille ou un risque :

### C1 — "Le client paie une fois" : vrai à 90%, faux dans 1 cas
Si tu fais du **paiement échelonné par boutique** (cas D), le client peut vouloir payer la boutique A maintenant et la boutique B dans 2 semaines. Décision à figer : soit tu interdis ça (paiement = mother only), soit tu acceptes des paiements par sub_order. **Recommandation : paiement mother uniquement, échéances = dérivées.** Sinon la trésorerie devient ingérable.

### C2 — "Sous-commande mutable" : danger sur les commissions
Si une sub_order est mutable et que la commission est calculée à la création, ajouter un article change la commission rétroactivement. **Recommandation : geler la commission au moment du règlement vendeur (PNR §3), pas avant.** Tant que pas réglé, recalcul libre.

### C3 — "Split par boutique" est bon, mais pas universel
Pour un **multi-shop vendor** (un vendeur avec 3 boutiques), splitter en 3 sub_orders crée 3 commissions, 3 règlements, 3 livraisons potentielles — alors que le vendeur voit 1 seule opération. **Recommandation : split par `vendor_id`, pas par `shop_id`.** La boutique devient un attribut d'affichage, pas l'unité de split. Sinon tu vas créer de la friction pour rien.

### C4 — La matrice de responsabilité va évoluer
La matrice §4 a 15 lignes aujourd'hui. Dans 1 an elle en aura 40. **Recommandation : stocker la matrice en DB (table `responsibility_rules`), pas en code.** Un admin peut ajuster une règle sans redéploiement. Indispensable quand tu négocieras des contrats vendeurs différenciés.

---

## 9. Décisions à trancher avant Phase 1

3 questions où j'ai besoin de ton arbitrage explicite :

1. **Paiement** : mother uniquement (recommandé) ou autorisé par sub_order ?
2. **Unité de split** : `vendor_id` (recommandé) ou `shop_id` strict ?
3. **Matrice** : codée en dur (rapide) ou stockée en DB (recommandé, extensible) ?

Réponds sur ces 3 points et je rédige le plan technique Phase 1 + 2 prêt à exécuter.

---

## 10. Phase 1.5 — Suppression MIXTE + sub_order = unité principale (FAIT)

Arbitrages utilisateur :
- Multi-boutiques : 1 commande client → N sub_orders indépendantes.
- "MIXTE" supprimé du Cockpit (badges, workflow, accordéon double).
- Libellé "KZ-XXXXXX · i/N" pour chaque sub_order.
- Si boutique supprimée (`vendor_id = unknown`) : badge "Boutique supprimée" + historique conservé.
- Frais multi-expéditions : politique non figée (Phase 3).
- UX client : inchangée (1 commande visible).

Changements appliqués :
- `lib/orderNumbers.ts` : `formatSubOrderLabel(orderId, i, n)` → "KZ-… · i/n".
- `lib/sub-orders.ts` : retiré `is_mixed`, ajouté `kind` ("local"/"import"/"local_and_import"), `index`, `total`, `label`. Tri inchangé (bloquants → règlements → ready → reste).
- `components/SubOrdersPanel.tsx` : libellé i/N, badge "Boutique supprimée", prop `alwaysShow` (panel rendu même pour 1 sub_order quand demandé).
- `components/OrderDrawer.tsx` : retiré badge MIXTE + `isMixte`. Badge "Multi-boutiques" dynamique. `WorkflowControlPanel` masqué si multi-boutiques (sera remplacé par 1 panel par sub_order en Phase 2).
- `components/WorkflowControlPanel.tsx` : retiré prop `isMixte` + branche double accordéon.
- `components/OrderCard.tsx` : retiré badge MIXTE, ajouté badge dynamique "N boutiques".
- `components/ArticlesPanel.tsx` : retiré badge MIXTE de l'en-tête + import `getOrderMixType`.

Briques MIXTE restantes (à nettoyer dans des passes ciblées, pas bloquantes) :
- `Dashboard.tsx` onglet "mixte" (sera remplacé par buckets d'actions Phase 4).
- `routes/admin.logistics.tsx`, `admin.orders.tsx`, `admin.index.tsx` (badges MIXTE legacy).
- `WorkflowFilterPanel.tsx`, `use-workflow-filters.ts` (filtre "mixed").
- `cockpit-payments.functions.ts` (`getOrderTypesBatch` → renommer en `getOrderSubOrdersBatch` Phase 2).
- `MiniTimeline.tsx` (`WORKFLOW_MIXED` non utilisé en pratique).
- `article-states.ts` (`getOrderMixType` plus appelé dans le Cockpit — peut être supprimé en sécurité).
- Types `OrderType = "mixed"` dans `admin1/types`, `admin-logistics.functions`, `types/workflow`.

## 11. Phase 2 — Sub_order pilote son propre workflow (à venir)

Objectif : quand `isMultiVendor`, le drawer affiche 1 `WorkflowControlPanel` par sub_order (avec son statut, son type, son next_step). Implique :
- Étendre `DerivedSubOrder` avec `status` propre (initialement = statut de la mère).
- Découpler les actions `onStatusChange` au niveau sub_order (handlers contextuels).
- Préparer la migration `sub_orders` DB (Phase 3) pour que ce statut devienne persistant.
