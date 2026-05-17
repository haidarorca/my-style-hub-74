## Objectif

Faire évoluer "Importer depuis images" pour qu'un simple upload de photos fournisseur produise des variantes complètes, traduites, avec image dédiée déjà nettoyée — sans casser la stabilité actuelle.

## Étapes

### 1. OCR enrichi côté serveur (Gemini 2.5 Flash)
Fichier : `src/lib/admin-generator.functions.ts` (fonction `analyzeVariantsFromImages`)

- Étendre le prompt pour que Gemini renvoie, **par variante**, en plus du nom FR / prix :
  - `sourceImageIndex` : index (0-based) de l'image fournie où la variante est la plus visible.
  - `cropHint` : `{ x, y, w, h }` en pourcentage (0–100) du cadre produit propre (sans bandeau prix, sans bouton, sans logo Taobao).
  - `chineseLabel` + `frenchLabel` : pour pouvoir remplacer le texte si besoin.
- Output structuré via JSON strict (déjà en place). Pas de nouveau modèle, on garde Flash pour le coût/latence.
- Conserver fallback si Gemini ne renvoie pas crop/index → comportement actuel.

### 2. Association image ↔ variante automatique
Fichier : `src/routes/admin.shops_.$shopId.products.new.tsx` (dialog Apply)

- Après réponse Gemini : pour chaque variante, on récupère le `File` correspondant à `sourceImageIndex`.
- Si l'image n'est pas encore dans la galerie produit, on l'ajoute (en réutilisant le pipeline upload existant — pas de nouveau chemin réseau).
- On stocke l'URL résultante dans `variant.imageUrl` (champ déjà existant et utilisé par l'aperçu 👁).
- Si plusieurs variantes pointent vers la même image → OK, partage autorisé.

### 3. Nettoyage automatique côté client (canvas)
Nouveau helper : `src/lib/image-clean.ts`

- Fonction `cleanProductImage(file, cropHint?)` :
  - décode via `createImageBitmap` (rapide, off-main-thread quand supporté),
  - applique le `cropHint` Gemini si présent, sinon heuristique simple : crop bandeau bas 12 % si la luminance moyenne y est < seuil (bande noire prix typique Taobao),
  - downscale max 1400 px côté long,
  - réencode JPEG q=0.82,
  - retourne `Blob` + `objectURL` géré par `useObjectUrls` (pas de fuite).
- Pas de masquage de texte par pixels (trop coûteux mobile) — on se contente du crop. Le texte FR de la variante est affiché en overlay UI quand on prévisualise (badge sous l'image), donc le client voit toujours "Abeille" et pas 蜜蜂.

### 4. Performance / stabilité
- Tout le nettoyage tourne dans une **queue séquentielle** (`for…of` + `await`) — pas de `Promise.all` sur 25 images qui ferait freezer le mobile.
- Cache mémoire `Map<fileHash, Blob>` par session pour ne pas re-traiter deux fois la même image (hash = `size + lastModified + name`).
- Mode sûr existant respecté : si `admin:ocr-disabled` ou `< 640 px` + mémoire faible → on saute le nettoyage canvas, on garde juste l'association d'image brute.
- Timeout 45 s déjà en place sur l'OCR — on garde. Ajout d'un timeout 8 s par image dans `cleanProductImage` pour éviter blocage navigateur.
- Tout passe par `ErrorBoundary` + `useObjectUrls` existants → aucune régression sur l'écran blanc.

### 5. Traduction / labels
- Le nom de variante affiché vient déjà de Gemini en français. On garde `chineseLabel` côté admin (collapsable) pour permettre la vérif manuelle, mais **jamais affiché côté client**.

## Notes techniques

- Aucun changement DB : on réutilise `variant.imageUrl` (déjà nullable dans le schéma actuel).
- Aucun nouveau secret : Gemini déjà branché via `LOVABLE_API_KEY`.
- Aucun nouveau package : `createImageBitmap` + Canvas2D natifs.
- `attachSupabaseAuth` et `requireSupabaseAuth` déjà en place sur la serverFn.
- Fichiers touchés : 2 modifiés (`admin-generator.functions.ts`, `admin.shops_.$shopId.products.new.tsx`) + 1 nouveau (`src/lib/image-clean.ts`).

## Hors-scope (refusé volontairement)

- Pas de suppression pixel-par-pixel de texte chinois (lourd, fragile, inutile vu qu'on crop + overlay FR).
- Pas de modèle vision plus cher (Pro) tant que Flash suffit.
- Pas de traitement en Web Worker dans cette itération (ajoutable plus tard sans changer l'API).