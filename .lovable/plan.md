## Objectif
Enrichir le formulaire produit vendeur avec des options avancées repliées, sans complexifier l'interface principale, et appliquer les règles métier associées (garantie, quantité min, SKU, etc.).

## 1. Base de données (migration)
Ajouter à `public.products` les colonnes manquantes :
- `brand text`
- `barcode text` (EAN/UPC)
- `warranty_months int` (0/7j stocké en jours? → on stocke `warranty_days int` pour couvrir 7j/30j/3mois/.../personnalisé)
- `is_fragile boolean default false`
- `min_order_qty int default 1 check (min_order_qty >= 1)`
- `video_url text`
- `sku text` (interne vendeur)
- `variant_ref text` (interne vendeur)

`origin_country_id`, `weight_kg`, dimensions existent déjà → réutilisés.
Pas de colonne « type Local/Import » : déduction automatique conservée via `getLineKind()` (`src/lib/line-kind.ts`).

## 2. Formulaire vendeur (`vendor.products.new.tsx` + `vendor.products.$productId.edit.tsx`)
Garder le formulaire principal simple : nom, catégorie, prix, stock, images, description.

Ajouter un bouton **« Options avancées »** (Collapsible) qui révèle :
- Marque
- Code-barres / EAN / UPC
- ☐ Ce produit bénéficie d'une garantie → si coché : select (7j / 30j / 3 mois / 6 mois / 1 an / 2 ans / personnalisé en jours)
- Poids (kg) + dimensions (déjà partiellement présents)
- URL Vidéo
- Pays d'origine (CountrySelect, facultatif, liste complète des pays activés)
- Fragilité : radio ☐ Produit fragile / ☐ Produit non fragile
- Quantité minimale de commande (number, défaut 1)
- SKU vendeur
- Référence variante

Aucun champ « Local / Import / Mixte » côté vendeur.

## 3. Affichage client (`product.$productId.tsx` + `ProductCard.tsx`)
- Badge garantie : `🛡 Garantie {label}` (calculé depuis `warranty_days`) sur la page produit.
- Badge fragile « 🫧 Fragile » uniquement si `is_fragile = true`.
- Badge LOCAL / IMPORT déjà géré via `LineKindBadge` — conservé tel quel.
- Quantité minimale : indication « Quantité minimale : N unités » sous le sélecteur quantité.
- SKU / variant_ref / barcode : **jamais affichés au client**.

## 4. Règles panier / checkout
- `use-cart.tsx` + `QuickAddSheet.tsx` : initialiser la quantité à `max(1, min_order_qty)` lors de l'ajout, bloquer décrément sous `min_order_qty`, toast « Quantité minimale de commande : N unités. »
- Page panier : validation au checkout : si une ligne a `quantity < products.min_order_qty`, bloquer avec message.

## 5. Visibilité interne (SKU, variant_ref, barcode)
Affichés dans :
- formulaire vendeur (édition)
- pages admin produits (table produits admin)
- Cockpit (OrderItemsPanel) — petite ligne « SKU: … » sous chaque item
- SAV / logistique (déjà via les mêmes composants admin)

Jamais inclus dans les composants client (`ProductCard`, page produit publique).

## 6. Hors périmètre
- Pas de modification du champ « type » côté DB.
- Pas de refonte du calcul de fret ni de la pesée.
- Pas de toucher au workflow d'expédition récemment finalisé.

## Fichiers impactés
- **Migration** : nouvelle, ajoute les colonnes ci-dessus + grants/policies inchangés (table déjà ouverte).
- `src/routes/vendor.products.new.tsx` — refonte sections avec Collapsible « Options avancées ».
- `src/routes/vendor.products.$productId.edit.tsx` — mêmes champs en édition.
- `src/routes/product.$productId.tsx` — badge garantie + indication qty min.
- `src/components/product/ProductCard.tsx` — badge garantie discret.
- `src/components/product/QuickAddSheet.tsx` — quantité min.
- `src/hooks/use-cart.tsx` — quantité min.
- `src/routes/cart.tsx` — blocage checkout.
- `src/cockpit/components/OrderItemsPanel.tsx` — affichage SKU/variant_ref interne.
- `src/lib/warranty.ts` (nouveau) — helpers conversion jours ↔ label.

Aucune logique métier existante n'est supprimée.