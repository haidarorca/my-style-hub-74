
# Module Retours & Annulations — Espace de travail du dossier

## Philosophie respectée

- Le système **affiche, calcule, trace**. L'admin **décide et valide**.
- Une page = toutes les infos pour décider. Aucun aller-retour.
- Workflow linéaire visible. Pas d'automatisation cachée.
- Historique exhaustif. Aucune action invisible.

## Ce que je vais construire

### 1. Workflow visible (stepper en haut du dossier)

```
Nouvelle  →  Analyse  →  Décision  →  Validation  →  Remboursement  →  Clôturé
```

Une seule barre d'étapes claire, dérivée du statut + décision. Pas de nouveau champ en base.

### 2. Espace de travail unique (1 page, sections empilées)

```
┌─────────────────────────────────────────────────────────────┐
│ [Code] [Type] [Statut] [Stepper workflow]   [Actions: ↗]   │
├─────────────────────────────────────────────────────────────┤
│ 1. Article concerné       │ 4. Commande & client            │
│ 2. Paiements client       │ 5. Autres articles (lecture)    │
│ 3. Frais du dossier       │ 6. Historique commande          │
│ 7. Calcul & décision (la zone d'action principale)          │
│ 8. Notes internes                                            │
│ 9. Historique du dossier (qui a fait quoi, quand)           │
└─────────────────────────────────────────────────────────────┘
```

### 3. Nouvelle formule de calcul (alignée avec ta vision)

Avant : `Articles − Frais = Conseillé`
Maintenant :
```
Montant payé par le client (depuis order_payments)
   − Total des frais saisis
   = Montant conseillé à rembourser
```
L'admin reste libre d'écraser. Le conseillé est affiché en gros, à côté du champ saisissable.

### 4. Panneau Paiements client

Lit `order_payments` et `order_payment_summary` :
- Total commande
- Total déjà payé
- Reste à payer
- Liste de chaque paiement (montant, méthode, date, admin)

### 5. Panneau Historique de la commande

Lit `order_events` + `order_status_history` fusionnés et triés par date.
Lecture seule. Donne le contexte (livré, expédié, payé fournisseur…).

### 6. Historique du dossier (audit log)

Nouvelle table `return_case_actions` :
- `case_id`, `action` (open/decide/close/cancel/fee_add/fee_remove/item_add/item_remove/note_update), `actor`, `payload jsonb`, `created_at`
- Remplie automatiquement par **triggers** sur `return_cases`, `return_case_items`, `return_case_fees` → impossible d'oublier de tracer.
- Affichée comme une timeline simple en bas de page.

## Changements techniques

**Migration SQL (1 seule)**
- `CREATE TABLE return_case_actions` + GRANT + RLS (admin only)
- 3 triggers (sur cases, items, fees) qui insèrent dans `return_case_actions`
- Permissions GRANT alignées sur le modèle existant

**Server functions (`src/lib/returns.functions.ts`)**
- `getReturnCase` enrichie : retourne aussi `payments[]`, `payment_summary`, `order_events[]`, `status_history[]`, `actions[]`
- Aucune nouvelle action côté code : les triggers font le journal

**UI (`src/routes/admin.returns.$caseId.tsx`)**
- Réécriture complète en composants internes : `WorkflowStepper`, `ArticleCard`, `PaymentsPanel`, `FeesPanel`, `DecisionPanel`, `OrderTimeline`, `CaseActivityLog`
- Layout 2 colonnes desktop, 1 colonne mobile, sections empilées dans l'ordre des besoins de décision
- Conseillé recalculé sur `total_paid − feesTotal` (au lieu de `itemsTotal − feesTotal`)
- Pas de nouveau composant global, tout reste dans le fichier route pour rester lisible

## Ce que je NE fais PAS (volontairement)

- Pas de moteur de règles automatiques
- Pas de messagerie intégrée (WhatsApp reste hors app, on garde juste les notes)
- Pas de gestion de stock
- Pas de nouveau statut : on garde `open / decided / closed / cancelled`
- Pas de réécriture de la liste — elle est déjà bonne

## Validation

Après implémentation :
1. Ouvrir un dossier existant → vérifier que toutes les sections s'affichent
2. Ajouter un frais → vérifier qu'une ligne apparaît dans l'historique du dossier
3. Valider une décision → vérifier le passage d'étape dans le stepper et la trace
4. Typecheck

Ok pour démarrer ?
