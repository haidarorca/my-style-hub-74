## Objectif

Permettre aux vendeurs et admins d'importer/exporter en masse les produits + variantes via Excel/CSV, avec import groupé d'images via ZIP, sans répéter les infos communes et sans casser le formulaire existant.

## Périmètre (v1)

- **Produits + variantes** (parent/enfant via `Code produit`).
- **Images via ZIP** avec système d'Image IDs stables (IMG001, IMG002…).
- **Catégories et boutiques** : résolues par nom/slug existants (pas créées par l'import — sécurité).
- **Hors v1** (à signaler) : import de nouvelles catégories et nouvelles boutiques (création) — restera manuel pour éviter pollution. Confirmable plus tard.

## Architecture

### Nouvelle page
`src/routes/admin.shops_.$shopId.import-export.tsx` (admin/boutique admin)
`src/routes/vendor.import-export.tsx` (vendeur)

Une UI partagée : `src/components/import-export/ImportExportPanel.tsx` avec props (scope: 'vendor' | 'admin', shopId).

### Onglets
1. **Exporter** — filtres (catégorie, sous-cat, statut, pays, commission, boutique côté admin) → bouton "Télécharger Excel".
2. **Importer** — upload `.xlsx`/`.csv` + ZIP images optionnel → prévisualisation → confirmation.
3. **Modèle** — bouton "Télécharger modèle vide" + "Exporter structure type".
4. **Historique** — liste des imports passés (table `product_imports`).

### Server functions (nouveau fichier `src/lib/import-export.functions.ts`)

- `exportProducts({ scope, filters })` → renvoie un Blob Excel (xlsx via `exceljs`, déjà compatible Worker — sinon `xlsx` lib légère).
- `previewImport({ fileContent, imageManifest })` → parse, valide, renvoie diff (nouveaux, MAJ, erreurs ligne par ligne).
- `commitImport({ importId })` → applique les changements après confirmation utilisateur.
- `uploadImportImages({ zipFile })` → décompresse côté serveur, upload sur Supabase Storage bucket `product-imports`, renvoie map `{ IMG001: publicUrl }`.

### Storage
- Bucket existant `product-images` réutilisé pour stockage final.
- Nouveau bucket `product-imports` (temporaire, RLS vendor/admin) pour ZIP staging.

### Nouvelle table `product_imports`
Colonnes : id, user_id, scope (vendor/admin), shop_id, file_name, status (preview/committed/failed), summary jsonb (counts), errors jsonb, created_at, committed_at.

## Structure Excel

### Colonnes (ordre fixe)
```
Type | Action | Code produit | Code variante | Boutique | Désignation | Nom |
Description | Catégorie | Sous-catégorie | Sous-sous-catégorie | Prix affiché |
Prix variante | Stock | Nom option 1 | Valeur option 1 | Nom option 2 |
Valeur option 2 | Nom option 3 | Valeur option 3 | Images produit |
Image variante | Pays livraison | Statut
```

### Règles de parsing
- `Type` = `parent` | `variant`.
- Lignes `variant` héritent de la ligne `parent` la plus récente avec le même `Code produit` (pas besoin de répéter désignation/description/catégorie).
- `Action` ∈ {`create`, `update`, `delete`, `ignore`}.
- Couleur/Taille extraites des paires "Nom option N / Valeur option N" — mappage souple (Couleur→color, Taille→size, autre→color_hex ignoré v1).
- `Images produit` = liste séparée par virgules d'Image IDs (IMG001,IMG002).
- `Image variante` = un seul Image ID.

## Logique Image ID

- Pendant l'export : chaque URL existante reçoit un Image ID stable (hash court de l'URL) noté dans le fichier.
- Pendant l'import :
  1. L'utilisateur upload le ZIP en parallèle.
  2. Le serveur dézippe, calcule pour chaque fichier l'Image ID = basename sans extension (`IMG001.jpg` → `IMG001`).
  3. Upload sur `product-images` avec le nom `{shopId}/{importId}/{imageId}.{ext}`.
  4. Map `{IMG001 → publicUrl}` injectée lors du commit.
- Si un Image ID référencé dans Excel n'existe pas dans le ZIP **et** n'est pas une URL existante du produit → erreur ligne.

## Validation (preview)

Chaque ligne produit un objet `{row, severity, field, message}`. Vérifs :
- Champs requis selon action.
- Code produit/variante unicité dans le fichier.
- Catégorie/sous-cat existante (sinon erreur).
- Boutique existante + droits (vendeur ne peut écrire que sur sa boutique).
- Prix numérique > 0, stock entier ≥ 0.
- Statut autorisé (vendeur → forcé `pending` quoi qu'il arrive ; admin libre).
- Images : tous les IDs résolus.
- Doublons Code variante.

Résumé : `{ totalRows, parents, variants, toCreate, toUpdate, toDelete, errors, warnings }`.

## Commit

Transactionnel par produit (try/catch par parent). Si une variante échoue, le produit parent reste cohérent (rollback ses propres variantes). Logs détaillés dans `product_imports.errors`.

Vendeur : `status='pending'` forcé. Admin : valeur du fichier respectée.

## UI flow (mobile-first)

1. Page d'accueil avec 4 cartes : Exporter / Importer / Modèle / Historique.
2. Importer : drop file → loader parse → tableau prévisualisation (verts = create, bleus = update, rouges = erreurs).
3. Bouton "Confirmer l'import (N produits)" désactivé tant qu'il reste des erreurs bloquantes.
4. Après commit : toast + redirection vers historique.

## Technique

- Lib Excel : **`exceljs`** (compatible Cloudflare Worker via WASM-free build) — sinon fallback `xlsx` (SheetJS community).
- Lib ZIP : **`jszip`** (pur JS, OK Worker).
- Tout passe par `createServerFn` avec `requireSupabaseAuth`.
- Limites : 5000 lignes / 100 MB ZIP côté serveur (refus poli au-delà).
- Streaming : non v1 (acceptable jusqu'à 5k lignes).

## Fichiers touchés

**Nouveaux**
- `src/lib/import-export.functions.ts`
- `src/lib/import-export-schema.ts` (constantes colonnes + Zod row schema)
- `src/components/import-export/ImportExportPanel.tsx`
- `src/components/import-export/ImportPreviewTable.tsx`
- `src/components/import-export/ExportFilters.tsx`
- `src/routes/admin.shops_.$shopId.import-export.tsx`
- `src/routes/vendor.import-export.tsx`
- Migration : table `product_imports` + bucket `product-imports`.

**Modifiés**
- `src/routes/admin.tsx` (lien menu)
- `src/routes/vendor.tsx` (lien menu)
- `package.json` (`exceljs`, `jszip`)

## Hors-scope explicite v1

- Création de catégories par l'import (sécurité — pollution).
- Création de boutiques par l'import.
- Import de personnalisations (fonts, couleurs autorisées) — colonne ignorée si présente, ajoutée v2.
- Import de codes-barres scannables — réutilise `code` produit existant.
- Update partiel d'images (v1 : replace complet de la galerie si colonne fournie, sinon ignore).

## Confirmation demandée

Avant de coder, je voudrais valider :
1. **Lib Excel** : OK pour `exceljs` (plus pro mais ~500KB) ou préférence pour `xlsx` (plus léger) ?
2. **Catégories** : confirmer qu'on **n'autorise pas** la création par import (refuser ligne si catégorie inconnue) ?
3. **Personnalisations produit** (polices/couleurs/messages) : v2 ou bloquant pour v1 ?
