# Centre Retours & Annulations — Nouvelle architecture

## Philosophie retenue

- **Un seul objet** : le *dossier*, de type `return` ou `cancellation`.
- **Granularité article** : un dossier porte sur 1..N `order_items` d'une même commande, jamais sur la commande entière.
- **Contexte affiché, jamais modifié** : la commande, ses autres sous-commandes et articles sont lus en lecture seule pour aider la décision.
- **L'humain décide** : le logiciel calcule et trace, l'admin tranche.
- **Pas de stock, pas de messagerie, pas de garantie/litige** : hors périmètre tant que les modules correspondants n'existent pas. WhatsApp reste le canal client.

## Ce qui est supprimé

Tout l'ancien SAV et toute la logique de retour intégrée au Cockpit :

- Tables : `sav_cases`, `sav_messages`, `sav_actions`, `sav_attachments`, `sav_rules`, `sav_refunds`, `sav_exchanges`, `sav_fee_charges`, `return_shipments`, `inspection_reports`, `destruction_records`, `supplier_returns`, vue `v_case_balances`, fonction `resolve_sav_rules`.
- Routes : `/admin/cockpit/sav`, `/admin/sav-rules`, `/vendor/sav`, `/my-sav`.
- Code : `src/cockpit/pages/SavCenter.tsx`, dossier `src/components/sav/`, `src/lib/sav-workflow.functions.ts`, `src/lib/return-management.functions.ts`, hook `useSavCounts`, composants Cockpit `ReturnAlertWidget`, `ReturnBadge`, `ReturnBalanceCard`, `ReturnTimeline`, et toute action "créer un retour" dans `OrderDrawer` / `SubOrderActionCard`.

Le Cockpit conserve uniquement **un bouton "Ouvrir un dossier"** par article qui redirige vers le nouveau centre.

## Modèle de données (minimal)

Deux tables seulement.

```text
cases
├── id, code (RET-2026-0001 / ANN-2026-0001)
├── kind            : 'return' | 'cancellation'
├── order_id        : FK orders
├── status          : 'open' | 'decided' | 'closed' | 'cancelled'
├── decision        : 'accepted' | 'partial' | 'refused' | null
├── refund_suggested_xof, refund_final_xof, refund_method
├── reason_code, reason_note, internal_notes
├── opened_by, decided_by, closed_by, *_at timestamps

case_items                       case_fees
├── case_id                      ├── case_id
├── order_item_id                ├── label    (texte libre : "Livraison retour"…)
├── quantity                     ├── amount_xof
├── item_decision                ├── created_by, created_at
                                 (autant de lignes que voulu)
```

Optionnel pour audit : `case_events(case_id, type, payload, actor, at)` append-only — un seul journal, pas 4 tables.

Tout le reste (montant produit, payé, reste à payer, PayZ, paiements) est déjà calculable depuis `order_items`, `order_payments`, `order_payment_summary` — **on ne duplique rien**.

## Workflow (4 états, c'est tout)

```text
open ──► decided ──► closed
  │
  └────────────────► cancelled
```

- **open** : dossier créé, admin analyse.
- **decided** : admin a choisi `accepted` / `partial` / `refused` + montant final.
- **closed** : remboursement effectué (ou refus communiqué), dossier verrouillé.
- **cancelled** : dossier annulé par erreur de saisie.

Pas de "waiting_vendor", "in_arbitration", "in_execution", "escalated"… Ces nuances vivent dans la tête de l'admin et dans WhatsApp.

## Calcul du montant conseillé

```text
montant_articles      = Σ (unit_price × quantity) sur case_items
frais                 = Σ amount_xof sur case_fees
refund_suggested_xof  = montant_articles − frais   (jamais < 0)
```

Affiché en permanence, recalculé à chaque modif. `refund_final_xof` est saisi par l'admin (pré-rempli avec la suggestion, modifiable librement).

## UI — trois écrans seulement

**1. `/admin/returns` — Liste**
Filtres : type (retour/annulation), statut, date, recherche commande/client. KPI haut de page : ouverts, décidés non clôturés, clôturés du mois.

**2. `/admin/returns/$id` — Dossier**
Layout deux colonnes :
- *Gauche (action)* : articles du dossier, frais (ajout/suppression de lignes), bloc financier (suggéré vs final), décision, bouton "Clôturer".
- *Droite (contexte, lecture seule)* : carte commande, liste de tous les articles et sous-commandes avec leur statut, historique paiements, journal du dossier.

**3. Bouton "Ouvrir un dossier"** sur chaque ligne article du `OrderDrawer` du Cockpit → pré-remplit `order_id` + `order_item_id` + choix `return`/`cancellation` → redirige vers `/admin/returns/$id`.

Pas d'espace vendeur, pas d'espace client : la communication passe par WhatsApp, comme demandé.

## Permissions

- Admin (rôle existant) : tout.
- Vendeur / client : aucun accès aux dossiers — RLS verrouillée à `has_role(auth.uid(), 'admin')`.

## Réutilisation de l'existant

- `orders`, `order_items`, `order_payments`, `order_payment_summary` : source unique des données financières.
- `notifications` : une notif admin quand un dossier est ouvert depuis le Cockpit (optionnel).
- Pattern `createServerFn` + `requireSupabaseAuth` + composants `shadcn` déjà en place.

## Plan d'exécution (quand tu valides)

1. **Migration de purge** : drop des tables SAV + return-management + nettoyage des FK Cockpit.
2. **Migration de création** : `cases`, `case_items`, `case_fees`, `case_events` + RLS admin-only + GRANT.
3. **Server functions** : `openCase`, `addCaseItem`, `addFee`, `removeFee`, `decideCase`, `closeCase`, `cancelCase`, `getCase`, `listCases`.
4. **UI** : route liste, route dossier, bouton "Ouvrir un dossier" dans `OrderDrawer`.
5. **Nettoyage** : suppression des anciens fichiers listés plus haut + entrées sidebar.

## Points à confirmer avant de coder

1. **Code dossier** : format `RET-YYYY-NNNN` / `ANN-YYYY-NNNN` te convient ?
2. **Frais négatifs** : autorise-t-on des lignes négatives (remise/avoir compensatoire) ou strictement ≥ 0 ?
3. **Pièces jointes** (photos produit retourné) : utiles dès maintenant, ou WhatsApp suffit pour l'instant ?
4. **Journal `case_events`** : on le garde dès le départ (recommandé pour la traçabilité) ou on attend ?
