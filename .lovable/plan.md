# Refonte du système de bannières

## Objectif
Remplacer la gestion actuelle (upload + lien + ordre) par un véritable éditeur de bannières e-commerce avec recadrage par viewport, contenu (titre/description/CTA), et configuration du slider.

## 1. Schéma BDD (migration)

Étendre `home_banners` :

```text
home_banners
├─ image_url              (existant)
├─ title, title_i18n      (existant — réutilisé pour titre overlay)
├─ link_url               (existant — réutilisé pour CTA)
├─ position, enabled      (existant)
├─ subtitle, subtitle_i18n        text / jsonb     (nouveau)
├─ cta_label, cta_label_i18n      text / jsonb     (nouveau)
├─ text_align              text   'left'|'center'|'right'   default 'left'
├─ text_color              text   default '#ffffff'
├─ overlay_opacity         numeric (0..1) default 0.35
├─ height_mobile           int    default 220   (px)
├─ height_tablet           int    default 320
├─ height_desktop          int    default 480
├─ object_fit              text   'cover'|'contain'|'fill'   default 'cover'
├─ focal_x                 numeric (0..1) default 0.5    -- position image
├─ focal_y                 numeric (0..1) default 0.5
├─ zoom                    numeric default 1.0          -- 1.0 .. 3.0
├─ rotation                int    default 0             -- 0/90/180/270
├─ image_url_mobile        text   nullable   -- override mobile
└─ image_url_tablet        text   nullable

site_settings (slider config global) — nouveaux champs :
├─ banner_autoplay         boolean default true
├─ banner_interval_ms      int     default 4500
├─ banner_transition       text    'fade'|'slide'  default 'slide'
├─ banner_show_arrows      boolean default true
└─ banner_show_dots        boolean default true
```

Toutes les colonnes sont nullable / ont un default → pas de rupture avec les bannières existantes.

## 2. UI Admin — `BannersManager` (refonte)

Nouvelle structure dans `src/routes/admin.settings.tsx` (composant extrait dans `src/components/admin/BannersManager.tsx`) :

- **Liste** : cartes draggables (réordonner via boutons ↑↓ + drag handle), toggle activer/désactiver, badge ordre.
- **Bouton "Nouvelle bannière"** → ouvre `BannerEditorDialog`.
- **Bouton "Paramètres du slider"** → modal de réglages globaux (autoplay, vitesse, flèches, dots, transition).

### `BannerEditorDialog` (cœur de la feature)

Dialog plein écran avec 3 onglets :

**Onglet 1 — Image**
- Upload (drag & drop + bouton mobile/desktop).
- Éditeur visuel (viewport simulé 16/9 par défaut) :
  - Zoom slider (0.5x → 3x)
  - Rotation (boutons 90°)
  - Position image : drag sur le canvas → met à jour focal_x / focal_y (point focal CSS `object-position`)
  - Sélecteur ratio prévisualisation (mobile/tablette/desktop)
- Mode d'affichage : cover / contain / fill
- Upload optionnel d'une variante **mobile** et **tablette** (pour images différentes par device).

**Onglet 2 — Contenu**
- Titre, sous-titre, libellé du bouton, URL de redirection
- Alignement du texte (gauche/centre/droite)
- Couleur du texte + opacité de l'overlay sombre (slider)

**Onglet 3 — Dimensions**
- Hauteur en px par breakpoint : mobile / tablette / desktop (sliders 120-800).
- Aperçu en direct des 3 viewports côte à côte.

Footer du dialog : "Annuler" / "Enregistrer". L'aperçu utilise le même composant `<BannerSlide>` que le front (cf. §3) pour garantir un rendu fidèle.

## 3. Front — `HeroCarousel` (refonte)

`src/components/home/HeroCarousel.tsx` réécrit :

- Utilise embla-carousel-react (déjà standard dans shadcn) → flèches, dots, autoplay, transition fade/slide selon `site_settings`.
- Sélection automatique de `image_url_mobile/tablet/desktop` selon breakpoint (avec fallback).
- Chaque slide rendu par `<BannerSlide banner={…} />` partagé entre admin (preview) et front :
  - `height` selon viewport (CSS responsive via classes Tailwind dynamiques + style inline pour les valeurs sur-mesure)
  - `object-fit` + `object-position: ${focal_x*100}% ${focal_y*100}%`
  - `transform: scale(zoom) rotate(rotation)`
  - Overlay assombri configurable
  - Titre / sous-titre / CTA (bouton primary) avec alignement
  - Lien cliquable sur toute la slide si `link_url` sans CTA

Le carrousel se masque si aucune bannière activée.

## 4. Dépendances

- `react-easy-crop` (~16 kB gzip) pour le canvas drag/zoom intuitif — alternative légère à un crop maison.
- (embla-carousel-react est déjà inclus via shadcn `Carousel`.)

## 5. Fichiers touchés

- **migration SQL** : ALTER `home_banners` + `site_settings`
- **nouveau** `src/components/admin/BannersManager.tsx`
- **nouveau** `src/components/admin/BannerEditorDialog.tsx`
- **nouveau** `src/components/home/BannerSlide.tsx` (rendu partagé)
- **modifié** `src/components/home/HeroCarousel.tsx`
- **modifié** `src/routes/admin.settings.tsx` (remplace `BannersManager` inline)
- **modifié** `src/hooks/use-site-settings.ts` (étendre type `HomeBanner` + lire nouveaux champs site_settings)

## Notes
- Le recadrage est non-destructif : on stocke focal/zoom/rotation, l'image originale reste intacte → on peut re-régler à tout moment.
- Aucune fonction serveur nécessaire : tout passe par le client Supabase + RLS admin existante.
- Pas de changement aux RLS (lecture publique déjà OK).
