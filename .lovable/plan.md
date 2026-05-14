## Objectif
Construire l'expérience d'achat côté client (style Shein) : navigation, tendances avec ajout rapide, panier multi-boutiques, fiche produit détaillée.

## 1. Navigation & catégories
- **Header (`AppHeader.tsx`)** : ajouter un menu horizontal scrollable des "univers" (filtres globaux). Pour l'instant, ces univers seront dérivés des catégories niveau 1 (Vêtements, Chaussures, etc.) + onglet "All". Swipe horizontal supporté nativement (overflow-x-auto + snap).
- **Menu catégories** : sous le menu univers, afficher les sous-catégories (niveau 2) de l'univers sélectionné, scrollable horizontalement.
- L'univers actif filtre la grille de produits sur l'accueil par `category_id` (niveau 1 ou ses descendants).

## 2. Section Tendances avec ajout rapide
- Nouvelle section "Tendances" sur l'accueil (déjà esquissée → enrichie).
- Bouton panier en overlay sur chaque carte produit.
- Au clic : ouvrir un **Sheet** (drawer bas) `QuickAddSheet.tsx` qui charge variantes + customizations du produit, permet de choisir taille/couleur/quantité, puis insère dans `cart_items`.
- Si pas de variantes ni customization requise → ajout direct au panier.

## 3. Panier multi-boutiques (`/cart`)
- Nouvelle route `src/routes/cart.tsx`.
- Charge `cart_items` du user + jointure produits + vendor (profile.shop_name ou full_name) + variant + image principale.
- Groupement par `vendor_id`, en-tête "Boutique : <nom>".
- Boutons +/- pour ajuster `quantity`, suppression, total par boutique et global.
- Bouton "Passer la commande" : génère le message WhatsApp formaté (code, nom, taille, couleur, qté, prix unitaire, total) et ouvre `https://wa.me/221776533606?text=...` (le message WhatsApp avait été décidé en v1).
- Icône panier dans le header avec badge du nombre d'items.

## 4. Fiche produit (`/product/$productId`)
- Nouvelle route avec galerie d'images (carousel), nom, code, designation, prix.
- Sélecteurs taille/couleur (extraits de `product_variants`, distincts).
- Sélecteur quantité (+/-).
- Si `product_customizations` existe : zones pour saisir nom (texte+police+couleur) et/ou uploader image vers `customization-uploads`.
- Bouton principal "Ajouter au panier".
- Section bas "Boutique" : carte cliquable avec nom du vendeur (et plus tard sa page boutique).
- Bouton "Signaler" (insertion dans `product_reports`).

## 5. Détails techniques
- Hook `useCart()` : count + add/update/remove via `supabase` browser client (RLS déjà OK : `cart_self_all`).
- Hook `useUniverses()` : récupère catégories niveau 1.
- Génération message WhatsApp dans `src/lib/whatsapp.ts` (pure utilitaire).
- Tous nouveaux composants utilisent les tokens design existants (rose Shein).
- Pas de changement de schéma DB nécessaire — toutes les tables existent.

## Fichiers
- créer : `src/routes/cart.tsx`, `src/routes/product.$productId.tsx`, `src/components/product/QuickAddSheet.tsx`, `src/components/product/ProductCard.tsx`, `src/hooks/use-cart.tsx`, `src/lib/whatsapp.ts`
- modifier : `src/components/layout/AppHeader.tsx` (univers + icône panier), `src/routes/index.tsx` (univers actif, sous-catégories, ProductCard avec quick-add)

## Hors scope (étapes suivantes)
- Espace vendeur (création produits + variantes + customizations).
- Page boutique publique d'un vendeur.
- Assistant IA admin.
