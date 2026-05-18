## Objectif

Mettre en place un système professionnel et entièrement configurable de :
- Service client centralisé (WhatsApp, email, formulaire)
- Messagerie interne (tickets) client ↔ boutique ↔ admin
- Contrôle granulaire des contacts (site / boutique / produit / commission)
- Protection stricte des coordonnées vendeur quand commission active (sécurité backend, pas juste UI)

## Périmètre (v1)

Inclus :
- Tables support / messagerie + RLS strictes
- Réglages globaux + par boutique + par produit
- Logique automatique commission → contact vendeur masqué côté API
- Centre support admin (liste, filtres, réponse, assignation, transfert, notes)
- Espace messages vendeur (déjà existant en stub) → vrai
- Boutons contextuels client (WhatsApp / Message / Service client)
- Notifications + compteurs non-lus

Hors v1 (mentionné pour suite) :
- Réponses automatiques avancées (templates oui, AI auto-reply non)
- Telegram / Messenger : on stocke les liens et on affiche les boutons, pas d'intégration API
- Webhook WhatsApp Business API (juste deeplinks `wa.me` v1)

## Architecture

### 1. Base de données (migration)

**Table `contact_settings`** (singleton id='main', réglages globaux)
- whatsapp_support_numbers jsonb (liste { label, number, country_id, enabled })
- support_emails jsonb
- telegram_url, messenger_url
- support_hours_i18n jsonb, auto_reply_message_i18n jsonb
- support_enabled, whatsapp_enabled, internal_messaging_enabled, vendor_contact_enabled (booleans globaux)
- commission_hides_vendor_contact bool (défaut true) — switch maître protection commission
- default_assigned_admin_ids uuid[]

**Extension `profiles`** (boutique)
- contact_mode enum ('direct', 'internal_only', 'admin_only', 'blocked', 'after_order_only')
- show_whatsapp bool, show_email bool, show_phone bool, show_address bool (par défaut false si commission)
- assigned_support_admin_ids uuid[]

**Extension `products`**
- contact_override enum ('inherit', 'allowed', 'blocked', 'support_only')

**Table `support_conversations`**
- id, subject, status (new/open/answered/closed/urgent), priority (low/normal/high/urgent)
- client_id, vendor_id (nullable), product_id (nullable), order_id (nullable)
- assigned_admin_id, type ('client_support', 'client_vendor', 'vendor_admin')
- is_commission_protected bool (snapshot au moment de création)
- last_message_at, unread_count_client, unread_count_vendor, unread_count_admin
- created_at, updated_at, closed_at

**Table `support_messages`**
- conversation_id, sender_id, sender_role enum, body, attachments jsonb
- is_internal_note bool (visible admins only), read_by jsonb

**Table `support_admin_assignments`**
- conversation_id, admin_id, assigned_at, assigned_by

### 2. RLS — protection stricte coordonnées vendeur

**Vue `public_vendor_contacts`** (SECURITY DEFINER) qui retourne whatsapp/email/phone/address **uniquement si** :
- `commission_hides_vendor_contact = false` OU
- vendeur en mode `no_commission` OU
- override admin pour la boutique

Tous les composants front lisent cette vue, pas `profiles` directement, pour les champs sensibles.

**Fonction `can_contact_vendor(_client_id, _vendor_id, _product_id)`** retourne enum résolu (direct/internal/support_only/blocked) en combinant : global → boutique → produit → commission.

### 3. Server functions (`src/lib/support.functions.ts`)

- `getContactPolicy({ vendorId, productId })` → résout règles, renvoie ce que le client a le droit de voir
- `getPublicVendorContacts({ vendorId })` → coordonnées filtrées (via vue)
- `createConversation({ vendorId?, productId?, orderId?, subject, body, type })` → nouvelle conv
- `replyConversation({ conversationId, body, attachments?, isInternalNote? })`
- `listConversations({ scope: 'client'|'vendor'|'admin', filters })`
- `assignConversation`, `transferConversation`, `closeConversation`, `setPriority`, `markRead`
- `getContactSettings`, `updateContactSettings` (super admin)
- `updateShopContactPolicy({ shopId, ... })` (admin)

Toutes protégées par `requireSupabaseAuth` + vérifications de rôle. Les server fns ne retournent JAMAIS les coordonnées vendeur si la policy l'interdit, même pour un admin client.

### 4. Composants UI

**Côté client** (`src/components/support/`)
- `ContactActions.tsx` — boutons contextuels (WhatsApp support, message boutique, service client) selon `getContactPolicy`
- `VendorContactCard.tsx` — affiche uniquement champs autorisés (basé sur server response, pas masquage CSS)
- `NewConversationDialog.tsx` — créer un ticket
- `ConversationView.tsx` — thread message

**Routes**
- `src/routes/_authenticated/messages.tsx` — boîte messages client
- `src/routes/_authenticated/messages.$conversationId.tsx`
- `src/routes/support.tsx` — page contact public (FAQ + WhatsApp + formulaire)
- `src/routes/vendor.messages.tsx` — refonte (remplace stub existant)
- `src/routes/admin.support.tsx` — centre support (liste + filtres + assignation)
- `src/routes/admin.support.$conversationId.tsx` — détail conversation
- `src/routes/admin.contact-settings.tsx` — réglages globaux + matrice par boutique

**Admin shop manage** (édition par boutique) : nouvel onglet "Contact" dans `admin.shops_.$shopId.manage.tsx` pour overrides par boutique (mode, visibilité champs, admins assignés).

### 5. Notifications + badges

- Trigger Postgres → `notifications` à chaque nouveau message
- Compteurs non-lus dans `AppHeader`, `MobileBottomNav`, sidebar admin
- Realtime sur `support_messages` pour live update

### 6. WhatsApp deeplinks

Helper `src/lib/whatsapp.ts` (existe déjà) étendu :
- `buildSupportLink({ context: 'product'|'order'|'general', product?, order? })`
- Sélectionne le bon numéro support (général / pays / commission) depuis `contact_settings`
- Préremplit message selon contexte et langue active

## Sécurité (point critique)

1. Les colonnes `phone`, `shop_whatsapp`, `email`, `address` de `profiles` **ne sont jamais sélectionnées** par les requêtes publiques. RLS interdit aux non-admins/non-propriétaires de les lire.
2. Une vue dédiée `public_vendor_contacts` applique la logique commission côté DB.
3. `ProductCard`, page produit, page boutique : suppression des `select('*')` sur profiles → projection explicite via server fn.
4. Audit migration : revoke select sur colonnes sensibles, recréer policies projetées.

## Fichiers touchés

**Nouveaux**
- Migration SQL (table contact_settings, support_conversations, support_messages, ajout colonnes profiles/products, vue + fonctions)
- `src/lib/support.functions.ts`
- `src/lib/contact-policy.ts` (types partagés)
- `src/components/support/ContactActions.tsx`
- `src/components/support/VendorContactCard.tsx`
- `src/components/support/ConversationView.tsx`
- `src/components/support/NewConversationDialog.tsx`
- `src/routes/_authenticated/messages.tsx` + `.$conversationId.tsx`
- `src/routes/support.tsx`
- `src/routes/admin.support.tsx` + `.$conversationId.tsx`
- `src/routes/admin.contact-settings.tsx`

**Modifiés**
- `src/routes/vendor.messages.tsx` (remplacement stub)
- `src/routes/admin.shops_.$shopId.manage.tsx` (onglet Contact)
- `src/routes/shop.$vendorId.tsx`, `src/routes/product.$productId.tsx` (utiliser getContactPolicy/VendorContactCard)
- `src/components/layout/AppHeader.tsx`, `MobileBottomNav.tsx` (badges messages)
- `src/lib/whatsapp.ts` (helpers contextuels)
- `src/routes/admin.tsx`, `src/routes/vendor.tsx` (entrées menu)
- `src/hooks/use-auth.tsx` (nouvelle permission `manage_support`)

## Étapes d'exécution

1. Migration DB + RLS + vue + fonctions résolution policy
2. Server functions support + types
3. UI admin (réglages + centre support)
4. UI client (page support, ContactActions, messagerie)
5. UI vendeur (refonte messages)
6. Intégration produit/boutique (VendorContactCard sécurisé)
7. Notifications + badges + realtime
8. Tests : commission → coordonnées masquées dans API ; sans commission → tout visible si autorisé

## Questions avant de coder

1. **WhatsApp Business API** : v1 = simples `wa.me` deeplinks (gratuit, ouvre app du client). Tu confirmes ? (API officielle = payante + setup Meta)
2. **Pièces jointes messages** : autoriser upload (images uniquement, 5 MB max) dans la messagerie interne v1 ?
3. **Mode par défaut nouvelles boutiques commission** : `support_only` (client ↔ admin seulement) ou `internal_only` (messagerie interne, admin voit tout) ?
4. **Page `/support` publique** : accessible sans login ? (formulaire crée un ticket avec email seulement, pas de compte requis)
