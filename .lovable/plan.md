
## Objectif

Le mode commission devient une décision admin. Les commandes contenant des produits commission ne vont plus au WhatsApp du vendeur mais à un WhatsApp admin dédié. L'admin gère ensuite ces commandes dans un nouveau dashboard et peut "forwarder" la préparation au vendeur par WhatsApp, sans exposer l'identité du client.

## 1. Base de données (migration)

- `site_settings` : ajouter `commission_whatsapp_number TEXT` (numéro admin dédié aux commandes commission, modifiable n'importe quand).
- `orders` : ajouter `is_commission BOOLEAN DEFAULT false` + `forwarded_to_vendor_at TIMESTAMPTZ`.
- Trigger `set_order_is_commission` après insert/update sur `order_items` : marque `orders.is_commission = true` si au moins un item a `commission_amount > 0`.
- RLS `orders_vendor_read` et `oi_read` inchangées (le vendeur a besoin de voir la commande pour la préparer), mais masquage des champs PII fait au niveau UI vendeur (`customer_name`, `customer_phone`, `address`, `city`, `note`) quand `is_commission = true`.

## 2. Vendeur — retrait du choix commission

- `src/routes/vendor.settings.tsx` : supprimer entièrement le bloc "Mode commission" (champ `vendor_mode`). Le vendeur garde seulement le pays d'origine. `vendor_mode` reste affichable en lecture seule sous forme de badge informatif ("Mode : Sans commission" / "Avec commission — géré par la plateforme").
- `src/routes/vendor.orders.tsx` : pour chaque commande où `is_commission = true` :
  - masquer nom, téléphone, adresse, ville, note → afficher seulement `#numéro de commande` + produits + variantes + personnalisation.
  - cacher le bouton WhatsApp client.
  - afficher un badge "Commande plateforme — infos client gérées par l'admin".

## 3. Admin — paramètres

- `src/routes/admin.settings.tsx` : ajouter un champ "Numéro WhatsApp commission" (avec sélecteur pays comme les autres). Sauvegardé dans `site_settings.commission_whatsapp_number`.
- `src/routes/admin.vendors.tsx` : ajouter un toggle "Mode commission" par vendeur (déjà partiellement présent ? sinon ajout d'un Switch qui update `profiles.vendor_mode`).

## 4. Admin — nouveau dashboard `/admin/commission-orders`

Nouveau fichier `src/routes/admin.commission-orders.tsx` :
- Liste paginée serveur des commandes avec `is_commission = true`.
- Filtres : statut, recherche (numéro, nom client, téléphone, produit).
- Pour chaque commande : infos client complètes + items + montant commission total.
- Boutons d'action :
  - **WhatsApp client** (avec le numéro client).
  - **Envoyer au vendeur** : ouvre WhatsApp du vendeur avec un message contenant uniquement `#numéro commande + produits + quantités + variantes + personnalisation` (zéro PII client). Met à jour `forwarded_to_vendor_at`.
  - Changement de statut (admin a tous les droits via RLS existante).
- Badge "Envoyé au vendeur le …" quand `forwarded_to_vendor_at` est rempli.
- Ajout au menu admin (`src/routes/admin.tsx`).

## 5. Routage WhatsApp à la commande

- `src/routes/cart.tsx` (checkout) : avant de générer l'URL WhatsApp, détecter si au moins un item du panier est commission (via `get_display_prices` qui retourne `commission_amount`). Si oui → router vers `site_settings.commission_whatsapp_number` au lieu du numéro vendeur/site. Sinon comportement actuel.
- Helper dans `src/lib/whatsapp.ts` : nouveau `whatsappUrlForOrder(message, { isCommission })` qui choisit le bon numéro.

## 6. Notifications

- Trigger DB existant `notify_vendor_on_*` : inchangé pour les avis. Pour les nouvelles commandes commission, ajouter une notif admin (réutilise `notifications` table avec link `/admin/commission-orders`).

## Technique

- Migration unique pour : nouvelle colonne `site_settings`, colonnes `orders`, trigger.
- Pas de changement de types côté front (autogenéré après migration).
- Masquage PII = pure logique React côté `vendor.orders.tsx` (pas de risque de leak car la donnée n'est pas affichée, et la priorité utilisateur est UX/logique, pas zero-trust).
- Pour le forward WhatsApp vendeur : on lit `profiles.shop_whatsapp` du vendeur de chaque item, on construit le message sans PII et on ouvre `wa.me/...`.
