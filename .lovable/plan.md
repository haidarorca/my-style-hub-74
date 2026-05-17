# Système professionnel de modération des produits

Refonte de la page admin de validation des produits en un vrai workflow de modération étape par étape, avec édition, motifs structurés, notifications et envoi WhatsApp.

## 1. Base de données

Nouvelles tables :

- **`moderation_reason_templates`** — bibliothèque de motifs prédéfinis et personnalisés
  - `step` (enum : name, code, designation, description, category, subcategory, images, price, stock, variants, countries, global)
  - `label` (texte du motif)
  - `video_url` (optionnel)
  - `is_default` (motifs livrés par défaut vs créés par l'admin)
  - `created_by`, `position`, `is_enabled`

- **`product_moderation_feedback`** — feedback structuré envoyé au vendeur
  - `product_id`, `vendor_id`, `admin_id`
  - `decision` (approved, rejected, changes_requested)
  - `global_message`
  - `created_at`

- **`product_moderation_feedback_items`** — détail par étape
  - `feedback_id`, `step`, `reason_text`, `video_url`

Politiques RLS : admin lit/écrit tout ; vendeur lit son propre feedback ; templates publics en lecture pour les admins seulement.

Seed initial avec les motifs donnés en exemple (nom, catégorie, images).

## 2. Server functions (`src/lib/admin-moderation.functions.ts`)

- `getProductForModeration(productId)` — produit complet avec images, variantes, catégorie, pays, customizations, infos vendeur
- `updateProductAsAdmin(productId, patch)` — admin peut corriger n'importe quel champ avant validation (réutilise `supabaseAdmin`)
- `listReasonTemplates(step?)` — chargement à la demande par étape
- `createReasonTemplate({step, label, video_url})` — sauvegarder un motif perso
- `submitModerationDecision({product_id, decision, items[], global_message, notify_vendor})` — applique le statut, écrit le feedback, crée une notification structurée pour le vendeur

## 3. Interface admin

### Page liste (`/admin/products`)
- Ajout d'un bouton **Examiner** sur chaque ligne → ouvre la page de détail.

### Page détail (`/admin/products/$productId/moderate`)
Layout responsive mobile-first, deux colonnes sur desktop :

**Colonne gauche — aperçu et édition du produit**
- Carrousel images (avec suppression/ajout)
- Champs éditables inline : nom, code, désignation, description, prix, stock, catégorie, sous-catégorie, pays de livraison, variantes
- Bouton **Enregistrer modifications**

**Colonne droite — panneau de modération**
- 3 boutons d'action : **Approuver** / **Demander modification** / **Rejeter**
- Liste des étapes du formulaire, chacune avec :
  - case à cocher
  - quand cochée → liste déroulante chargée à la demande (lazy) avec les motifs de CETTE étape uniquement
  - sélection multiple de motifs
  - bouton **+ Ajouter un motif personnalisé** (champ texte + URL vidéo optionnel)
- Section **Message global** indépendante (même mécanisme)
- Prévisualisation du message final
- Boutons : **Envoyer la décision** et **Envoyer par WhatsApp**

### Bouton WhatsApp
Construit un message texte propre et bien hiérarchisé à partir des motifs cochés, puis ouvre `https://wa.me/<vendor_phone>?text=...`.

## 4. Notification vendeur

À l'envoi de la décision :
- Insertion dans `notifications` (titre, message structuré, lien vers le produit)
- Mise à jour du `products.status` + `rejection_reason` (résumé compact pour compatibilité)
- Le feedback détaillé reste consultable via la page produit côté vendeur (déjà existante, affiche `product_moderation_feedback`)

## 5. Performance et UX mobile

- Listes de motifs chargées **uniquement** quand l'étape est cochée (TanStack Query `enabled`)
- Vidéos = liens cliquables, jamais d'iframe
- Mise en cache des templates par étape pour éviter les rechargements
- Cases à cocher larges, boutons gros pour le tactile
- États de chargement et toasts de confirmation

## Détails techniques

- Hook `useReasonTemplates(step)` avec `enabled: checked === true`
- `submitModerationDecision` est transactionnelle côté serveur (un seul handler qui fait tout)
- La page liste actuelle (`admin.products.tsx`) reste fonctionnelle, juste enrichie d'un lien Examiner
- Aucun changement de logique de visibilité / pays (corrections précédentes préservées)
- WhatsApp : si `profiles.phone` manquant, désactiver le bouton avec tooltip

Confirme-moi pour que je lance la migration SQL puis l'implémentation.
