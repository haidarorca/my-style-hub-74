# Système de commissions flexible

Système complet de gestion des commissions avec types vendeurs, règles à plusieurs niveaux, priorité intelligente et historique. Contrôlé uniquement par le Super Admin.

## 1. Base de données (migration)

### Enum `vendor_mode`
- `no_commission` — vendeur normal sans commission (commandes directes WhatsApp)
- `commission` — vendeur avec commission (commandes via plateforme)
- `autonomous` — vendeur autonome (gère lui-même tout, mais traçabilité optionnelle)
- `partially_managed` — partiellement géré (mix : certaines catégories oui, d'autres non)

### Nouvelle colonne sur `profiles`
- `vendor_mode vendor_mode NOT NULL DEFAULT 'no_commission'`
- `hide_contact_publicly boolean NOT NULL DEFAULT false` — auto-vrai pour mode `commission`

### Nouvelle table `commission_rules`
| Colonne | Type | Description |
|---|---|---|
| id | uuid PK | |
| scope | text | `global` / `vendor` / `category` / `product` |
| vendor_id | uuid nullable | si scope = vendor ou exception vendeur |
| category_id | uuid nullable | si scope = category (n'importe quel niveau de l'arbre) |
| product_id | uuid nullable | si scope = product |
| rate_percent | numeric(5,2) | ex. 10.00 = 10% |
| is_enabled | boolean default true | |
| note | text nullable | |
| created_by | uuid | super admin |
| created_at, updated_at | timestamptz | |

Contraintes : un seul actif par (scope, target). Index sur les colonnes de lookup.

### Nouvelle table `commission_rule_history`
Trace toute modif (ancienne valeur, nouvelle valeur, acteur, raison) — alimente la page historique.

### Nouvelle colonne sur `order_items`
- `commission_rate numeric(5,2)` — taux figé au moment de la commande
- `commission_amount numeric` — montant calculé
- `commission_rule_id uuid nullable` — référence vers la règle utilisée (audit)

### Fonctions SQL
- `resolve_commission_rate(_product_id uuid) returns numeric` — applique la priorité **produit → sous-sous-catégorie → sous-catégorie → catégorie → vendeur → global**, en remontant l'arbre `categories.parent_id`. Retourne 0 si vendeur en mode `no_commission`.
- Trigger sur `order_items` insert : remplit automatiquement `commission_rate`, `commission_amount`, `commission_rule_id`.
- Trigger sur `commission_rules` update/delete : journalise dans `commission_rule_history`.

### RLS
- `commission_rules` : lecture super admin uniquement (les vendeurs ne voient pas leur taux directement). Écriture super admin uniquement.
- `commission_rule_history` : lecture super admin uniquement.
- `order_items.commission_*` : lecture super admin uniquement (vue filtrée pour le vendeur masque ces colonnes).

### Mise à jour policies existantes
- `orders` : visible au super admin **et** au vendeur si `vendor_mode = 'commission'` (déjà le cas via `order_items`).
- `profiles_public_shop_read` : masquer `phone`, `shop_whatsapp` quand `hide_contact_publicly = true`. → On crée une **vue publique** `public_shop_profiles` que le frontend utilise pour afficher les boutiques (sans téléphone si masqué).

## 2. Frontend — pages Super Admin

### Nouvelle page `/admin/commissions` (super admin uniquement)
3 onglets :

**Onglet « Règles »**
- Section « Commission globale » : input % + toggle activé.
- Liste « Par vendeur » : cherche un vendeur, applique un taux ou une exception (+1% / -1% / valeur fixe).
- Liste « Par catégorie » : arbre de catégories, taux par nœud (héritage visible).
- Liste « Par produit » : recherche produit, override.
- Boutons rapides : `+1%`, `-1%`, saisie libre, désactiver règle.

**Onglet « Vendeurs »**
- Tableau de tous les vendeurs avec colonne `vendor_mode` (select : sans commission / avec commission / autonome / partiellement géré).
- Colonne « Masquer contact public » (auto pour mode commission, modifiable pour les autres).
- Aperçu du taux effectif de chaque vendeur.

**Onglet « Historique »**
- Liste paginée de `commission_rule_history` avec filtres (acteur, type d'action, date, scope).
- Affiche ancienne → nouvelle valeur, raison.

### Carte sur `/admin`
Nouvelle carte « Commissions » visible aux super admins, pointant vers `/admin/commissions`.

### Page `/admin/orders`
Ajouter pour chaque commande, dans le détail :
- Total commande
- Commission totale calculée
- Détail par ligne (vendeur, taux, montant)

### Page `/admin/admins`
Nouvelle permission `commissions` (lecture seule) déléguable, mais l'écriture reste réservée au super admin.

## 3. Frontend — vendeur

- Page `/vendor/orders` : pour mode `commission`, affiche les commandes reçues via plateforme avec un badge « Plateforme ». Pour mode `no_commission`, affiche les commandes WhatsApp comme aujourd'hui.
- Vendeur avec mode `commission` : son numéro WhatsApp est masqué sur sa page boutique publique (`/shop/$vendorId`) et le bouton WhatsApp produit pointe vers la commande sur la plateforme au lieu d'un appel direct.
- Le vendeur ne voit jamais son taux de commission ni les montants commission.

## 4. Frontend — public

- Composant boutique publique : si `hide_contact_publicly`, retire téléphone et WhatsApp, garde seulement le bouton « Commander » qui passe par le panier plateforme.
- ProductCard / page produit : si vendeur en mode `commission`, retire le bouton WhatsApp direct, force le passage par le panier.

## 5. Logique de priorité commission

Implémentée dans `resolve_commission_rate(product_id)` :
```
1. Si vendeur.vendor_mode = 'no_commission' → 0%
2. Cherche règle scope='product' pour ce produit, active
3. Sinon, remonte categories.parent_id en cherchant règle scope='category' active (la plus profonde gagne)
4. Sinon, règle scope='vendor' active pour ce vendeur
5. Sinon, règle scope='global' active
6. Sinon, 0%
```
Le mode `partially_managed` suit la même logique mais respecte des exceptions catégorie (catégories où le vendeur reste en `no_commission` malgré la règle globale) — géré via une règle scope='category' + vendor_id avec rate=0 et is_enabled=true.

## 6. Sécurité
- Toutes les écritures de `commission_rules` requièrent `is_super_admin(auth.uid())`.
- Le taux figé sur `order_items` ne peut pas être modifié après insertion (trigger empêche UPDATE de `commission_rate` et `commission_amount`).
- Vendeurs ne peuvent jamais lire `commission_rules` ni les colonnes commission de `order_items`.

## 7. Livrables
1. Migration SQL : enum, colonnes, tables, fonctions, triggers, RLS, vue publique des boutiques.
2. Page `/admin/commissions` (3 onglets : règles, vendeurs, historique).
3. Carte « Commissions » sur `/admin`.
4. Mise à jour `/admin/orders` avec colonnes commission.
5. Masquage des contacts vendeur sur les pages publiques selon `hide_contact_publicly`.
6. Mise à jour de la page boutique et fiche produit pour forcer le panier plateforme en mode `commission`.
7. Permission optionnelle `commissions` (lecture seule) dans la page `/admin/admins`.
