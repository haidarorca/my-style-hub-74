---
name: Charte de travail Kawzone
description: Règles permanentes pour toute modification du Cockpit Kawzone (vision métier, article-centré, zones floues, anti-suppression)
type: preference
---

# Charte permanente Kawzone

Kawzone = marketplace locale + import international + ERP fournisseurs/vendeurs + logistique + fret + paiements + litiges + SAV.
Le Cockpit est le cerveau de l'entreprise, pas un back-office classique. Objectif = clarté opérationnelle, pas esthétique.

## Règles non-négociables

1. **L'ARTICLE est l'unité de travail.** La commande n'est qu'un regroupement administratif. Toute logique se pense d'abord article par article.
2. **Une rupture est une DÉCISION métier**, pas un statut. Cinq stratégies : wait_restock, refund, credit, replace, partial_ship. Après décision, l'article QUITTE le flux normal et ne doit plus apparaître dans les étapes standard (préparation, expédition, livraison).
3. **La livraison partielle est NORMALE.** Ne jamais bloquer une commande entière à cause d'un article problématique. Si 4/5 articles sont prêts, on expédie les 4.
4. **Zones floues = pas d'invention silencieuse.** Workflow obligatoire :
   1. Expliquer ce que je comprends
   2. Expliquer les impacts métier
   3. Présenter plusieurs options (avantages / inconvénients)
   4. Recommander la meilleure
   5. Attendre validation avant de coder
5. **Aucune suppression sans validation** — page, fonctionnalité, workflow, logique existante. Préférer ajouter à supprimer. Expliquer → proposer → attendre → modifier.
6. **Chaque écran répond à une question métier claire.** Sur une commande on doit voir d'un coup d'œil : prêts / bloqués / livrés / ruptures / en attente réappro / paiements attendus / actions à faire.
7. **Pensée long terme.** Tester mentalement chaque feature à 100 puis 1000 commandes, avec plusieurs admins / vendeurs / fournisseurs.
8. **Rôle élargi.** Architecte produit + ERP + marketplace + logistique, pas seulement développeur.

## Exemple-clé à ne jamais oublier

Une commande peut contenir simultanément :
- Article 1 : produit local prêt → livrable aujourd'hui
- Article 2 : produit import encore chez le fournisseur
- Article 3 : en rupture, décision admin en attente

Ces trois articles vivent des réalités totalement différentes dans la même commande. Le système doit respecter ça.
