# Plan — Améliorations Commandes Commission (additif, sans casse)

Approche : 100% additive. Aucune table existante modifiée de manière destructive. Aucun statut existant renommé. Tout nouveau champ est nullable avec défaut sûr.

---

## 1. Archive des commandes commission

**DB (migration additive)**
- Ajouter `orders.archived_at timestamptz NULL` (nullable, défaut NULL)
- Index partiel sur `archived_at IS NULL` pour la liste active

**UI `/admin/commission-orders`**
- Ajouter un filtre tabs : **Actives** (défaut, `archived_at IS NULL`) / **Archivées** (`archived_at IS NOT NULL`) / **Toutes**
- Bouton "Archiver" par commande (visible sur livrée/annulée — mais autorisé partout)
- Bouton "Désarchiver" dans la vue Archivées
- Aucune suppression. Données préservées.

**Server functions** : ajouter `archiveOrder` / `unarchiveOrder` dans `src/lib/admin-orders.functions.ts` (admin only).

---

## 2. Services de transport (admin)

**DB nouvelle table `shipping_services`** :
```
id, name, source_country_id, destination_country_id,
price_per_kg numeric, pricing_unit text default 'kg' ('kg'|'m3'),
delay_min_days int, delay_max_days int,
is_enabled bool default true, position int, created_at, updated_at
```
- RLS : lecture publique (clients doivent voir au panier), écriture admin only.

**Nouvelle page `/admin/shipping-services`** (lien dans nav admin sous "Pays") :
- CRUD : créer, éditer prix/kg, délais, activer/désactiver, choisir pays source+dest.

---

## 3. Choix client au panier / checkout

**Produit** : nouveau champ `products.requires_international_shipping bool default false` (additif).

**Checkout** :
- Si le panier contient au moins 1 produit avec `requires_international_shipping = true`, afficher un sélecteur de service de transport (filtré par source produit / destination client).
- Stockage du choix : nouveau champ `orders.shipping_service_id uuid NULL` + `orders.shipping_estimate_note text NULL` ("Estimé — sera recalculé après pesée").
- Le checkout existant continue à fonctionner exactement comme avant pour les autres produits.

---

## 4. Pesée + calcul automatique (extension du système existant)

Réutiliser la table existante `order_shipment_assessments` déjà en place. Ajouter 2 colonnes additives :
- `shipping_service_id uuid NULL` (référence au service choisi)
- `price_per_kg_snapshot numeric NULL` (figé au moment du calcul)

UI `/admin/shipments` : pré-remplir `air_freight_fee = real_weight_kg × price_per_kg` du service choisi. Garder `extra_fees`, `service_fee`, `admin_comment`.

---

## 5. Validation WhatsApp (déjà en place)

Étendre `buildShipmentValidationMessage` dans `src/lib/whatsapp.ts` pour inclure :
- service choisi, poids réel, prix/kg, délai estimé.
Aucune nouvelle table. La page client `/orders/$orderId/validate-shipment` existe déjà — j'ajoute juste l'affichage du service+délai.

---

## 6. Option côté produit (vendeur + admin)

- Case à cocher "Ce produit nécessite des frais internationaux après pesée" dans :
  - formulaire vendeur (`vendor.products.new` + `vendor.products.$productId.edit`)
  - formulaire admin (`admin.products.$productId.edit`)
- Par défaut **désactivée** → comportement actuel inchangé.

---

## 7. Ce qui N'EST PAS touché

- Statuts `orders.status` (new/confirmed/delivered/cancelled) : intacts
- Logique commission / `resolve_commission` / `commission_rules` : intacte
- Checkout pour produits sans `requires_international_shipping` : intact
- Commandes vendeur classiques : intactes
- WhatsApp existant (`buildWhatsAppMessage`, `buildVendorForwardMessage`) : intacts
- Système de pays, de commissions : intact

---

## Ordre de livraison (validation entre chaque)

1. **Migration DB** (archive + shipping_services + 2 colonnes additives sur products/orders/assessments) — vous validez
2. **Archive UI** sur `/admin/commission-orders` (filtre + bouton)
3. **Page `/admin/shipping-services`** (CRUD)
4. **Option produit** (case à cocher vendeur + admin)
5. **Sélecteur transport au checkout**
6. **Intégration pesée + WhatsApp étendu**

Confirmez-vous ce plan et l'ordre ? Je commence par l'étape 1 (migration) dès votre approbation.
