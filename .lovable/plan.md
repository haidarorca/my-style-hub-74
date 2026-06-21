## Objectif
Corriger 7 problèmes de logique métier sur le formulaire produit vendeur avant validation finale.

## 1. Référence variante au niveau variante (pas produit)

**Migration DB** :
- `ALTER TABLE public.product_variants ADD COLUMN variant_ref text` (référence interne par variante).
- Supprimer `variant_ref` de `public.products` (ou conserver inutilisé — préférence : DROP COLUMN).

**Formulaire vendeur** (`vendor.products.new.tsx` + `edit.tsx`) :
- Retirer le champ "Référence variante" du bloc Options avancées.
- Ajouter un champ `variant_ref` (input court) sur chaque ligne du tableau de variantes, à côté du SKU/stock/prix.
- Garder `sku` au niveau produit (inchangé).

**Cockpit** (`OrderItemsPanel.tsx`) :
- Afficher `variant_ref` de la variante quand présente, en plus du SKU produit.

## 2. Fragile : une seule case

**Formulaire vendeur** :
- Remplacer le `RadioGroup` (fragile/non fragile) par une simple `Checkbox` "☐ Produit fragile".
- Non coché ⇒ `is_fragile = false`.

## 3. Catégories vêtements : détection

**Nouveau helper** `src/lib/clothing-categories.ts` :
- Liste des slugs/keywords de catégories vêtements (t-shirts, chemises, polos, pulls, vestes, pantalons, jeans, robes, jupes, ensembles, abayas, pyjamas, sous-vêtements, maillots, uniformes, vêtements enfants).
- Fonction `isClothingCategory(categorySlug | categoryName)`.
- Fonction `getMeasurementFields(subType)` → retourne champs spécifiques (T-shirt : poitrine+longueur, pantalon : tour de taille+longueur jambe, robe : poitrine+taille+longueur, défaut : poitrine+longueur).

## 4. Mesures réelles par variante (vêtements)

**Migration DB** :
- `ALTER TABLE public.product_variants ADD COLUMN measurements jsonb DEFAULT '{}'::jsonb`.
  - Stockage : `{ "chest_cm": 50, "length_cm": 70, "waist_cm": null, "leg_length_cm": null, ... }`.

**Formulaire vendeur** :
- Si catégorie vêtement détectée : section "Mesures réelles (cm)" pliable sur chaque ligne variante, avec les champs dérivés de la sous-catégorie.
- Champs `number`, optionnels individuellement mais au moins une variante doit avoir des mesures (voir §7).

## 5. Type de coupe

**Migration DB** :
- `ALTER TABLE public.products ADD COLUMN fit_type text` (valeurs : `slim`, `regular`, `oversize`, `large`, `ajuste`).

**Helper** `src/lib/fit-types.ts` :
- Liste avec `value`, `label`, `description` (Slim : "Coupe près du corps", Regular : "Coupe classique standard", Oversize : "Coupe volontairement large", Large : "Coupe plus ample qu'une coupe classique", Ajusté : "Entre Slim Fit et Regular Fit").

**Formulaire vendeur (vêtements uniquement)** :
- Select "Type de coupe" + texte d'aide qui change selon le choix (description visible).

**Page produit client** :
- Si `fit_type` défini : afficher badge + description courte sous le titre.

## 6. Guide des tailles client

**Page produit** (`product.$productId.tsx`) :
- Si catégorie vêtement ET au moins une variante a des `measurements` non vides : bouton "📏 Guide des tailles".
- Ouvre un `Dialog` listant chaque variante (par taille) avec ses mesures réelles formatées : "Taille S — Poitrine 48 cm, Longueur 68 cm".

## 7. Blocage publication (vêtements)

**Validation côté client** dans `vendor.products.new.tsx` + `edit.tsx` :
- Si catégorie vêtement et `status = 'active'` :
  - Au moins une variante doit avoir des mesures non vides.
  - Sinon : toast d'erreur "Pour publier un vêtement, renseignez les mesures réelles d'au moins une variante." et blocage du submit.
- Brouillon (`draft`) : autorisé sans mesures.

**Validation côté serveur** (trigger) :
- `CREATE TRIGGER` sur `products` BEFORE UPDATE/INSERT : si `status = 'active'` et catégorie vêtement et aucune variante n'a de measurements non vides → `RAISE EXCEPTION`.
- Sécurité défense en profondeur (l'opérateur admin pourrait sinon contourner).

## Fichiers impactés
- **Migration** (nouvelle) : `variant_ref` + `measurements` sur `product_variants`, `fit_type` sur `products`, DROP `variant_ref` sur `products`, trigger validation publication.
- `src/lib/clothing-categories.ts` (nouveau)
- `src/lib/fit-types.ts` (nouveau)
- `src/routes/vendor.products.new.tsx`
- `src/routes/vendor.products.$productId.edit.tsx`
- `src/routes/product.$productId.tsx` (bouton + dialog guide des tailles + badge coupe)
- `src/cockpit/components/OrderItemsPanel.tsx` (variant_ref par ligne)
- `src/lib/cockpit-payments.functions.ts` (inclure variant_ref dans la requête getOrderItems)

Aucune logique métier existante n'est retirée. Tous les calculs de fret/pesée/expédition restent intacts.
