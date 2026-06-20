# Rapport technique Lovable → Kimi

**Date** : 2026-06-20
**Auteur** : Lovable (source de vérité du dépôt)
**Destinataire** : Kimi (sandbox)
**Statut** : Le projet **Lovable est la référence**. Toute analyse Kimi qui contredit ce document est fausse (sandbox désynchronisé).

---

## 0. Règle d'or pour Kimi

> Kimi **n'a pas le droit** de :
> - refondre une logique existante,
> - recréer le système de sous-commandes,
> - remplacer un fichier mentionné ici sans citer le numéro de ligne d'origine,
> - supposer qu'une fonctionnalité « n'existe pas » sans avoir lu les fichiers listés ci-dessous.
>
> Kimi doit **uniquement** :
> - corriger les régressions précises indiquées en section 8,
> - préserver les fichiers/fonctions marqués **NE PAS TOUCHER**.

---

## 1. Cartographie des fichiers réels (à lire avant tout diagnostic)

| Domaine | Fichier(s) | Rôle |
|---|---|---|
| Catégorisation ligne (LOCAL / IMPORT_KNOWN_WEIGHT / IMPORT_UNKNOWN_WEIGHT) | `src/lib/line-kind.ts` | **Source de vérité unique** des 3 `LineKind`. `getLineKind()`, `getCartItemLineKind()`, `readOrderItemLineKind()`, `subOrderKey()`. |
| Stamping checkout (catégorie figée par ligne) | `src/lib/checkout.functions.ts` (`createCheckoutOrder`) | Recalcule la catégorie côté serveur, stampe `customization.__line_kind`, `__sub_order_key`, `__freight_fee`, `__shipping_service_id`. Crée un `order_shipment_assessments` par sous-commande IMPORT. |
| Affichage panier (3 sections) | `src/routes/cart.tsx` (lignes 165-235, 308-430) | Groupe les items par `LineKind` puis par vendeur. Deux sélecteurs transport distincts : KNOWN (figé) / UNKNOWN (préférence client). |
| Dédup panier | `src/hooks/use-cart.tsx` (`cartLineSignature`, `stripCartInternalMetadata`, `findSiblingIds`, `mergeable`) | Empêche les doublons : signature = `product_id::variant_id::customization_nettoyée` (les méta `__line_kind`, `__sub_order_key`, `__freight_fee`, `__shipping_service_id` sont **ignorées** dans la signature). Merge côté DB **et** dédup au rendu. |
| Sous-commandes (dérivation) | `src/cockpit/lib/sub-orders.ts` (`deriveSubOrders`) | Groupe les `OrderArticle` par `sub_order_key` (= `vendor_id::LineKind`), calcule `cockpit_scope` ∈ `kawzone | commission | autonomous`, numérote uniquement les Kawzone-managed. |
| Statut par sous-commande | `src/lib/sub-order-states.functions.ts` + table DB `sub_order_states` (colonnes : `order_id`, `sub_order_key`, `status`, `updated_at`, `updated_by`) | Persistance serveur par `(order_id, sub_order_key)`. Aucune propagation au statut mère. |
| Hook Cockpit (statut effectif + renumérotation) | `src/cockpit/hooks/useSubOrderRows.ts` | Pose `effective_status = sub_order_states[…] ?? mother.logistics_status`. Filtre `is_kawzone_managed`. **Renumérote** `index/total/label` sur le sous-ensemble visible (fix du compteur à trous). |
| Pilote orders + override | `src/cockpit/hooks/useRealOrders.ts` | Charge orders, paiements, états sous-commande. Expose `getSubOrderStatus(orderId, subKey, fallback)` et `updateStatus(orderId, status, admin, subKey?)`. Si `subKey` fourni → `upsertSubOrderStatus` (serveur). |
| Vue pipeline (colonnes) | `src/cockpit/components/PipelineView.tsx` | Filtre les cartes par `effective_status` quand `subRows` est passé. |
| Drawer sous-commande | `src/cockpit/components/OrderDrawer.tsx` | Filtre `scopedArticles` par `sub_order_key`. Détecte `isKnownWeight` = tous les articles scope ont `weight_kg > 0`. Compteur `1/3 · 2/3 · 3/3` : **doit utiliser `deriveSubOrders` puis `.filter(is_kawzone_managed)` puis renumérotation** (cf. lignes 84-90). Sections `RelatedSubOrdersStrip` et `AggregateDebugPanel` **volontairement masquées**. |
| Panneau workflow par sous-commande | `src/cockpit/components/WorkflowControlPanel.tsx` | Branche : `isLocal` → `LOCAL_STEPS` ; `isKnownWeight` → `IMPORT_STEPS_KNOWN` (7 étapes, **pas** de pesée / frais / paiement) ; sinon → `IMPORT_STEPS_V2` (10 étapes). Importe `IMPORT_STEPS_KNOWN` depuis `workflow.ts`. |
| Définition des workflows | `src/cockpit/lib/workflow.ts` | `LOCAL_STEPS` (6), `IMPORT_STEPS` (10), `IMPORT_STEPS_KNOWN` (7). Flow d'avancement : `LOCAL_FLOW`, `IMPORT_FLOW`. `getNextStep(status, importOrder)`. |
| Numérotation | `src/cockpit/lib/orderNumbers.ts` | `getOrderNumber(orderId)` → `KZ-000001` (localStorage, immuable). `formatSubOrderLabel(orderId, index, total)` → `KZ-000101 · 2/3` (rien si `total <= 1`). |
| Audit lisible | `src/cockpit/components/OrderAuditTimeline.tsx` | Doit humaniser `[uuid::IMPORT_KNOWN_WEIGHT] Statut → confirmed` via `STATUS_LABELS` + `LINE_KIND_SHORT`. |
| Périmètre Kawzone | `src/lib/kawzone-scope.ts` | Définit qui est géré : `is_admin_shop=true` OR `vendor_mode='commission'`. Autonomous = exclu Cockpit. |

---

## 2. Logique actuelle — Catégories de ligne

`src/lib/line-kind.ts::getLineKind()` :

```
if !srcCountry || !dstCountry || src === dst        → LOCAL
else if productWeightKg > 0                         → IMPORT_KNOWN_WEIGHT
else                                                → IMPORT_UNKNOWN_WEIGHT
```

- Catégorie **calculée au panier** (`getCartItemLineKind`).
- Catégorie **recalculée et figée au checkout** (`checkout.functions.ts` ligne 107) puis stockée dans `order_items.customization.__line_kind`.
- Toute lecture aval passe par `readOrderItemLineKind(item)` (préférence : valeur stampée ; fallback : recalcul).
- **Une ligne appartient à exactement UN `LineKind` du début à la fin.** Aucun reclassement par écran n'est autorisé.

`subOrderKey(vendorId, kind)` = `"${vendorId}::${kind}"` — clé stable côté `sub_order_states` et `order_shipment_assessments`.

---

## 3. Logique actuelle — Sous-commandes

`src/cockpit/lib/sub-orders.ts::deriveSubOrders(articles, motherStatus, motherOrderId)` :

1. Regroupe par `article.sub_order_key ?? article.vendor_id ?? "unknown"`.
2. Calcule pour chaque groupe : `kind` (local / import / local_and_import), `aggregate`, `financials`, `cockpit_scope`.
3. `cockpit_scope` :
   - `kawzone` si au moins un article actif a `is_admin_shop=true`,
   - sinon `commission` si au moins un article actif a `commission_amount > 0`,
   - sinon `autonomous` (HORS Cockpit).
4. `is_kawzone_managed = cockpit_scope !== "autonomous"`.
5. Numérotation : `total = nombre de sous-commandes Kawzone-managed`. Les autonomes reçoivent `index=0` et le label `${vendor_name} (autonome)`.

> **Important** : `deriveSubOrders` numérote déjà en excluant les autonomes. Mais le Drawer ré-applique aussi la renumérotation après son propre `.filter(is_kawzone_managed)` pour garantir la cohérence avec `useSubOrderRows`.

---

## 4. Logique actuelle — Compteurs `1/3 · 2/3 · 3/3`

Deux endroits doivent **partager le même calcul** :

### Liste Cockpit
`useSubOrderRows.ts` :
```ts
const managed = allRows.filter(r => r.is_kawzone_managed);
// regroupe par mother_order_id, puis :
arr.forEach((r, i) => out.push({
  ...r, index: i+1, total: arr.length,
  label: formatSubOrderLabel(oid, i+1, arr.length),
}));
```

### Drawer
`OrderDrawer.tsx` (lignes ~84-90) :
```ts
const raw = deriveSubOrders(articles, status, orderId);
const visible = raw.filter(s => s.is_kawzone_managed);
// renumérotation identique :
visible.forEach((s, i) => s.label = formatSubOrderLabel(orderId, i+1, visible.length));
const currentSub = visible.find(s => s.sub_order_key === subOrderKey);
```

**Règle absolue** : la liste affiche `1/3 · 2/3 · 3/3` ⟺ le Drawer affiche `1/3 · 2/3 · 3/3`. Aucune divergence tolérée.

---

## 5. Logique actuelle — Statut par sous-commande

- Table DB : `sub_order_states(order_id, sub_order_key, status, updated_at, updated_by)`.
- Lecture : `listSubOrderStates({ order_ids })` → cache map dans `useRealOrders`.
- Écriture : `updateStatus(orderId, status, admin, subOrderKey)` :
  - si `subOrderKey` fourni → `upsertSubOrderStatus(...)` (serveur), invalide `["sub-order-states"]`, ajoute audit `[${subOrderKey}] Statut → ${status}`.
  - sinon (legacy) → override local de la mère.
- Lecture côté UI : `effective_status = getSubOrderStatus(orderId, subKey, motherStatus) ?? motherStatus`.
- **`PipelineView` filtre les colonnes sur `effective_status`**, pas sur `order.logistics_status`. Sans ça, le bouton "Confirmer" n'avance pas la carte.

---

## 6. Logique actuelle — Workflow par circuit

`src/cockpit/lib/workflow.ts` + `WorkflowControlPanel.tsx` :

| `LineKind` de la sous-commande | Workflow chargé | Étapes |
|---|---|---|
| `LOCAL` | `LOCAL_STEPS` | new → confirmed → preparing → ready → shipped → delivered |
| `IMPORT_KNOWN_WEIGHT` | `IMPORT_STEPS_KNOWN` | new → confirmed → ordered_supplier → received_warehouse → **ready_delivery** → shipped → delivered |
| `IMPORT_UNKNOWN_WEIGHT` (par défaut import) | `IMPORT_STEPS_V2` | new → confirmed → ordered_supplier → received_warehouse → **awaiting_weighing → fees_calculated → payment_fees** → ready_delivery → shipped → delivered |

Branchement dans `WorkflowControlPanel` :
```ts
if (isLocal)           return <CircuitAccordion steps={LOCAL_STEPS} ... />
if (isKnownWeight)     return <CircuitAccordion steps={IMPORT_STEPS_KNOWN} ... />
// default
return <CircuitAccordion steps={IMPORT_STEPS_V2} ... />
```

`isKnownWeight` est calculé dans `OrderDrawer.tsx` :
```ts
isScoped && scopedArticles.length > 0 &&
  scopedArticles.every(a => a.weight_kg != null && a.weight_kg > 0)
```

> **Aucun produit `IMPORT_UNKNOWN_WEIGHT` ne doit recevoir le circuit KNOWN, et vice-versa.** Le `LineKind` figé au checkout est la vérité.

---

## 7. Logique actuelle — Calcul du fret

| Catégorie | Quand le fret est calculé | Où il est stocké |
|---|---|---|
| `LOCAL` | Jamais | — (zéro fret) |
| `IMPORT_KNOWN_WEIGHT` | **Au checkout**, ligne par ligne (`max(weight_kg, vol_kg) × qty × price_per_kg`) | `order_items.customization.__freight_fee` (figé), agrégé dans `orders.total_shipping_fees`. Assessment créé avec `status=fees_calculated`, `weight_mode=declared`, `air_freight_fee=null`. |
| `IMPORT_UNKNOWN_WEIGHT` | **Après pesée Cockpit** (`addWeighing` → `updateShipmentAssessment`) | `order_shipment_assessments.air_freight_fee`. Au checkout : assessment créé avec `status=pending_arrival`, `weight_mode=unknown`, `air_freight_fee=null`. **Aucun fret facturé avant pesée.** |

Total commande (côté Cockpit) : `useRealOrders::getOrderFinancials` lit `order.total_shipping_fees` (recalculé serveur quand pesée saisie). **`freightMap` côté client est volontairement vide** — plus aucune source fantôme localStorage.

---

## 8. Régressions à corriger (et **uniquement** celles-ci)

Pour chaque régression : la cause racine, le fichier, et la correction minimale. Kimi n'a pas le droit d'aller plus loin.

### 8.1 — Duplication produit dans le panier (un article apparaît plusieurs fois)
- **Cause racine** : signature de ligne contaminée par les anciennes méta `__shipping_service_id` / `__line_kind` / `__sub_order_key` / `__freight_fee` héritées de versions antérieures, qui empêchaient le merge.
- **Fichier** : `src/hooks/use-cart.tsx`.
- **Vérification** : `stripCartInternalMetadata` doit retirer ces 4 clés ; `cartLineSignature` doit utiliser le résultat ; `findSiblingIds` doit comparer avec la même signature ; `addToCart` doit fusionner toutes les `mergeable` rows en gardant la première et supprimant les autres. **Tout cela est déjà implémenté** — vérifier qu'aucune régression n'a réintroduit une de ces 4 clés dans la signature.
- **NE PAS** créer une nouvelle clé de dédup, ne pas changer le schéma DB.

### 8.2 — Le même article apparaît dans KNOWN et UNKNOWN
- **Cause racine** : un écran utilise `getCartItemLineKind` (recalcul live) au lieu de `readOrderItemLineKind` (valeur stampée au checkout) — ou inversement, du code recalcule la catégorie au lieu de lire `customization.__line_kind`.
- **Fichiers** : `src/routes/cart.tsx` (avant checkout : OK d'utiliser `getCartItemLineKind`), `src/cockpit/**` (après checkout : **OBLIGATOIRE** d'utiliser `readOrderItemLineKind` ou `article.line_kind`/`article.sub_order_key`).
- **Correction** : grepper toute occurrence de `getLineKind`/`getCartItemLineKind` dans `src/cockpit/**` et `src/lib/sub-order-states*`/`src/lib/checkout*` et confirmer qu'elles n'apparaissent **que** au panier. Côté Cockpit, n'utiliser que `article.sub_order_key` (stampé) et `readOrderItemLineKind(item)`.
- **NE PAS** modifier `getLineKind` lui-même, ni la liste des 3 catégories.

### 8.3 — Bouton "Confirmer" ne fait pas avancer la sous-commande
- **Cause racine** : `PipelineView` ou `Dashboard` lisent encore `order.logistics_status` au lieu de `row.effective_status`.
- **Fichiers** : `src/cockpit/components/PipelineView.tsx` (ligne 59 : doit filtrer sur `effective_status ?? order.logistics_status`), `src/cockpit/hooks/useSubOrderRows.ts` (pose `effective_status`), `src/cockpit/pages/Dashboard.tsx` (passe `getSubOrderStatus` au hook).
- **Correction** : vérifier que `useSubOrderRows(orders, getSubOrderStatus)` est appelé avec le getter, et que toutes les vues colonnes consomment `effective_status`.
- **NE PAS** repenser la table `sub_order_states`, ni propager le statut à la mère.

### 8.4 — Compteur `1/3` divergent entre liste et Drawer
- **Cause racine** : le Drawer ne filtre pas `is_kawzone_managed` avant de calculer `total`, donc il compte les autonomes invisibles → `1/4` au lieu de `1/3`.
- **Fichier** : `src/cockpit/components/OrderDrawer.tsx` (déjà corrigé : `const visible = raw.filter(s => s.is_kawzone_managed); ... formatSubOrderLabel(oid, i+1, visible.length)`).
- **Correction si régression** : recopier exactement le pattern de `useSubOrderRows.ts` (section "renumérotation").
- **NE PAS** rendre les autonomes visibles dans le Cockpit, ne pas changer la règle de scope.

### 8.5 — Historique audit illisible (`[uuid::IMPORT_KNOWN_WEIGHT] Statut → confirmed`)
- **Cause racine** : `OrderAuditTimeline` affiche `a.action` brut.
- **Fichier** : `src/cockpit/components/OrderAuditTimeline.tsx`.
- **Correction** : appliquer `humanizeAuditAction(a.action)` qui :
  1. parse `[uuid::LINE_KIND] Statut → status`,
  2. mappe `LINE_KIND` via `LINE_KIND_SHORT` (`"Poids déclaré"`, `"Poids inconnu"`, `"Local"`),
  3. mappe `status` via `STATUS_LABELS` (`"Confirmée"`, `"Expédiée"`, …),
  4. retourne `{ label: "Sous-commande Import (Poids déclaré) — Confirmée", sub: undefined }`.
- **NE PAS** afficher les UUID, ni les enums internes, ni les `sub_order_key` bruts.

### 8.6 — Drawer : sections parasites visibles
- Garder **masquées** :
  - `<RelatedSubOrdersStrip>` (commenté autour de la ligne traitant `isScoped && onSubOrderChange`),
  - `<AggregateDebugPanel>` (commenté).
- **NE PAS** les réafficher.

---

## 9. À NE SURTOUT PAS MODIFIER

- `src/lib/line-kind.ts` — la liste des 3 catégories est gravée.
- Schéma DB `sub_order_states`, `order_shipment_assessments`, `order_items.customization` (4 méta stampées : `__line_kind`, `__sub_order_key`, `__freight_fee`, `__shipping_service_id`).
- `src/lib/checkout.functions.ts::createCheckoutOrder` — la logique de stamping et de création des assessments est correcte.
- `src/cockpit/lib/sub-orders.ts::deriveSubOrders` — calcul de scope et numérotation initiale.
- `src/cockpit/lib/workflow.ts` — les 3 workflows (`LOCAL_STEPS`, `IMPORT_STEPS`, `IMPORT_STEPS_KNOWN`).
- `src/integrations/supabase/*` (auto-générés).
- Règle Kawzone-managed (`is_admin_shop OR vendor_mode='commission'`).
- Numérotation `KZ-XXXXXX` (localStorage, immuable une fois attribuée).

---

## 10. Procédure obligatoire pour Kimi avant tout patch

1. **Lire** le fichier listé en section 1 avant de toucher à quoi que ce soit.
2. **Comparer** la version sandbox à celle décrite ici — si elles diffèrent, le sandbox est faux, **pas** la doc.
3. **N'écrire QUE** les corrections explicitement listées en section 8.
4. **Vérifier** que :
   - le `LineKind` d'une ligne est identique du panier au Cockpit,
   - la sous-commande A peut avancer sans bouger la B,
   - aucun produit UNKNOWN n'entre dans le workflow KNOWN,
   - les compteurs `i/n` sont strictement identiques entre liste et Drawer,
   - aucun UUID/clé technique n'apparaît dans l'audit.
5. **Rendre compte** en citant les lignes modifiées (fichier + numéro).

Fin du rapport.
