
# Système de commissions par pays (source → destination)

## 1. Modèle de données

### Nouvelle table `countries` (gérée par l'admin)
- `id`, `code` (ISO-2, ex. `SN`, `FR`, `LB`, `CN`), `name`, `name_i18n`, `flag_emoji`, `is_enabled`, `position`
- RLS : lecture publique, écriture admin

### `profiles` (vendeur = source)
- Ajout `source_country_id uuid` (nullable, FK logique vers `countries`)
- Le vendeur le choisit dans ses paramètres ; admin peut éditer

### `customer_addresses` + `orders`
- Ajout `destination_country_id uuid` sur `customer_addresses`
- `orders` reçoit `destination_country_id` (copié au moment du checkout)
- Pour les commandes existantes : null (fallback = aucune règle pays)

### `commission_rules` (extension)
- Ajout `source_country_id uuid NULL`
- Ajout `destination_country_id uuid NULL`
- Le scope `country_pair` est nouveau (en plus de `global` / `vendor` / `category` / `product`)
- Contrainte : selon le scope, certains champs requis (validation côté trigger)
- Index composites `(destination_country_id, source_country_id, scope)` pour perfs

### Migration douce
Les règles existantes restent valides : `source_country_id` et `destination_country_id` à NULL = "tous pays". Aucune donnée n'est cassée.

## 2. Logique de résolution (fonction `resolve_commission`)

Réécriture de la fonction Postgres. Nouveaux paramètres : `_product_id`, `_destination_country_id`.

Ordre de priorité (premier match gagne) :

```text
1. PRODUIT spécifique
   1a. + vendor override
   1b. règle produit
2. CATÉGORIE (remontée arbre, deepest first)
   pour chaque niveau :
     2a. + (source + destination) matchant
     2b. + destination matchant
     2c. + source matchant
     2d. catégorie seule
3. VENDEUR (override transversal, comme aujourd'hui)
4. PAIRE PAYS (source + destination)
5. DESTINATION seule
6. SOURCE seule
7. GLOBAL
```

Le `set_order_item_commission` trigger passe maintenant aussi la destination de la commande.

## 3. Dashboard admin `/admin/commissions` (refonte)

### Structure
- **Topbar** : tabs par pays de destination (`Toutes`, `Sénégal`, `France`, `Liban`, …) — alimentées par `countries`
- **Pour chaque destination** : matrice / liste des pays sources avec leur commission effective
- **Drill-down** : cliquer sur une cellule `Chine → France` ouvre un panel avec :
  - Règle globale de la paire
  - Règles catégorie/sous-catégorie (arbre pliable)
  - Règles produits spécifiques
  - Compteur "X produits affectés"
  - Badge "règle active" pour celle qui s'appliquerait par défaut

### Composants
- `CountryTabs` (sticky, scroll horizontal mobile)
- `CountryMatrix` (grid source × destination avec %)
- `RuleTree` (arbre catégories → produits avec règle effective par nœud)
- `RuleEditorDialog` (création/édition d'une règle, scope-aware)
- `RulePreviewDialog` (avant validation : "X produits passeront de Y% à Z%")

### Recherche & filtres
- Recherche produit/vendeur (debounce)
- Filtre par scope, statut activé/désactivé
- Tri par % décroissant / nb produits affectés

### Anti-conflits
- Au save, le backend vérifie qu'il n'existe pas déjà une règle équivalente (même scope + mêmes refs + mêmes pays) → message "Règle dupliquée, voulez-vous la mettre à jour ?"
- Indicateur visuel "règle masquée par une plus prioritaire"

### Performance
- Toutes les règles chargées en bloc (table petite) + Tanstack Query cache
- Résolution effective calculée côté serveur via `resolve_commission(product_id, dest)` exposée en RPC, appelée à la demande pour l'aperçu (pas pour toute la liste)
- Liste produits paginée (50/page) avec règle effective calculée en batch côté serveur

## 4. Paramètres vendeur & checkout

- `vendor.settings` : sélecteur "Pays d'origine de vos produits" (combobox cherchable)
- Checkout (`cart.tsx` / formulaire adresse) : champ pays destination (obligatoire), persisté sur `customer_addresses.destination_country_id` et `orders.destination_country_id`
- Liste des pays alimentée par `countries` (cache i18n)

## 5. Étapes d'exécution

1. **Migration SQL** : table `countries` + colonnes pays sur profiles/addresses/orders/commission_rules + nouvelle `resolve_commission` + trigger order_items mis à jour + seed (Sénégal, France, Liban, Chine, Côte d'Ivoire, Maroc — admin pourra ajouter)
2. **Hook & types** : `useCountries`, mise à jour `auth-types` profile
3. **UI vendeur** : champ pays dans `vendor.settings.tsx`
4. **UI checkout** : champ pays destination + persistance
5. **Refonte `admin.commissions.tsx`** : nouveau dashboard avec tabs/matrice/drill-down
6. **Page admin `/admin/countries`** : CRUD pays
7. **Aperçu avant validation** : dialog qui appelle `resolve_commission` pour échantillon de produits avant `UPDATE`
8. **Traductions i18n** : nouvelles clés `commission.*` et `country.*` (fr/en/ar)

## Détails techniques

- Toutes les RLS : pays publics en lecture, écriture super_admin uniquement pour `countries` et `commission_rules`
- `resolve_commission` reste `SECURITY DEFINER`
- Le trigger `set_order_item_commission` lit `orders.destination_country_id` via jointure
- Pour les commandes guest sans pays sélectionné : fallback sur `destination_country_id = NULL` → utilise règles "toutes destinations"

## Hors scope (à confirmer)

- Conversion devise (toujours en MRU/devise unique)
- Historique des commissions effectives par commande (déjà figé dans `order_items.commission_*`)
- UI publique pour afficher la commission à l'acheteur (non, reste interne)

---

**Confirmez-vous ce plan ?** Si oui, je commence par la migration SQL (étape 1) — c'est le point bloquant qui nécessite votre approbation explicite avant tout le reste.
