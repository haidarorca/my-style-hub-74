## Refonte du drawer sous-commande — orienté actions métier

Transformer `OrderDrawer.tsx` (682 lignes) en cockpit d'action. **Conserver intégralement** la numérotation et l'identification existantes (1/2, vendor, line_kind, scope) — on ne change que la mise en scène.

### Nouvelle structure du drawer

Réorganiser le contenu actuel en 5 onglets pour éviter le scroll infini :

```text
[Header identité — toujours visible]
KZ-000128 · 1/2   Boutique U   [IMPORT] [Poids inconnu]

[Bloc statut principal — toujours visible]
🟠 À COMMANDER  ·  Étape actuelle : Nouvelle commande reçue

[Bloc actions contextuelles — toujours visible]
[Commander fournisseur] [Modifier articles] [Rupture] [Annuler] [⋯]

[Onglets]
  Résumé · Articles · Logistique · Paiements · Historique
```

### Onglet 1 — Résumé (par défaut)
- Banner statut + next action (existant : `NextActionBanner`)
- Mini-pipeline horizontal (existant : `PipelineView`, compacté)
- Carte client (nom, téléphone, WhatsApp)
- Résumé financier (total / reste à payer)
- 3 chips "Pesée · Frais · Paiement" avec CTA inline

### Onglet 2 — Articles
- Liste actuelle (`ArticlesPanel`) enrichie d'un **badge statut par article** dérivé de `order_article_states` :
  `à commander · commandé · reçu · pesé · expédié · livré · rupture · remplacé`
- Actions contextuelles par article selon ce statut (commander, modifier qté, signaler rupture, ajouter poids/dims, voir détails)

### Onglet 3 — Logistique
- Pesée, dimensions, calcul frais, étiquette, suivi (extraits des sections actuelles)

### Onglet 4 — Paiements
- `PaymentForm` + `PaymentHistory` existants

### Onglet 5 — Historique
- `EventTimeline` existant en pleine largeur

### Moteur d'actions contextuelles

Nouveau fichier `src/cockpit/lib/sub-order-actions.ts` : table de mapping
`effective_status → Action[]` couvrant les 3 workflows (Local 6 étapes,
Import poids connu 7 étapes, Import poids inconnu 10 étapes). Chaque action
référence un handler existant (`upsertSubOrderStatus`, `WeightForm`,
`PaymentForm`, etc.) — **aucune nouvelle logique métier**, uniquement du
routing UI vers les fonctions Vague 1–2.

### Statut métier par article

Nouveau composant `ArticleStatusBadge` + `ArticleActionsMenu` lisant
`useArticleStates` (déjà existant). Les transitions passent par les
mêmes server fns que celles déjà branchées dans `ArticlesPanel`.

### Fichiers touchés

**Créés**
- `src/cockpit/lib/sub-order-actions.ts` — table statut → actions
- `src/cockpit/components/SubOrderStatusBadge.tsx` — gros badge coloré
- `src/cockpit/components/SubOrderActionBar.tsx` — barre actions contextuelles
- `src/cockpit/components/SubOrderTabs.tsx` — wrapper Tabs shadcn
- `src/cockpit/components/ArticleStatusBadge.tsx`
- `src/cockpit/components/ArticleActionsMenu.tsx`

**Modifiés**
- `src/cockpit/components/OrderDrawer.tsx` — restructuré en header + tabs (passe de ~680 lignes à ~250 en déléguant aux sous-composants ; aucun appel server fn changé)
- `src/cockpit/components/ArticlesPanel.tsx` — intègre badge + menu par ligne

**Inchangés (garanties)**
- `useSubOrderRows`, `deriveSubOrders`, `formatSubOrderLabel` — la numérotation 1/2, 2/2 reste identique
- Server fns Vague 1–2 (`sub-order-states`, `sav-workflow`, paiements, pesée, etc.)
- Règles admin / moteur de règles

### Garanties anti-régression

1. Toute la logique métier reste dans les server fns existants.
2. La numérotation `index/total/label` est lue depuis `SubOrderRow` sans transformation.
3. Les badges `line_kind`, scope (kawzone/commission/autonomous), `IMPORT/LOCAL`, poids connu/inconnu sont conservés dans le nouveau header.
4. Aucune migration DB.
5. Mobile : tabs scrollables, actions en grille 2×N.

### Hors scope (à confirmer si besoin)
- Refonte de la vue liste `SubOrderCard` (cartes du pipeline) — la demande porte sur l'ouverture d'une sous-commande, donc je ne touche pas la liste sauf demande explicite.
- Nouveaux statuts métier ou nouvelles transitions — uniquement présentation.
