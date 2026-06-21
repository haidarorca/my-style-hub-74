## Système Multi-Devises Kawzone — Architecture Proposée

Objectif : permettre à chaque vendeur de saisir ses prix dans sa devise d'origine (FCFA, USD, RMB, EUR, TRY…) tout en gardant FCFA comme devise comptable de référence. Les taux sont **manuels et contrôlés par le Super Admin** (jamais d'API externe automatique).

---

### 1. Impact base de données

#### 1.1 Nouvelle table `currencies` (référentiel)
| Champ | Type | Notes |
|---|---|---|
| `code` (PK) | text | `XOF`, `USD`, `RMB`, `EUR`, `TRY` — ISO 4217 quand possible |
| `name` | text | "Franc CFA", "US Dollar"… |
| `symbol` | text | "FCFA", "$", "¥", "€", "₺" |
| `decimals` | int | 0 pour XOF, 2 pour le reste |
| `is_active` | bool | |
| `is_base` | bool | un seul `true` → XOF |
| `display_order` | int | |

#### 1.2 Nouvelle table `currency_rates` (historique des taux manuels)
| Champ | Type | Notes |
|---|---|---|
| `id` uuid PK | | |
| `currency_code` | text FK → currencies | |
| `rate_to_base` | numeric(18,6) | ex. 1 USD = 585 XOF |
| `safety_margin_pct` | numeric(5,2) | ex. 5.00 |
| `effective_from` | timestamptz | défaut now() |
| `created_by` | uuid | super admin |
| `note` | text | |

Le taux courant = ligne la plus récente par devise. Historique conservé.

Fonctions SQL :
- `current_currency_rate(code)` → `(rate, margin)`
- `convert_amount(amount, from_code, to_code)` → numeric (utilise XOF comme pivot, applique la marge **uniquement à l'entrée vendeur**, pas aux conversions d'affichage stats)

#### 1.3 Modifications `profiles` (vendeur)
- `default_currency_code` text FK → currencies, défaut `'XOF'`

#### 1.4 Modifications `products`
- `origin_price` numeric(14,2) — prix saisi par le vendeur
- `origin_currency_code` text FK → currencies
- `origin_rate_snapshot` numeric(18,6) — taux figé au moment de la dernière conversion
- `origin_margin_snapshot` numeric(5,2)
- `price_xof` numeric(14,2) — prix recalculé en FCFA (= colonne `price` existante, on la garde et on l'alimente via trigger pour zéro casse)

Trigger `recompute_product_price_xof` : sur INSERT/UPDATE de `origin_price` ou `origin_currency_code`, recalcule `price = round(origin_price × rate × (1 + margin/100), decimals_xof)`.

#### 1.5 Modifications `orders` / `order_items` (snapshot devise)
- `orders.display_currency_code` text — devise d'affichage choisie à la commande (informational, le compta reste en XOF)
- `order_items.origin_currency_code`, `origin_unit_price`, `origin_rate_snapshot` — pour traçabilité import (PARTIE 5 : on garde le coût fournisseur en devise d'origine pour les commandes import)

Aucune migration sur `auth.*`, `storage.*`.

---

### 2. Permissions / RLS

- `currencies` : SELECT public (anon + authenticated). INSERT/UPDATE réservé super_admin.
- `currency_rates` : SELECT authenticated. INSERT réservé super_admin (via fonction `set_currency_rate(code, rate, margin, note)`).
- `profiles.default_currency_code` : modifiable par le vendeur lui-même + admin.
- `products.origin_*` : modifiable par le vendeur propriétaire + admin. `price` (xof) devient read-only côté vendeur (calculé par trigger).

---

### 3. Écrans concernés

| Écran | Changement |
|---|---|
| **Admin → Paramètres → Devises** (NOUVEAU `/admin/settings/currencies`) | CRUD devises + édition taux/marge + historique |
| **Vendor settings** | Sélecteur "Devise principale" |
| **Vendor → Nouveau produit / Édition** | Saisie `origin_price` + sélecteur devise (préfilled). Affichage temps réel "≈ X FCFA (taux Y, marge Z%)" |
| **Admin → Produits** | Colonnes "Prix origine" + "Prix FCFA" |
| **Dashboard / Cockpit / Finance / Rapports** | Nouveau sélecteur global de devise d'affichage (header). Conversion via `current_currency_rate` sans marge. Stockage XOF inchangé. |
| **Drawer commande / Détail import** | Pour les commandes import : affichage prix fournisseur en devise d'origine + équivalent FCFA |

Hook React `useDisplayCurrency()` + `formatMoney(amount_xof, target_code)` partagé entre cockpit et admin pour cohérence.

---

### 4. Workflow import (PARTIE 5)

Le système devises **n'altère pas** le workflow existant. Il ajoute juste :
- Le prix produit fournisseur reste exprimé en devise d'origine.
- Le paiement client #1 (produits) utilise `price` (XOF déjà converti avec marge) → aucun changement.
- Les frais de transport (paiement #2) restent calculés en XOF par l'admin (poids × tarif XOF/kg).
- La page logistique import affiche pour chaque ligne : "Coût fournisseur : 100 RMB (≈ 8 200 XOF, marge +8% → 8 856 XOF facturé)".

---

### 5. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Trigger recalcul casse les produits existants | Migration backfill : tous les produits existants reçoivent `origin_currency_code='XOF'`, `origin_price = price`, rate=1, margin=0. `price` reste identique. |
| Variations de taux modifient rétroactivement les prix catalogue | Le recalcul ne se déclenche qu'à l'UPDATE explicite du vendeur OU via un bouton admin "Recalculer tous les produits en RMB" sur la page devises. Sinon `price` reste figé. |
| Affichage stats incohérent entre pages | Hook unique `useDisplayCurrency` + helper SQL `convert_amount` réutilisés partout. |
| Devise affichage ≠ devise comptable | FCFA reste source de vérité ; conversion display = lecture seule, jamais persistée dans les agrégats. |
| RLS oublié sur nouvelles tables | Migration suit le pattern `CREATE TABLE → GRANT → ENABLE RLS → POLICY`. |

---

### 6. Architecture future (PARTIE 6)

- Ajout d'une nouvelle devise = 1 INSERT dans `currencies` + 1 taux. Zéro code.
- Ajout d'un nouveau pays fournisseur = lien `countries.default_currency_code` (ajout optionnel plus tard).
- Commission Kawzone : déjà compatible (commission calculée sur `price` XOF, indépendante de la devise d'origine).
- Marketplace locale : vendeurs FCFA = cas trivial (rate=1, margin=0).

---

### 7. Plan d'exécution (après validation)

**Étape A — Fondation DB** (1 migration)
1. Tables `currencies`, `currency_rates` + GRANT + RLS + policies
2. Seed des 5 devises (XOF base, USD, RMB, EUR, TRY) avec taux par défaut (585, 82, 656, 18)
3. Colonnes `profiles.default_currency_code`, `products.origin_*`, `orders.display_currency_code`, `order_items.origin_*`
4. Fonctions `current_currency_rate`, `convert_amount`, `set_currency_rate`
5. Trigger `recompute_product_price_xof`
6. Backfill produits existants

**Étape B — Admin Paramètres Devises**
- `/admin/settings/currencies` : tableau + édition inline + bouton "Recalculer produits"

**Étape C — Vendor + Produits**
- Sélecteur devise dans profil vendeur
- Saisie `origin_price + currency` dans le formulaire produit (preview temps réel)

**Étape D — Sélecteur devise d'affichage**
- Hook `useDisplayCurrency` + composant `<CurrencySwitcher />` dans le header admin
- Branchement Dashboard, Cockpit (KPI cards, finance, rapports)

**Étape E — Vue import**
- Affichage devise d'origine dans drawer/logistique import

---

### Questions avant exécution

1. Confirmes-tu les 5 devises initiales (XOF, USD, RMB, EUR, TRY) ?
2. Pour les produits existants : on les laisse en XOF (rate=1, margin=0) — OK ?
3. La marge de sécurité s'applique-t-elle aussi quand un vendeur sénégalais saisit en FCFA ? (Recommandation : non, margin=0 pour XOF.)
4. Le sélecteur de devise d'affichage doit-il être global (persisté par utilisateur) ou par page ?
