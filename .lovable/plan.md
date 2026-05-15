## Système multilingue complet (FR / EN / AR) — KawZone

Objectif : afficher tout le site (client, vendeur, admin) dans la langue du téléphone, avec FR par défaut, sélecteur manuel, mémoire de la langue, et RTL pour l'arabe. Contenu vendeur (produits, catégories) saisi en plusieurs langues directement en base.

### 1. Base de données — colonnes multilingues

Migration unique ajoutant des colonnes JSONB `i18n` (pas de duplication name_en/name_ar — un seul champ JSON `{ "en": "...", "ar": "..." }` par contenu traduit) :

- `categories.name_i18n jsonb` (clé `en`, `ar` ; FR reste dans `name`)
- `products.name_i18n jsonb`, `products.designation_i18n jsonb`, `products.description_i18n jsonb`
- `site_settings.hero_title_i18n jsonb`, `hero_subtitle_i18n jsonb`, `footer_text_i18n jsonb`, `promo_bar_text_i18n jsonb`
- `home_banners.title_i18n jsonb`
- `profiles.shop_description_i18n jsonb`, `shop_hours_i18n jsonb`

Approche JSONB : 1 seule colonne par champ, extensible à toute nouvelle langue sans migration. RLS inchangée (les colonnes héritent des policies des tables).

### 2. Helper de lecture côté front

Nouveau `src/lib/i18n/localized.ts` :

```ts
export function pickI18n(base: string|null, i18n: Record<string,string>|null, lang: Lang, fallback="fr"): string
```

Règle : `i18n[lang] ?? base (FR) ?? ""`. Utilisé partout où on affiche `product.name`, `category.name`, etc.

### 3. Dictionnaire UI étendu

Étendre `src/lib/i18n/translations.ts` avec toutes les clés UI utilisées dans :
- Header / nav / bottom nav / FAB
- Pages : home, search, categories, c/$id, product, cart, checkout, login, signup, account, orders, shop
- Pages vendor.* (dashboard, products, orders, settings, notifications, messages)
- Pages admin.* (dashboard, products, orders, vendors, admins, categories, category-requests, commissions, reports, reviews, settings)
- Composants partagés : ProductCard, QuickAddSheet, ReviewsSection, SimilarProducts, BackButton, PromoBar, dialogs

Toutes les traductions FR / EN / AR fournies dans le même fichier (organisé par section). Format clé : `section.key` (ex : `vendor.products.add_button`, `admin.orders.status_new`).

### 4. Migration des composants

Refactor systématique de chaque route/composant pour :
- remplacer chaque chaîne FR codée en dur par `t("…")`
- envelopper les noms/descriptions de produits et catégories dans `pickI18n(...)`
- ajouter `dir`-aware classes Tailwind (`rtl:` / `ltr:`) où l'alignement compte (icônes, marges)

### 5. Saisie multilingue côté vendeur/admin

Nouveau composant `MultilingualInput` (et `MultilingualTextarea`) : 3 onglets FR / EN / AR avec un seul champ visible à la fois. Bouton "Traduire automatiquement" optionnel (Lovable AI Gemini Flash) pour pré-remplir EN/AR depuis le FR — l'utilisateur peut éditer ensuite.

Intégré dans :
- `vendor.products.new`, `vendor.products.$productId.edit` (name, designation, description)
- `admin.categories` (name)
- `admin.products.$productId.edit` (idem produits)
- `admin.settings` (hero, footer, promo bar)
- `vendor.settings` (shop_description, shop_hours)

### 6. Server function de traduction (optionnelle, pour le bouton "Traduire")

`src/lib/translate.functions.ts` : `translateText({ text, from, to })` utilisant Lovable AI (`google/gemini-2.5-flash`, gratuit). Cache léger en mémoire côté serveur.

### 7. Détection + RTL

Le hook `use-i18n` existant détecte déjà bien la langue et applique `dir`. Confirmer que `__root.tsx` charge bien `<I18nProvider>` autour de tout. Ajouter dans `styles.css` quelques règles RTL globales (mirroring d'icônes flèches notamment).

### 8. Règles strictes

- Ne jamais traduire : `KawZone`, codes produits (`product.code`), prix, numéros de commande, marques, noms propres.
- Traduire : noms de produits/catégories/désignations **si** une traduction est saisie, sinon afficher la version FR.
- Sélecteur manuel : déjà présent dans `LanguageSwitcher` (header). Ajouter aussi dans le menu compte mobile pour visibilité.

### Détails techniques

- Pas de bibliothèque i18n externe : la solution maison existante (`useI18n`) est conservée et étendue. Évite ~30 KB de bundle (i18next).
- JSONB partial index si besoin futur de recherche multilingue ; pas dans cette itération.
- Tous les `head()` (titres SEO) restent statiques en FR pour l'instant — un suivi pourra les rendre dynamiques par langue plus tard.
- Aucun changement RLS : les colonnes ajoutées héritent des policies existantes des tables.

### Livraison en 3 étapes

1. **Migration DB** + helper `pickI18n` + composants `MultilingualInput/Textarea` + dictionnaire UI complet (FR/EN/AR).
2. **Refactor pages client** (home, search, categories, product, cart, checkout, account, orders, shop, login, signup) — usage `t()` + `pickI18n`.
3. **Refactor pages vendor + admin** + intégration de `MultilingualInput` dans les formulaires de saisie.

Vu l'ampleur (≈ 30 fichiers touchés), je traite les 3 étapes dans la même session mais en lots séquentiels pour rester lisible.
