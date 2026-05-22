## Problème

1. **Upload impossible** (`new row violates row-level security policy`) — La carte « Image de la boutique » envoie les fichiers dans le dossier `shops/{shopId}` du bucket `site-assets`, mais les règles d'accès n'autorisent que le dossier `vendors/{auth.uid()}` pour les vendeurs (les admins ont accès partout). Donc un vendeur ne peut jamais uploader son logo/bannière depuis ses paramètres.
2. **Design médiocre** — La carte affiche deux gros uploaders empilés (bannière puis logo), avec entête peu hiérarchisé et zones grises ternes. Sur mobile (384px) c'est lourd et peu lisible.

## Correctifs

### 1. Storage — autoriser le dossier de la boutique du vendeur
Migration ajoutant 3 policies sur `storage.objects` pour le bucket `site-assets`, dossier racine `shops/{auth.uid()}` (INSERT / UPDATE / DELETE). Les policies admin existantes restent inchangées et continuent de couvrir l'admin gérant une boutique admin.

### 2. `ShopBrandingSettings.tsx` — redesign + bon dossier
- Changer le `folder` passé à `SmartImageUpload` de `shops/${shopId}` à `vendors/${shopId}` pour les vendeurs (couvert par la policy existante), et conserver `shops/${shopId}` pour les admins (couvert par la policy admin). En pratique : `folder={isAdmin ? \`shops/${shopId}\` : \`vendors/${shopId}\`}`.
- Nouveau layout :
  - Aperçu visuel « hero » en haut : bannière en fond (ratio 3/1) avec le logo rond superposé en bas-gauche, comme une vraie fiche boutique. Si pas d'image → placeholder dégradé doux avec icône.
  - Sous l'aperçu, deux boutons compacts « Changer la bannière » / « Changer le logo » (et « Supprimer » si présent) qui déclenchent les uploaders cachés.
  - En-tête plus net : titre + petit badge « Visible publiquement ».
  - Spinner global pendant sauvegarde.
- Reste basé sur `SmartImageUpload` (compression auto conservée), juste rendu de façon plus moderne.

### 3. QA
- Tester upload logo + bannière en tant que vendeur depuis `/vendor/settings` → plus d'erreur RLS.
- Vérifier que l'admin garde la possibilité d'uploader depuis `/admin/shops/.../manage`.
- Vérifier le rendu sur 384px.

## Fichiers touchés
- migration Storage (nouvelles policies `site_assets_shop_owner_*`)
- `src/components/shop/ShopBrandingSettings.tsx` (redesign + bon folder)

Aucune autre fonctionnalité, route ou logique métier modifiée.