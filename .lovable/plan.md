## Objectif

Évolution majeure du formulaire produit vendeur : composition textile structurée, marques anti-doublon, pays d'origine intelligent, garantie améliorée, vidéo multi-source, et champs dynamiques par catégorie (saison/genre/âge/entretien pour vêtements). Conserver toute la logique métier existante (fret, mesures, fit, etc.).

---

## 1. Composition textile structurée

**DB** (migration) :
- `ALTER TABLE products ADD COLUMN material_composition_items jsonb DEFAULT '[]'::jsonb`
  - Format : `[{ "material": "Coton", "percent": 70 }, { "material": "Polyester", "percent": 25 }, ...]`
- Garder `material` (matière principale dérivée) et déprécier `material_composition` texte (lecture seule legacy).

**Helper** `src/lib/textile-materials.ts` :
- Liste : Coton, Polyester, Élasthanne, Viscose, Lin, Laine, Soie, Denim, Cuir, Nylon, Acrylique, Cachemire, Satin, Velours, Mélange, Autre.
- `formatComposition(items)` → "70% coton, 25% polyester, 5% élasthanne".
- `validateComposition(items)` → vérifie total = 100, pas de doublons.

**Formulaire vendeur** (vêtements uniquement) :
- Composant `CompositionEditor` : lignes (Select matière + Input %) + bouton "➕ Ajouter une matière".
- Aperçu live de la chaîne formatée.
- Total affiché : "Total : 100%" (vert) ou "Total : 95% – doit être 100%" (rouge).
- Blocage publication si total ≠ 100 (vêtements actifs).
- `material` principal = matière avec le plus haut %.

**Page produit client** :
- Section "Composition" affichée sous forme de liste claire.

## 2. Marques (anti-doublon)

**DB** (migration) :
- `CREATE TABLE brands (id uuid pk, name text not null, slug text unique not null, created_by uuid, created_at, updated_at)`
- GRANT SELECT TO anon, authenticated ; INSERT TO authenticated.
- RLS : lecture publique, insertion par utilisateur authentifié.
- `ALTER TABLE products ADD COLUMN brand_id uuid REFERENCES brands(id)`. Garder `brand` text legacy.
- Trigger : normalise `slug = lower(unaccent(trim(name)))` à l'insert. Doublons rejetés via unique slug.

**Formulaire vendeur** :
- Combobox "Marque" : recherche dans `brands` (debounced). Si aucune correspondance exacte → bouton "Créer la marque {nom}".
- À la sauvegarde : insert dans `brands` (slug normalisé), puis assigne `brand_id`.

## 3. Pays d'origine intelligent

**Formulaire** :
- Combobox `CountryCombobox` (recherche par nom, drapeau, code) basé sur `useCountries`.
- Champ déjà séparé du pays vendeur — on précise dans le helper text : "Lieu de fabrication réel du produit (pas votre pays)".
- Pré-rempli avec pays vendeur mais éditable.

## 4. Garantie améliorée

**Formulaire vendeur** :
- Checkbox "✅ Ce produit bénéficie d'une garantie".
- Si coché → 2 selects : Durée (1, 3, 6, 12, 24, 36, personnalisé) + Unité (mois / ans) → convertit en jours pour `warranty_days` existant.
- Option "Personnalisé" → input number + select unité.

**Page client** :
- Badge déjà géré par `warrantyLabel` ; ajout icône 🛡.

## 5. Vidéo multi-source

**DB** : déjà `video_url` text. Pas de migration.

**Helper** `src/lib/product-video.ts` :
- `parseVideoUrl(url)` → `{ provider: 'youtube'|'vimeo'|'tiktok'|'direct'|'unknown', embedUrl }`.
- Regex YouTube (watch/shorts/youtu.be), Vimeo, TikTok.

**Formulaire** :
- Input URL + aperçu instantané (iframe pour YT/Vimeo/TikTok, `<video>` pour fichier direct .mp4).
- Phase 2 (upload direct) : nouveau bucket `product-videos` (privé puis public). Pour cette itération : URL uniquement + détection plateforme. Note dans UI : "Upload direct bientôt disponible".

## 6. Attributs vêtements (saison / genre / âge / entretien)

**DB** (migration) :
- `ALTER TABLE products ADD COLUMN season text` (ete, hiver, printemps, automne, toutes_saisons)
- `ADD COLUMN gender text` (homme, femme, mixte, garcon, fille, bebe)
- `ADD COLUMN age_group text` (bebe, enfant, ado, adulte)
- `ADD COLUMN care_instructions text[]` (lavage_machine, lavage_main, repassage, nettoyage_sec, eau_froide, pas_seche_linge, etc.)

**Helpers** `src/lib/clothing-attributes.ts` : labels + icônes pour chaque enum.

**Formulaire** (vêtements uniquement, dans bloc dédié) :
- Select Saison, Select Genre, Select Tranche d'âge, multi-checkbox Entretien.

**Page client** : Section "Détails vêtement" avec badges (Saison · Genre · Âge) + liste entretien.

## 7. Type de coupe — descriptions vendeur + client

Déjà fait via `FIT_TYPES` avec descriptions. Vérifier que la description est bien affichée sous le Select dans le formulaire (texte d'aide live) et sous le badge sur la page produit (déjà OK). Ajustement mineur si manquant.

## 8. Formulaire dynamique par catégorie

Helper `src/lib/category-fields.ts` :
- `getCategoryFieldGroups(category)` → renvoie quels blocs afficher : `clothing`, `electronics` (marque, modèle, garantie), `furniture` (dimensions, matériaux), `cosmetic` (composition, DLU).
- Détection via keywords sur catégorie/sous-catégorie (extension de `isClothingContext`).

Pour cette itération : implémenter `clothing` complet + activer garantie & marque pour tous (universels). Les blocs `furniture`/`cosmetic` resteront extensibles plus tard sans casser l'existant.

---

## Fichiers impactés

**Nouvelle migration** (une seule) :
- Ajout `material_composition_items jsonb`, `season`, `gender`, `age_group`, `care_instructions text[]`, `brand_id uuid` sur `products`.
- Création table `brands` + RLS + GRANT + trigger slug.

**Nouveaux helpers** :
- `src/lib/textile-materials.ts`
- `src/lib/clothing-attributes.ts`
- `src/lib/product-video.ts`
- `src/lib/category-fields.ts` (extension)

**Nouveaux composants** :
- `src/components/product/CompositionEditor.tsx`
- `src/components/product/BrandCombobox.tsx`
- `src/components/product/CountryCombobox.tsx` (ou réutiliser existant si présent)
- `src/components/product/VideoUrlInput.tsx`
- `src/components/product/WarrantyPicker.tsx`

**Fichiers modifiés** :
- `src/routes/vendor.products.new.tsx`
- `src/routes/vendor.products.$productId.edit.tsx`
- `src/routes/product.$productId.tsx` (affichage composition, attributs vêtement, badge garantie 🛡, vidéo embed)

**Aucune logique existante retirée.** Fret, pesée, mesures, fit, SKU, variantes, blocage publication restent identiques. Les nouveaux champs sont additifs.

---

## Validations bloquantes (publication vêtement actif)

En plus de l'existant (mesures + matière) :
- Composition : total = 100% si au moins 1 ligne saisie. Si vide → utiliser ancien champ `material`.
- À terme (phase suivante) : composition obligatoire pour vêtements. Pour cette itération : optionnelle mais validée si présente.
