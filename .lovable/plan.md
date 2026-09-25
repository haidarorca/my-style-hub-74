# Sourcing CJ plus intelligent + filtres professionnels pour les clients

Rien ne change pour les commandes, le panier, les prix, les marges, les commissions, le transport, la validation, la sensibilité des images ou la PWA.

## 1. Imports programmés par famille (n'importe quel niveau)
- Un seul sélecteur en arbre : on choisit une **famille**, une **sous-famille** ou une **sous-sous-famille**. Choisir une famille couvre automatiquement toutes ses sous-catégories CJ.
- Quota journalier jusqu'à **1 000 produits par jour** (ou plus), réparti automatiquement entre les sous-catégories : les plus riches en nouveautés reçoivent plus, les vides sont sautées.
- Mémoire de progression par sous-catégorie : le lendemain, l'import reprend là où il s'était arrêté au lieu de relire les mêmes pages (économie de points CJ).
- Le travail tourne sur le serveur par petits lots, sans navigateur ouvert. Il s'arrête si les points CJ sont bas et reprend au prochain passage.
- Rapport quotidien simple : importés, déjà présents, écartés, points utilisés, par sous-catégorie.

## 2. Import manuel réorganisé
- Écran en 3 zones claires : **Recherche** (mots ou famille), **Résultats**, **Sélection / import**.
- Masquer les informations inutiles (étapes techniques de recherche, compteurs internes). Elles restent dans un panneau « Détails » replié.
- Recherche par famille à tout niveau, en plus des mots-clés multilingues déjà en place.
- Filtres utiles seulement : prix, stock, nouveaux uniquement, avec images, nombre de variantes, matière.
- Tri : pertinence, prix, stock, nouveautés.
- « Tout sélectionner les nouveaux » puis import en arrière-plan, avec suivi dans l'onglet Imports.

## 3. Filtres professionnels pour les visiteurs (accueil, recherche, catégories)
- Bouton « Filtrer » qui ouvre un panneau complet (plein écran sur mobile), comme les grands sites :
  - Catégorie (arbre), Prix (curseur min/max), **Matière** (coton, polyester, cuir…, seulement les matières réellement connues), Couleur, Taille, Genre, Saison
  - **Pays d'origine / expédition** (ex. local Sénégal ou import Chine)
  - En stock uniquement, Promotions, Note
- Chaque option affiche le nombre de produits correspondants, et les options vides sont masquées.
- Filtres combinables, affichés en pastilles effaçables, gardés dans l'adresse de la page (partageable) ; tri par prix, nouveautés et popularité.
- Filtrage fait côté serveur pour rester rapide avec un grand catalogue.

## Détails techniques
- Arbre CJ : `getCjCategoryTree` ; résolution famille → liste des `categoryId` feuilles dans `jobs.server.ts` ; le curseur par feuille est stocké dans l'état de progression du programme (JSONB existant).
- Répartition du quota : pondérée par le nombre de nouveaux produits trouvés au passage précédent, avec un minimum par feuille ; le worker pg_cron existant traite des lots bornés avec verrou.
- Filtres clients : fonction SQL (RPC) de facettes sur les produits publiés (matière depuis la composition et les attributs, pays d'origine depuis la source/vendeur, variantes pour couleur/taille), index sur les colonnes filtrées ; état dans les paramètres d'URL de la route.
- Composants : nouveau `CategoryTreePicker`, `CjExplorer` et `CjSchedulesPanel` simplifiés, nouveau `ShopFilterSheet` réutilisé sur `/`, `/search` et `/c/$categoryId`.
