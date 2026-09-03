# KawScan — Prix en magasin (mini-application intégrée à Kawzone)

Nouvelle fonctionnalité sous `kawzone.com/kawscan`, techniquement dans Kawzone (même domaine, même base, même authentification), mais visuellement et fonctionnellement isolée du marketplace : pas de header marketplace, pas de panier, pas de catalogue.

## Parcours

- Vendeur : compte Kawzone existant → crée un magasin KawScan → ajoute/importe ses produits et prix → génère et imprime les étiquettes (QR / code-barres) et l'affiche du magasin.
- Client : scanne le QR du magasin → arrive directement sur le scanner → scanne un produit → voit le prix en grand. Aucun compte, aucune inscription.

## Structure de données (nouvelles tables isolées, préfixe `kawscan_`)

- `kawscan_stores` — magasin : propriétaire, nom, slug public permanent, devise (XOF par défaut), logo/nom affichés, options d'affichage (accueil, retour, lien Kawzone, logo Kawzone), statut.
- `kawscan_subscriptions` — abonnement par magasin : date de début, date d'expiration, statut (actif / suspendu / expiré), géré uniquement par l'admin.
- `kawscan_products` — produit d'un magasin : code (EAN/UPC/QR existant ou code interne généré), nom (facultatif), unité de vente, prix, prix promo + dates, options d'étiquette. Unicité du code par magasin.
- `kawscan_price_tiers` — niveaux de prix facultatifs (libellé + prix : pièce, 2 pièces, carton…).
- `kawscan_store_users` — employés rattachés à un magasin (rôle simple : propriétaire / employé).

Sécurité : RLS stricte + GRANT. Le vendeur ne voit et modifie que ses magasins. La lecture publique (scan client) passe par une fonction serveur en lecture seule qui vérifie que le magasin est actif et l'abonnement valide — jamais d'écriture côté client.

## Écrans

Espace vendeur `/kawscan/app` (mise en page dédiée, indépendante) :
- Tableau de bord : mes magasins, produits, abonnement.
- Produits : liste, recherche, ajout manuel un par un, édition rapide des prix, niveaux de prix, promotions.
- Codes : génération automatique de codes internes, choix QR ou code-barres.
- Impression : sélection des produits, type (QR / code-barres), format A3/A4/A5, disposition 1/2/4/8 par page, aperçu puis impression.
- Affiche magasin : « Scannez pour connaître le prix » + QR, en A3/A4/A5.
- Import Excel/CSV avec rapport (ajoutés / modifiés / ignorés / erreurs) et export Excel/CSV.
- Multi-magasins avec copie des produits et prix d'un magasin vers un autre.
- Suppression d'un magasin protégée par une confirmation explicite (saisie du nom du magasin + mot de passe du compte).

Écran client `/kawscan/store/<slug>` :
- Scanner plein écran, demande caméra, cadre de visée, bouton flash, détection code-barres et QR.
- Résultat : prix très grand, unité, promo et niveaux de prix si définis.
- États d'erreur clairs : code inconnu, magasin désactivé, abonnement expiré, caméra refusée, QR invalide.

Espace admin `/admin/kawscan` :
- Liste vendeurs / magasins / abonnements, nombre de produits, statut et date d'expiration.
- Actions : activer, suspendre, prolonger, désactiver, voir le magasin et ses produits.
- Filtres : actif, expiré, suspendu, bientôt expiré. Expiration automatique appliquée côté serveur.

## Points techniques

- Réutilisation de l'authentification, des rôles et du design system existants ; aucune table du marketplace modifiée ni dupliquée.
- Scan via l'API navigateur `BarcodeDetector` avec repli sur une librairie (ZXing) pour iOS ; génération des codes-barres avec une librairie légère, QR via `qrcode` déjà présent.
- Un lien « Gestion des prix en magasin » est ajouté dans l'espace vendeur Kawzone ; c'est la seule modification visible du marketplace.
- Vérification finale : typecheck, build et test du parcours complet vendeur → impression → scan client.
