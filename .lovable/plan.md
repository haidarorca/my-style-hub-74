
# Cadre métier des filtres du Cockpit

Objectif : avant d'ajouter quoi que ce soit, figer **9 dimensions métier uniques**. Chaque filtre = une seule question. Aucun doublon toléré.

---

## 1. Audit de l'existant (Dashboard.tsx, lignes 97-103 / 247-276)

Filtres actuellement codés :

| Filtre actuel | Question répondue | Verdict |
|---|---|---|
| `searchTerm` (texte) | Texte libre (nom, tel, KZ-xxx) | Garder — hors taxonomie |
| `activeTab` Actions / Archive | Sous-commande active ou close ? | Garder — c'est le mode du Cockpit, pas un filtre |
| `statusFilter` (single select, 12 entrées dont `cancelled`) | Où en est la sous-commande ? | **Réduire** : retirer `delivered` / `cancelled` (gérés par Archive), passer en **multi-select** |
| `balanceFilter` (unpaid/partial/paid) | Reste-t-il à encaisser ? | **Renommer** → sous-cas de "Situation financière" |
| `minDays` | Âge de la commande | Garder — dimension temporelle |
| `dateRange` | Période de création | Garder |
| Toggle `showAutonomous` | Kawzone est-il responsable ? | **Promouvoir** → filtre "Type de boutique" (Admin / Commission / Autonome) |
| Badges LOC/IMP, KZ/COM/EXT (visuels seulement, pas filtrables) | — | À transformer en filtres réels |

**Doublons / incohérences détectés :**
- `statusFilter` mélange étapes logistiques *et* `cancelled` → conflit avec l'onglet Archive.
- Aucun filtre Pays, Local/Import, Type boutique, Origine produit aujourd'hui → les badges sont décoratifs.
- `balanceFilter` est un sous-ensemble du futur "Situation financière" — à fusionner pour ne pas avoir deux endroits qui parlent d'argent.

---

## 2. Taxonomie cible : 9 dimensions, 9 filtres

| # | Filtre | Question unique | Type UI | Source de données |
|---|---|---|---|---|
| 1 | **Pays vendeur** | Où est la boutique ? | Multi-select | `shops.country` |
| 2 | **Pays origine produit** | D'où vient l'article ? | Multi-select | `products.origin_country` (à créer) |
| 3 | **Local / Import** | Comment l'article est-il traité logistiquement ? | Multi-select (Local, Import) | `order_items.is_import` (déjà dérivé via `kind`) |
| 4 | **Type de boutique** | Qui est responsable ? | Multi-select (Admin, Commission, Autonome) | `order_items.is_admin_shop`, `commission_amount` (déjà calculé via `cockpit_scope`) |
| 5 | **Statut** | Où en est la sous-commande ? | **Multi-select** (sans delivered/cancelled) | `logistics_status` |
| 6 | **Situation financière** | Y a-t-il un engagement financier ouvert ? | Multi-select (Aucun, Remboursement dû, Avoir à créer, Complément à encaisser, Règlement vendeur à faire) | Dérivé de `payments`, `order_total`, `settlements` |
| 7 | **Problème opérationnel** | Y a-t-il un incident ? | Multi-select (Rupture, Article supprimé, Boutique supprimée, Fournisseur indispo, Litige client, Paiement bloqué, Livraison bloquée) | Dérivé `stock_break`, `product_deleted`, `shop_deleted`, flags |
| 8 | **Boutique supprimée** | La boutique existe-t-elle encore ? | Tri-state (Tous / Actives / Supprimées) | `shops.deleted_at` (à créer) |
| 9 | **Produit supprimé** | Le produit existe-t-il encore ? | Tri-state (Tous / Actifs / Supprimés) | `products.deleted_at` (à créer) |

**Hors taxonomie (gardés tels quels) :** recherche texte, période (dateRange), âge (minDays), onglet Actions/Archive, tri.

**Supprimés :**
- L'ancien `balanceFilter` (fusionné dans #6).
- Statuts `delivered` / `cancelled` retirés du filtre #5 (couverts par Archive).
- Toggle `showAutonomous` (remplacé par #4 avec présélection Admin+Commission par défaut).

---

## 3. Métiers nouveaux à créer côté données

Avant d'ajouter les filtres en UI, on pose les fondations :

### 3.1 Soft-delete boutique
- `shops.deleted_at timestamptz null`
- `shops.deleted_by uuid null`
- Index partiel `where deleted_at is null` pour les listes actives.
- Les `order_items` conservent `vendor_shop_name_snapshot` (déjà capturé dans `order_items`) → l'historique reste lisible même boutique supprimée.

### 3.2 Soft-delete produit
- `products.deleted_at timestamptz null`
- `order_items` conservent déjà `product_name_snapshot`, `unit_price_snapshot` → ok.

### 3.3 Pays origine produit
- `products.origin_country text null` (code ISO).
- Snapshot à la commande : `order_items.product_origin_country_snapshot`.

### 3.4 Type de boutique formalisé
- `shops.shop_type enum('admin','commission','autonomous')` au lieu de déduire à chaque fois depuis `is_admin_shop` + `commission_amount`.
- Snapshot dans `order_items.shop_type_snapshot`.

### 3.5 Situation financière (dérivé, pas stocké)
Calcul côté `deriveSubOrders` :
- `refund_due` = somme articles annulés payés non remboursés
- `credit_due` = articles annulés à transformer en avoir
- `balance_due` = remaining > 0
- `vendor_payout_due` = sous-commande livrée, commission due au vendeur non versée

### 3.6 Problème opérationnel (dérivé)
Drapeaux calculés par sous-commande :
- `has_stock_break`, `has_deleted_product`, `has_deleted_shop`, `supplier_unavailable`, `customer_dispute`, `payment_blocked`, `delivery_blocked`.

---

## 4. Ordre d'exécution proposé

1. **Phase A — Données** (une migration) : ajouter `deleted_at` sur `shops` et `products`, `origin_country` sur `products`, `shop_type` sur `shops`, et les colonnes snapshot manquantes sur `order_items`.
2. **Phase B — Dérivation** : enrichir `src/cockpit/lib/sub-orders.ts` avec `financial_situation` et `operational_issues` (drapeaux par sous-commande) + badges "Boutique supprimée" / "Produit supprimé".
3. **Phase C — UI filtres** : un seul panneau "Filtres" avec les 9 dimensions, toutes en multi-select, compteurs en direct, bouton "Réinitialiser".
4. **Phase D — Nettoyage** : retirer `balanceFilter`, le toggle `showAutonomous`, et `delivered`/`cancelled` du filtre Statut.

---

## 5. Règle de gouvernance

> Tout nouveau filtre futur doit être rattaché à l'une des 9 dimensions. Si la question métier n'y figure pas, on ouvre une 10e dimension ; on n'empile pas un filtre redondant dans une dimension existante.

---

**À valider avant Phase A :**
- La taxonomie à 9 dimensions est-elle complète et correcte ?
- OK pour fusionner `balanceFilter` dans "Situation financière" ?
- OK pour retirer `delivered`/`cancelled` du filtre Statut (toujours accessibles via l'onglet Archive) ?
