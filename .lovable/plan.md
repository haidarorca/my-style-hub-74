# Plan — Pays dynamiques + Validation frais après pesée

Approche **strictement additive**. Aucune suppression, aucun changement de logique métier existante. Tous les nouveaux champs sont nullable, tous les nouveaux statuts coexistent avec les anciens.

---

## Partie A — Pays dynamiques (vérification + petits ajustements)

La table `countries` et la page `/admin/countries` existent déjà et fonctionnent. Travail à faire :

1. **Audit lecture seule** : vérifier que tous les sélecteurs de pays (commission source/destination, livraison, profil vendeur, adresses client) lisent bien depuis le hook `useCountries` (table `countries`) et **non depuis une liste codée en dur**.
2. **Corriger les endroits où une liste fixe est utilisée**, le cas échéant — en gardant exactement la même UI, juste la source de données change.
3. **S'assurer du filtre `is_enabled = true`** côté client (formulaires publics / checkout / livraison). Côté admin commission : afficher TOUS les pays (actifs + inactifs) pour permettre la gestion.
4. **Ajouter un lien rapide "Gérer les pays"** dans la page `/admin/commissions` (vers `/admin/countries`), sans modifier la logique de commission.

Aucune migration nécessaire pour cette partie.

---

## Partie B — Validation frais après pesée (Chine → Sénégal)

### Étape 1 — Migration DB (additive uniquement)

Nouvelle table `order_shipment_assessments` (1 ligne par commande qui nécessite une pesée) :

```text
id, order_id (FK orders, unique)
status: nouveau enum shipment_assessment_status
  ('pending_arrival','awaiting_weighing','fees_calculated',
   'awaiting_client_validation','validated','rejected',
   'ready_to_ship','shipped')
real_weight_kg, volumetric_weight_kg, length_cm, width_cm, height_cm
air_freight_fee, service_fee, extra_fees, total_fees
admin_comment, parcel_photo_url
client_validated_at, client_rejected_at, client_response_note
created_by (admin), created_at, updated_at
```

RLS :
- Admin : ALL
- Client (`orders.buyer_id = auth.uid()`) : SELECT + UPDATE limité aux champs de validation
- Vendeur : aucun accès (logique 100% admin/commission/import international)

**Aucune modification de la table `orders`** — pas de nouveau statut ajouté à `orders.status`. L'état de la pesée est totalement séparé.

### Étape 2 — UI Admin

Dans `/admin/commission-orders` (ou nouvelle section `/admin/shipments`) :
- Encart par commande "Évaluation expédition"
- Formulaire : poids réel, poids volumétrique, dimensions, frais avion, frais service, frais extras, commentaire, upload photo
- Calcul automatique du total
- Bouton **"Envoyer validation WhatsApp"** (utilise le numéro client de la commande)

### Étape 3 — Message WhatsApp

Nouvelle fonction dans `src/lib/whatsapp.ts` : `buildShipmentValidationMessage(order, assessment)` qui produit exactement le format demandé, avec lien `https://kawzone.com/orders/<id>/validate-shipment`.

### Étape 4 — UI Client

Nouvelle page `src/routes/orders.$orderId.validate-shipment.tsx` :
- Affiche la commande, le détail des frais, la photo
- Deux boutons : **"Valider les frais"** / **"Refuser"**
- Champ note optionnel
- Verrou : si déjà validé/refusé, affiche le statut

Server function `validateShipmentAssessment` (avec `requireSupabaseAuth`) qui vérifie que `auth.uid() = order.buyer_id`.

### Étape 5 — Aucun impact sur le reste

- Checkout : inchangé
- Commandes vendeur : inchangées
- Commandes commission existantes : inchangées (assessment optionnel, créé seulement quand l'admin clique "Démarrer évaluation")
- WhatsApp existant : intact, juste un nouveau builder ajouté
- Anciens statuts `orders.status` : intacts (new/confirmed/delivered/cancelled)

---

## Livraison étape par étape

Je propose de faire **dans l'ordre, avec validation entre chaque** :

1. **Partie A** (pays dynamiques) — petit, sans risque, je commence par là
2. **Migration DB Partie B** (table + RLS + enum) — vous validez la migration
3. **UI Admin** (formulaire pesée + bouton WhatsApp)
4. **UI Client** (page de validation)

Confirmez-vous cet ordre ? Si oui, je commence par la Partie A immédiatement après votre approbation du plan.
