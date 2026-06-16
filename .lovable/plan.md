
# Phase B — Architecture événementielle du Cockpit

Reformulation du besoin : construire un **noyau ERP traçable**, pas un tableau. Chaque chose qui arrive à une sous-commande est un **événement** horodaté, immuable, lié à une cause, une décision et une conséquence financière. Tout dérive de cette chaîne.

> Aucun filtre n'est livré dans cette phase. Les filtres seront un *projet* trivial une fois ces métiers en place.

---

## 1. Les 3 métiers fondateurs

### 1.1 Événement (`order_events`)
La **cause**. Immuable. Rien ne se passe sans événement.

Catalogue fermé :
- `client_cancellation` — annulation client
- `stock_break` — rupture vendeur/fournisseur
- `product_deleted` — produit retiré du catalogue
- `shop_deleted` — boutique retirée
- `customer_dispute` — litige client ouvert
- `delivery_refusal` — refus à la livraison
- `post_delivery_return` — retour après livraison
- `vendor_error` — erreur vendeur
- `kawzone_error` — erreur Kawzone
- `supplier_unavailable` — fournisseur ne répond plus
- `commercial_gesture` — geste commercial
- `payment_blocked` — paiement bloqué côté banque/wallet
- `delivery_blocked` — colis bloqué (douane, livreur, etc.)
- `order_abandoned` — pas d'activité X jours

Chaque événement porte : sous-commande, article concerné (nullable), auteur, horodatage, raison libre, payload JSON typé.

### 1.2 Décision (`order_decisions`)
La **réponse**. Toujours rattachée à un événement parent.

Catalogue fermé :
- `cancel_article` · `cancel_suborder`
- `wait_restock` · `wait_supplier` · `wait_client`
- `replace_same` · `replace_higher` · `replace_lower`
- `partial_delivery`
- `accept_return` · `refuse_return` · `accept_exchange`
- `issue_refund` · `issue_credit_note` · `apply_penalty` · `commercial_gesture`
- `override_no_action`

Une décision est prise par un admin nommé, horodatée, peut être révisée (nouvelle décision pointe la précédente). Jamais effacée.

### 1.3 Mouvement financier (`financial_movements`)
La **conséquence**. Toujours rattachée à une décision parente (jamais orpheline).

Sens comptable explicite :
- `cash_in` (encaissement complément)
- `cash_out` (remboursement cash)
- `credit_note_issued` (avoir client émis)
- `credit_note_used` (avoir consommé sur autre commande)
- `penalty_kept` (montant conservé par Kawzone)
- `penalty_to_vendor` (montant conservé pour le vendeur)
- `commission_due_to_vendor` (à reverser plus tard — sans système de paiement encore)
- `loss_kawzone` · `loss_vendor` · `loss_shared`
- `gain_kawzone` · `gain_vendor`

Champs : montant, devise, sens (debit/credit pour la double-entrée optionnelle plus tard), porteur du coût (`kawzone`/`vendor`/`client`/`shared` + split), méthode (wave/cash/avoir/…), référence, date.

**Invariant fort** : pour toute annulation/retour partiel d'un article :
```
article.line_total = sum(cash_out) + sum(credit_note_issued)
                   + sum(penalty_kept) + sum(penalty_to_vendor)
                   + sum(loss_*) + retained_value
```
La balance se ferme toujours. Vérifiée par contrainte trigger.

---

## 2. État dérivé d'une sous-commande

Aucun champ "statut financier" n'est stocké. Tout est **dérivé** des événements + décisions + mouvements de la sous-commande :

| Vue dérivée | Calcul |
|---|---|
| `gross_value` | somme initiale des `line_total` |
| `cancelled_value` | somme des lignes avec décision `cancel_*` |
| `refunded_value` | somme `cash_out` |
| `credited_value` | somme `credit_note_issued` |
| `penalty_value` | somme `penalty_kept` + `penalty_to_vendor` |
| `net_value` | `gross_value − cancelled_value + penalty_value` |
| `outstanding_to_pay_client` | encaissements attendus − reçus |
| `outstanding_to_refund_client` | décisions `issue_refund` non couvertes par `cash_out` |
| `outstanding_credit_to_issue` | décisions `issue_credit_note` non couvertes |
| `commission_to_remit_vendor` | somme `commission_due_to_vendor` non versée |

Ces vues sont calculées en JS dans `sub-orders.ts` ET disponibles côté SQL via une **vue Postgres** `v_sub_order_accounting` pour les rapports comptables N+5.

---

## 3. Catégorisation responsabilité (Action attendue)

Champ dérivé sur chaque sous-commande, calculé depuis événements ouverts + décisions en attente :

- `awaits_admin` — Kawzone doit décider/agir (ex : rupture sans décision, remboursement décidé non exécuté, validation remplacement)
- `awaits_vendor` — on attend le vendeur (préparation, réponse)
- `awaits_supplier` — on attend le fournisseur (import)
- `awaits_client` — on attend le client (paiement complément, validation devis pesée, réponse litige)
- `awaits_carrier` — on attend le transporteur/livreur
- `awaits_nothing` — sous-commande en flux nominal, rien d'attendu

Un événement ouvert sans décision → `awaits_admin`. Décision exécutée et flux nominal → `awaits_nothing` ou `awaits_<partie>` selon l'étape logistique.

C'est cette dimension qui répondra à "le matin, qu'est-ce qui dépend de moi ?".

---

## 4. Risque (signal métier, pas filtre)

Score calculé `risk_level: none | low | medium | high | critical` + tags `risk_reasons[]` :

- `shop_deleted_with_open_order` → critical
- `product_deleted_with_open_order` → high
- `pending_refund_over_7d` → high
- `pending_refund_over_30d` → critical
- `open_dispute` → high
- `payment_blocked` → medium
- `supplier_silent_over_14d` → medium
- `order_idle_over_30d` → low

Stocké nulle part. Recalculé à chaque lecture, ou matérialisé dans une vue pour les rapports.

---

## 5. Extensibilité retours (sans construire le module)

Le catalogue d'événements inclut déjà `delivery_refusal`, `post_delivery_return`. Le catalogue de décisions inclut `accept_return`, `refuse_return`, `accept_exchange`. Donc :

- Demain on ajoute une UI "Créer un retour" → elle ne fera qu'insérer un événement + une décision, **zéro changement de schéma**.
- Un retour = un événement comme un autre, avec sa décision et ses mouvements financiers.
- L'historique d'une commande livrée puis retournée 60 jours plus tard reste lisible et chiffré.

Idem pour la pénalité : c'est un mouvement `penalty_kept`, pas une colonne sur l'article.

---

## 6. Conservation historique — règles dures

- `order_events`, `order_decisions`, `financial_movements` : **INSERT only**. Pas d'UPDATE, pas de DELETE. Trigger qui interdit les deux (sauf service_role pour corrections exceptionnelles, loggées).
- Une correction = un nouvel événement `kawzone_error` + une nouvelle décision compensatoire + des mouvements opposés. La trace originale reste.
- Snapshots déjà posés en Phase A (`shop_name_snapshot`, `product_origin_country_id_snapshot`, etc.) garantissent qu'on lit une commande de 2026 en 2031 même si la boutique et le produit n'existent plus.
- Une boutique/produit supprimé déclenche automatiquement (trigger) l'insertion d'un événement `shop_deleted`/`product_deleted` **sur chaque sous-commande ouverte concernée**. Impossible de supprimer en silence.

---

## 7. Schéma SQL Phase B (migration unique)

Trois tables + une vue. Toutes en append-only, RLS admin/vendor selon scope.

```text
order_events
  id, sub_order_key, order_id, vendor_id, order_item_id?,
  event_type, reason, payload jsonb, created_at, created_by

order_decisions
  id, event_id (FK), decision_type, rationale, payload jsonb,
  supersedes_decision_id?,  -- révision = nouvelle décision pointant l'ancienne
  created_at, created_by

financial_movements
  id, decision_id (FK), amount numeric(14,2), currency, direction,
  movement_type, cost_attribution, cost_split jsonb?,
  method?, reference?, occurred_at, recorded_by

v_sub_order_accounting  (vue)
  sub_order_key, gross_value, cancelled_value, refunded_value,
  credited_value, penalty_value, net_value,
  outstanding_to_pay_client, outstanding_to_refund_client,
  outstanding_credit_to_issue, commission_to_remit_vendor
```

Plus deux triggers :
- `tg_lock_event_decision_movement` — interdit UPDATE/DELETE.
- `tg_open_order_on_entity_delete` — soft-delete d'un produit ou d'une boutique crée automatiquement un `order_events.product_deleted` / `shop_deleted` sur chaque sous-commande ouverte impactée.

---

## 8. Côté code (après migration)

1. `src/cockpit/lib/events.ts` — types + helpers de calcul des vues dérivées (mirroir TS de `v_sub_order_accounting`).
2. `src/cockpit/lib/sub-orders.ts` — ajoute `events`, `decisions`, `movements`, `accounting`, `awaits`, `risk` sur chaque `SubOrderRow`. Aucun ajout de filtre UI.
3. `src/lib/cockpit-events.functions.ts` — server fns `recordEvent`, `recordDecision`, `recordMovement` (toutes `requireSupabaseAuth` + `has_role('admin')`).
4. `OrderDrawer` — un nouvel onglet **Historique métier** (timeline événement → décision → mouvement). Aucune modification des panneaux financiers existants.
5. Badges automatiques "Boutique supprimée" / "Produit supprimé" dans `SubOrderCard` (lecture du dernier événement de ce type).

Phase B s'arrête là. Phase C (filtres) deviendra trivial : chaque filtre = une lecture sur la timeline ou sur la vue comptable.

---

## 9. Ce qui reste explicitement HORS Phase B

- Versement vendeur (table `vendor_payouts`) — concept conservé via mouvement `commission_due_to_vendor` mais pas d'UI de versement.
- Module Retours complet — structures prêtes, pas d'UI dédiée.
- Comptabilité double-entrée stricte — `direction` est présent, on pourra plus tard.
- Avoirs consommables sur d'autres commandes — `credit_note_used` est dans le catalogue, pas de moteur d'imputation encore.

---

## À valider avant d'écrire la migration

1. Les **14 types d'événements** te paraissent-ils complets et bien nommés ?
2. Les **15 types de décisions** te conviennent-ils ?
3. Les **11 types de mouvements financiers** couvrent-ils tous tes cas comptables ?
4. La règle **append-only stricte** (toute correction = nouvel événement) te convient-elle ?
5. La distinction `awaits_admin` vs `awaits_<autre>` te suffit-elle, ou veux-tu en plus une priorité (P1/P2/P3) dès maintenant ?
6. OK pour que la suppression d'une boutique/produit insère automatiquement un événement par sous-commande ouverte ?
