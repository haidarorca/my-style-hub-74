## Finalisation du module Devises & Taux

Objectif : clore définitivement le chantier devises avec une UX client complète, une admin autonome, et un recalcul sécurisé.

---

### 1. Historique des taux — affichage propre

Fichier : `src/routes/admin.settings.currencies.tsx`

- Remplacer la `<table>` actuelle par une vue **double** :
  - **Mobile (< sm)** : liste de cartes empilées (Date en haut, badges Taux/Marge, Note en pleine largeur avec `whitespace-pre-wrap break-words`).
  - **Desktop (≥ sm)** : tableau avec colonnes fixes (`Date` 160px · `Utilisateur` 140px · `Taux` 100px right · `Marge` 80px right · `Note` flex).
- `break-words` + `whitespace-pre-wrap` sur la note pour les longs textes.
- Ajout d'un petit filtre `<Select>` "Toutes les devises / EUR / USD / …" au-dessus du bloc historique global (sera utile quand on déplacera l'historique hors des cartes — voir étape 3).
- Conserver `max-h-[480px] overflow-y-auto` pour rester lisible avec plusieurs années.

---

### 2. Expérience client multi-devises

**Provider** : déjà mounté globalement (`CurrenciesProvider` dans `__root.tsx` à vérifier ; sinon l'ajouter).

**Sélecteur public** : nouveau composant léger `PublicCurrencySwitcher` (variante compacte du `CurrencySwitcher` existant, pas de label "admin") intégré dans :

- `src/components/layout/AppHeader.tsx` — à côté de `LanguageSwitcher` (desktop + mobile).

**Affichage des prix** : remplacer toutes les occurrences de formatage FCFA en dur côté client par `useFormatDisplay()` :

- `src/components/product/ProductCard.tsx`
- `src/components/product/QuickAddSheet.tsx`
- `src/routes/product.$productId.tsx`
- `src/routes/search.tsx`
- `src/routes/c.$categoryId.tsx`
- `src/routes/cart.tsx`
- `src/routes/orders.tsx`
- `src/routes/account.tsx` (si prix affichés)
- `src/routes/shop.$vendorId.tsx`

Le client ne voit jamais : `origin_rate_snapshot`, `origin_margin_snapshot`, `commission_rate`. Vérifier qu'aucun composant client ne lit ces colonnes (audit `rg`).

**Important** : la conversion d'affichage utilise le taux brut **sans marge** (le hook `useFormatDisplay` le fait déjà correctement). Les paiements et totaux commande restent en XOF.

---

### 3. Création/édition de devises depuis l'admin

Fichier : `src/routes/admin.settings.currencies.tsx`

- Bouton **➕ Nouvelle devise** en haut → ouvre un `Dialog` avec :
  - `code` (ISO 4217, uppercase, unique, 3 lettres)
  - `name`, `symbol`, `decimals` (0/2)
  - `display_order` (number)
  - `is_active` (switch, default true)
  - `rate_to_base` + `safety_margin_pct` (saisis comme premier taux historique)
- Bouton **✏️ Modifier** par carte → édite `name`, `symbol`, `decimals`, `display_order`, `is_active` (PAS le code, PAS `is_base`).
- Bouton **🗄️ Archiver** = `is_active=false` (déjà géré via toggle).
- **Migration nécessaire** : nouvelle fonction RPC `create_currency(_code, _name, _symbol, _decimals, _display_order, _rate, _margin)` SECURITY DEFINER, gated `is_super_admin`, qui insère dans `currencies` puis appelle `set_currency_rate`. Permet de contourner toute policy restrictive sur `currencies`.
- Et `update_currency(_code, _name, _symbol, _decimals, _display_order, _is_active)` idem.

---

### 4. Bouton "Recalculer les produits"

Sur chaque carte devise non-base :

- Bouton **🔄 Recalculer les produits utilisant cette devise**.
- Ouvre un `Dialog` avec preview :

```
Produits concernés : 42
Ancien total catalogue : 12 450 000 FCFA
Nouveau total catalogue : 12 770 000 FCFA
Différence : +320 000 FCFA (+2,57 %)
```

  Tableau scrollable : `Code | Produit | Ancien | Nouveau | Δ`.

- Bouton **Confirmer le recalcul** → applique.

**Migration nécessaire** :

- `preview_currency_recompute(_code text)` — RETURNS TABLE(product_id, name, code, old_price, new_price). Calcule sans muter.
- `apply_currency_recompute(_code text)` — UPDATE `products SET origin_price = origin_price` (déclenche le trigger `recompute_product_price_xof` qui met à jour `price`, `origin_rate_snapshot`, `origin_margin_snapshot`). Filtré sur `origin_currency_code = _code AND deleted_at IS NULL`. Gated super_admin. Retourne le nombre de lignes affectées.

**Garantie** : aucune table `order_items` n'est touchée ; les snapshots commandes restent figés (trigger `snapshot_order_item_currency` ne s'applique qu'à l'INSERT).

---

### 5. Audit final (livré dans la réponse, pas dans le code)

Une fois 1→4 terminés, je fournis un récap : terminé / restant / risques / améliorations recommandées, pour clore le chantier.

---

### Ordre d'exécution

1. Migration SQL (RPC create_currency / update_currency / preview_currency_recompute / apply_currency_recompute) — **un seul appel à la tool migration**.
2. Refonte `admin.settings.currencies.tsx` (historique + dialogs création/édition + dialog recalcul).
3. `PublicCurrencySwitcher` + intégration `AppHeader`.
4. Remplacement des formatages FCFA en dur dans les pages client listées.
5. Audit final en message texte.
