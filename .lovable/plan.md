## Objectifs

Rendre le dossier Retour/Annulation aussi lisible et "sans erreur" qu'un dossier dans le Cockpit, et permettre la création multi-articles en un seul dossier.

## 1. Article cliquable → fenêtre détail (comme dans la sous-commande)

Dans `admin.returns.$caseId.tsx`, chaque ligne d'article devient cliquable et ouvre `ProductDetailDrawer` (déjà utilisé dans `OrderDrawer`/`PipelineView`).

- Mapper la ligne `return_case_items` + `order_items` + `order_article_states` vers le type `OrderArticle` attendu par `ProductDetailDrawer`.
- Header de drawer : nom, image, badge LOCAL/IMPORT, statut article courant.
- Section "Logistique & import", "Fournisseur", "Quantité & prix", historique — réutilisation directe.

## 2. Circuit logistique (LOCAL / IMPORT-Poids connu / IMPORT-Poids inconnu)

Sur la fiche du dossier, juste après l'article, afficher le `WorkflowCircuit` exact du Cockpit avec exactement les mêmes libellés :

- LOCAL : Nouvelle → Confirmée → Préparation → Prête → Expédiée → Livrée
- IMPORT Poids connu : Nouvelle → Confirmée → Commandée → Reçue ent. → Prête → Expédiée → Livrée
- IMPORT Poids inconnu : variante avec Pesée / Frais / Validée

Étape active = statut réel de la **sous-commande** (table `sub_order_states`, clé `${vendor_id}::${line_kind}`). Fallback : statut de la commande mère, puis statut article. Étendre `getReturnCase` pour renvoyer `sub_order_states` correspondants.

## 3. "Payé client" déjà visible dans le Cockpit

Le bloc financier expose déjà `payment_summary.total_paid` et la liste `payments`. Le rendre plus saillant :

- Card "Payé client" mise en avant (montant + nb paiements + méthode dominante).
- Lien direct vers la commande dans le Cockpit ("Voir dans Cockpit" → `OrderDrawer`).

## 4. Création multi-articles depuis le Cockpit

Aujourd'hui : 1 bouton par article, 1 dossier par article. Demande : pouvoir cocher plusieurs articles d'une même commande et créer **un seul dossier**.

UI dans `OrderDrawer` (panneau articles) :

- Mode "sélection" activable, chaque article devient cochable.
- Bouton "Tout sélectionner" en tête.
- Barre flottante (`BulkActionsBar` réutilisée) : "Retour groupé" / "Annulation groupée".
- Modale unique : motif global, type (retour/annulation) ; à la validation un seul dossier est créé contenant toutes les lignes cochées.

Garde-fous (impossible de se tromper) :

- Tous les articles doivent appartenir à la même commande (déjà le cas, drawer = 1 cmd).
- Désactivation visuelle d'un article déjà inclus dans un autre dossier OUVERT (vérifié serveur).
- Un seul article = comportement actuel inchangé (bouton direct).

## 5. Backend — nouvelle RPC atomique

Ajouter une fonction serveur `openReturnCaseForArticles` :

```text
open_return_case_for_items(_order_id, _kind, _reason_note,
  _items: jsonb[]  // [{order_item_id, quantity, unit_price_xof}, ...]
)
```

- Crée le dossier (1 row `return_cases`).
- Insère N lignes `return_case_items` dans la même transaction.
- Rejette si une ligne référence un `order_item_id` déjà attaché à un dossier non clôturé.
- Renvoie l'id du dossier créé.

L'ancienne RPC `open_return_case_for_item` reste pour l'action 1-clic.

## 6. Détails techniques

Fichiers touchés :

- `supabase/migrations/<ts>_returns_multi_items.sql` — nouvelle RPC + index unique partiel `(order_item_id) WHERE status IN ('open','decided')` pour empêcher les doublons.
- `src/lib/returns.functions.ts` — `openReturnCaseForArticles`, extension `getReturnCase` (ajout `sub_order_states`).
- `src/cockpit/components/OpenReturnCaseButton.tsx` — bouton individuel conservé.
- `src/cockpit/components/OrderItemsPanel.tsx` (ou équivalent dans `OrderDrawer`) — mode sélection + "Tout sélectionner" + appel groupé.
- `src/routes/admin.returns.$caseId.tsx` — chaque item cliquable → `ProductDetailDrawer`, `WorkflowCircuit` par article, mise en avant du payé client, lien Cockpit.

Aucune route ajoutée, aucune nouvelle table, aucune migration de données. Les anciens dossiers restent compatibles.

## Hors-scope

Pas d'envoi WhatsApp, pas de notif, pas de modification du moteur de remboursement. Le calcul "Payé − Frais = Conseillé" reste identique.
