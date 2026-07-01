# Centre de partage marketing KawZone

Objectif : transformer chaque partage produit en outil marketing pro. Un vrai centre, pas un bouton.

## Expérience utilisateur

Un bouton **Partager** sur chaque fiche produit (et sur la carte produit) ouvre un **ShareCenter** (Sheet plein écran mobile / modal desktop) organisé en 3 onglets :

1. **Envoyer** — WhatsApp, Facebook, Messenger, Telegram, X/Twitter, Email, SMS, Copier le lien. Message pré-rédigé attractif (nom, prix, promo, CTA, lien tracké).
2. **Visuels** — Génération à la volée de visuels téléchargeables :
   - Affiche marketing (1080×1350, format Feed Instagram/Facebook)
   - Story verticale (1080×1920, WhatsApp/IG/FB Story)
   - Carré (1080×1080)
   - Miniature WhatsApp (600×600 optimisée aperçu)
   Chaque visuel contient : photo produit, nom, prix (barré si promo), badge promo, logo KawZone, mention "Acheter maintenant" + URL courte + QR code discret.
3. **QR & Lien** — QR Code haute résolution téléchargeable (PNG/SVG), lien court copiable, aperçu Open Graph.

## Architecture technique

### Génération visuels (côté client, zéro coût serveur)
- `html2canvas` + composant React `<ProductPoster />` rendu offscreen dans un template stylé (dégradé de marque, photo cover, prix XXL, badge promo, logo, QR).
- 4 templates dimensionnés via CSS. Bouton "Télécharger" → `html2canvas` → `canvas.toBlob()` → download.
- QR code via `qrcode` (lib légère).

### Tracking / attribution
- Chaque lien partagé ajoute `?ref=share&via=<platform>&sid=<userIdOrAnon>` pour analytique future (aucune table nouvelle maintenant, juste params dans l'URL).

### Meta OG côté route produit
- Vérifier/renforcer `head()` de `src/routes/product.$productId.tsx` : `og:image` = première image produit, `og:title` = nom + prix, `og:description` = description courte, `twitter:card = summary_large_image`. Garantit un aperçu riche sur WhatsApp/FB/Telegram.

### Messages plateformes
- Utilitaire `buildShareMessage(product, platform)` : formats adaptés (WhatsApp = emojis + saut de ligne ; X = 280 chars ; Email = sujet + corps HTML).
- Deep links natifs :
  - WhatsApp : `https://wa.me/?text=...`
  - Facebook : `https://www.facebook.com/sharer/sharer.php?u=...`
  - Messenger : `fb-messenger://share?link=...` avec fallback web
  - Telegram : `https://t.me/share/url?url=...&text=...`
  - X : `https://twitter.com/intent/tweet?text=...&url=...`
  - Email : `mailto:?subject=...&body=...`
  - SMS : `sms:?body=...`
- API Web Share native (`navigator.share`) proposée en premier sur mobile si dispo.

## Fichiers

Nouveaux :
- `src/components/share/ShareCenter.tsx` — Sheet/Modal principal avec les 3 onglets.
- `src/components/share/ShareButton.tsx` — Bouton réutilisable qui ouvre le centre.
- `src/components/share/PosterTemplate.tsx` — Composants visuels (Poster, Story, Square, Thumb).
- `src/components/share/QrBlock.tsx` — Génération/téléchargement QR.
- `src/lib/share/messages.ts` — Builders de messages par plateforme.
- `src/lib/share/links.ts` — Deep links + tracking params.
- `src/lib/share/download.ts` — Helper html2canvas → PNG.

Modifiés :
- `src/routes/product.$productId.tsx` — insertion du `<ShareButton />` proéminent + renforcement `head()` OG.
- `src/components/product/ProductCard.tsx` — petit bouton share secondaire (icône) à côté du "quick add".

## Dépendances
- `html2canvas` (~45 KB gz)
- `qrcode` (~15 KB gz)

## Périmètre volontairement exclu (proposable plus tard)
- Tracking analytique persistant (table share_events)
- Codes de parrainage / commission influenceur
- Génération vidéo courte
- Personnalisation du message par l'utilisateur avant envoi (v2)

## Question rapide
Aucune bloquante — je propose une palette poster alignée sur les tokens KawZone (primary + gradient existant). Si tu veux une identité visuelle spécifique pour les affiches (couleur dominante, style "premium sombre" vs "clair coloré"), dis-le, sinon je pars sur la charte actuelle.
