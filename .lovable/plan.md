# Architecture cible Kawzone — Split par boutique + Engagements ouverts

> Document de référence. Toute décision de code future doit être compatible avec cette architecture.
> Validé après analyse des cas A (livraison consolidée), B (container import), D (paiement échelonné), E (remplacement cross-boutique), G (stock partagé), H (modification post-commande), L (décisions mère vs filles).

---

## Vision

Une **commande client** est un agrégat. Les **opérations** se passent au niveau de **sous-commandes par boutique**. Les **imports** sont regroupés dans des **containers** parallèles. Tout engagement non clos (financier, logistique, fournisseur) est un **Commitment** dérivé, requêtable de façon symétrique pour clients et vendeurs.

---

## 3 entités de premier niveau

```text
mother_order            (1 par commande client — lieu de LECTURE et PAIEMENT)
  ├─ paiements (encaissements client, jamais ventilés en base)
  ├─ adresse de livraison
  ├─ statut consolidé (DÉRIVÉ des sub_orders)
  └─ sub_orders[]
        ├─ vendor_id / shop_id
        ├─ items[]
        ├─ statut propre (workflow indépendant)
        ├─ stock_breaks + settlements (scopés vendeur)
        ├─ commitments[] (engagements ouverts dérivés)
        └─ → peut être rattachée à un import_container

import_container         (3ᵉ entité, parallèle)
  ├─ regroupe N sub_orders d'origine import (même container Taobao)
  ├─ pesée, fret total, dédouanement, statut transit
  └─ ventile automatiquement le fret sur ses sub_orders au prorata du poids
```

---

## Règles non négociables

### Split
- **Le split est figé au checkout** (G), basé sur une `split_strategy` versionnée.
- Une `sub_order` est **mutable** tant qu'aucune action irréversible (expédition, settlement, rupture validée) n'a été posée (H).
- Le re-split d'un article entre sub_orders (cas E) est une **opération explicite et tracée**, jamais implicite.

### Paiements
- Le paiement appartient à la **commande mère** (D). Jamais ventilé physiquement.
- La quote-part par sub_order est une **vue dérivée** au prorata du total TTC.
- Un complément (ex : `replace_higher` chez B) crée un Commitment sur la sub_order B, mais s'encaisse sur la mère.

### Décisions
- La commande mère est **lecture + paiement uniquement** (L).
- Toute décision destructive (annulation, refund, résolution rupture, livraison) vit sur la sub_order.
- "Annuler la commande" au niveau mère = boucle confirmée sur chaque fille, jamais un clic magique.

### Livraison
- Frais de livraison portés par **Kawzone** par défaut (A), configurable par sub_order pour le multi-livreur futur.
- Frais remboursés au client **uniquement si la mère est annulée intégralement**.

### Imports
- Un `import_container` est une 3ᵉ entité indépendante (B).
- Plusieurs sub_orders (même de boutiques différentes) peuvent partager un container.
- Pesée → ventilation automatique du fret au prorata du poids.

---

## Commitments (engagements ouverts)

Brique transverse, **dérivée des données** au round 1. Aucun nouveau schéma SQL initial.

```text
Commitment {
  id              : déterministe (sub_order_id + product_id + kind)
  kind            : client_refund_due | client_credit_due | client_extra_payment_due
                  | restock_followup | delivery_remainder | weighing_pending
                  | vendor_payout_due | vendor_charge_due
  family          : financial | logistical | supplier
  direction       : kawzone_owes | owes_kawzone | internal
  counterparty    : { type: client | vendor | supplier | internal, id?, name? }
  amount?         : number     (si family=financial)
  reason          : phrase courte
  source          : { sub_order_id, product_id?, decision_kind, decided_at, decided_by }
  opened_at       : ISO
  due_by?         : ISO
  status          : open | in_progress | closed
  resolution?     : { kind, reference?, amount?, note? }
}
```

**Requêtes de pilotage** que cette structure rend triviales :
- "Que devons-nous aux clients ?" → `family=financial AND direction=kawzone_owes AND counterparty.type=client`
- "Que nous doivent les clients ?" → `direction=owes_kawzone AND counterparty.type=client`
- "Que doivent / leur devons-nous aux vendeurs ?" → idem avec `counterparty.type=vendor`
- "Actions logistiques ouvertes ?" → `family=logistical AND status=open`
- "Dossiers bloqués depuis longtemps ?" → tri par `opened_at` ascendant

---

## Décisions de rupture → Commitments générés (table de routage)

| Décision (sub_order) | Commitment(s) créé(s) | Ferme quand |
|---|---|---|
| Rupture → refund | `client_refund_due(montant)` | settlement posé |
| Rupture → credit | `client_credit_due(montant)` | settlement posé |
| Rupture → replace_higher | `client_extra_payment_due(delta)` | settlement posé |
| Rupture → replace_lower | `client_refund_due(delta)` | settlement posé |
| Rupture → wait_restock | `restock_followup(article)` | `resumed_at` posé |
| Rupture → partial_ship | rien (article exclu, scope fermé) | immédiat |
| Annulation sub_order avec refund | `client_refund_due(total payé sub)` | settlement posé |
| Livraison partielle | `delivery_remainder(qté)` + éventuel `client_refund_due` | livraison finale ou refund |
| Pesée import à faire | `weighing_pending(sub_order)` | pesée enregistrée |
| *(futur)* Commission vendeur due | `vendor_payout_due(montant)` | virement vendeur posé |
| *(futur)* Charge vendeur due | `vendor_charge_due(montant)` | encaissement vendeur posé |

---

## Ordre d'implémentation (chantier de fond)

### Phase 0 — Acquis
- Cockpit Next visible (`/admin/cockpit-next`) avec agrégateur, hero "À faire maintenant", Engagements financiers, deep-link.
- Bug "Modifications non enregistrées" fantôme corrigé (les 5 handlers d'article ne flippent plus `hasChanges`).

### Phase 1 — `sub_order` comme **vue dérivée front** (sans migration SQL)
- Regrouper `metadata.articles` par `vendor_id` dans l'agrégateur → exposer un tableau `sub_orders` calculé.
- Cockpit Next affiche les sub_orders dans la vue commande au lieu de l'agrégat unique.
- Workflow control par sub_order, plus par commande.
- **Permet de valider l'UX sans risque, sans toucher à la base.**

### Phase 2 — Commitments dérivés (front uniquement)
- `deriveCommitments(sub_order)` pure function.
- La section "Engagements financiers" du Cockpit Next se rebranche dessus.
- Sections "Suivi opérationnel" et "Attente externe" alimentées par le même flux.
- **Aucune nouvelle table.**

### Phase 3 — Migration SQL (réversible)
- Tables `mother_orders`, `sub_orders`, `import_containers`.
- Script de bascule idempotent : pour chaque `orders` actuelle → 1 mère + N filles selon `order_items.vendor_id`.
- Bascule réversible : la table `orders` reste en place pendant la transition.
- Vues SQL pour la rétro-compatibilité des écrans pas encore migrés.

### Phase 4 — Containers d'import
- Réutiliser ou étendre `import_batches`.
- Logique de ventilation du fret au prorata du poids.

### Phase 5 — Portail vendeur natif
- Trivial après Phase 3 : chaque vendeur ne voit que ses `sub_orders`.

---

## Hors-scope (à valider plus tard)

- Notifications client/vendeur automatisées (WhatsApp).
- Calcul auto des commissions selon `commission_rules`.
- Portefeuille client réutilisable pour `credit`.
- Livraison multi-livreurs (Jumia Express style).

---

## Garantie d'ouverture

À aucun moment une logique financière ou opérationnelle ne doit court-circuiter le modèle Commitment. Tout nouvel ajout (commissions, payouts, retours, litiges) doit produire un `Commitment` — c'est la règle.

À aucun moment une décision destructive ne doit vivre au niveau `mother_order` — sub_order uniquement.

À aucun moment un paiement ne doit être ventilé physiquement en base — la quote-part par sub_order est toujours dérivée.
