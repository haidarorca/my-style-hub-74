# Project Memory

## Core
Kawzone = marketplace locale + import + ERP. Cockpit = cerveau opérationnel, pas back-office esthétique.
ARTICLE = unité de travail, pas la commande. Une commande agrège des articles aux réalités différentes (local prêt, import en cours, rupture).
Rupture = décision métier (wait_restock / refund / credit / replace / partial_ship). Après décision, l'article QUITTE le flux normal.
Livraison partielle est normale. Ne jamais bloquer une commande entière pour un seul article problématique.
Zone floue → ne pas inventer : expliquer, options, recommandation, attendre validation.
JAMAIS supprimer page / feature / workflow / logique sans validation explicite. Préférer ajouter à supprimer.
Aucune migration / modification de schéma DB sans validation explicite.

## Memories
- [Charte Kawzone](mem://kawzone-charter) — Règles permanentes complètes : vision métier, article-centré, gestion ruptures, livraison partielle, anti-suppression
