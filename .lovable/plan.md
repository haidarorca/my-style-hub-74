
# Audit du flux import et plan de refonte par catégorie de ligne

## 1. Audit — ce que fait le système aujourd'hui

### 1.1 Source de la catégorie (LOCAL / IMPORT_KNOWN / IMPORT_UNKNOWN)
Aujourd'hui le système ne connaît que deux dimensions, jamais combinées en une seule catégorie de ligne :
- `is_local` / `is_import` (calculés à partir de `vendor.source_country_id` vs destination)
- un `weight_mode` GLOBAL sur l'`order_shipment_assessment` (`declared` ou `unknown`) — appliqué à toute la commande mère

**Conséquence directe** : dès qu'une seule ligne est à poids inconnu, `weightMode = "unknown"` (`checkout.functions.ts` l.159-160), et **tous les frets déjà calculés à la ligne sont ignorés au niveau assessment** (`air_freight_fee: 0`). C'est la racine du bug "fret figé écrasé après pesée".

### 1.2 Panier (`src/routes/cart.tsx`)
- Sélecteur global "Choisissez votre service" présent.
- Sélecteur par ligne aussi présent (préférence enregistrée via `updateLineShipping`).
- Calcul de `lineFreight` n'utilise que la préférence ligne (correct depuis dernier patch).
- **Problème** : le sélecteur global s'applique visuellement à *tous* les articles import, y compris à poids connu, alors qu'il ne devrait piloter QUE les articles à poids inconnu (règle 2).
- Pas de badge visuel distinguant KNOWN vs UNKNOWN.

### 1.3 Checkout (`src/lib/checkout.functions.ts`)
- Calcul fret par ligne OK (l.106-133).
- Mais `weightMode` global (l.159) + un seul assessment par commande mère (l.197-209).
- `air_freight_fee` initialisé à `freightTotal` seulement si TOUTES les lignes import sont déclarées — sinon `0`, perdant les frets connus.
- **Pas de tag `__line_kind`** posé sur les items pour figer la catégorie au moment du checkout.

### 1.4 Sous-commandes (`src/cockpit/lib/sub-orders.ts`)
- Groupement par `vendor_id` uniquement.
- `kind` calculé `local | import | local_and_import` mais jamais splitté.
- **Conséquence** : un vendeur avec produits import known + import unknown se retrouve dans UNE seule sous-commande mixte, partageant le même workflow.

### 1.5 Cockpit Workflow (`src/cockpit/lib/workflow.ts`)
- Trois flows existent : `LOCAL_FLOW`, `IMPORT_FLOW` (unknown), `IMPORT_FLOW_DECLARED` (known).
- Bascule entre A/B faite par `weight_status` lu sur la commande mère.
- **Problème** : pas indexé par sous-commande × catégorie. Avancer la sous-commande A avance le statut sur `orders.status`, donc la sous-commande B suit.

### 1.6 Avance de statut (`useRealOrders.ts` `updateStatus`)
- Écrit dans `statusOverrides` localStorage clé = `order_id` (mère). **Aucune persistance par sous-commande.**
- La migration vient de créer `sub_order_states` mais aucun code ne l'utilise encore.

### 1.7 WeightForm
- Calcule fret global même sans pesée (estimation locale).
- Quand on enregistre, écrit `air_freight_fee` dans l'assessment unique → écrase le fret déclaré figé.
- Aucune notion "ne concerne QUE les lignes UNKNOWN".

### 1.8 Finances cockpit
- `getOrderFinancials` lit `order.total_shipping_fees` (calculé serveur) — correct uniquement si le serveur agrège fret déclaré figé + fret pesé. Aujourd'hui l'assessment unique stocke EITHER l'un EITHER l'autre, donc faux dès qu'on a mixé.

### 1.9 Articles de boutiques mélangés
- Le groupement `vendor_id` est correct (cf §1.4). Si des lignes apparaissent dans la mauvaise sous-commande, c'est presque certainement parce qu'un item a `vendor_id = NULL` ou un `is_admin_shop` mal renseigné. À auditer en SQL après la refonte avec un script de vérif.

---

## 2. Catégorie de ligne — modèle cible

Helper unique `getLineKind(item)` retournant :
- `LOCAL` : `vendor.source_country_id === destinationCountryId`
- `IMPORT_KNOWN_WEIGHT` : international ET `product.weight_kg > 0`
- `IMPORT_UNKNOWN_WEIGHT` : international ET `(weight_kg null OR <= 0)`

Catégorie figée au checkout dans `order_items.customization.__line_kind` pour traçabilité éternelle (le poids du produit peut changer après).

Une **sous-commande = (vendor_id, line_kind)**. Un vendeur avec 2 catégories génère 2 sous-commandes, chacune avec son propre workflow et son propre état persisté dans `sub_order_states.sub_order_key = "<vendor_id>:<kind>"`.

---

## 3. Plan de refonte — ordre exact

### Étape 1 — Source de vérité unique (foundation)
**Nouveau** : `src/lib/line-kind.ts`
- Type `LineKind = "LOCAL" | "IMPORT_KNOWN_WEIGHT" | "IMPORT_UNKNOWN_WEIGHT"`
- `getLineKind({ vendorSourceCountryId, destinationCountryId, productWeightKg })`
- `subOrderKey(vendorId, kind)` → string stable
- Helper `readLineKindFromItem(item)` (lit `customization.__line_kind` puis recalcule en fallback)

### Étape 2 — Checkout : stamper la catégorie + N assessments
`src/lib/checkout.functions.ts`
- Pour chaque ligne : calculer `kind`, stamper dans `customization.__line_kind`, `__sub_order_key`
- Fret par ligne UNIQUEMENT si `kind === IMPORT_KNOWN_WEIGHT` (cf déjà presque le cas)
- Pour `IMPORT_UNKNOWN_WEIGHT` : stamper le `shippingServiceId` global choisi dans `customization.__shipping_service_id` mais `__freight_fee` à NULL
- Créer **un assessment par sub_order_key** import :
  - KNOWN : `status='fees_calculated'`, `air_freight_fee = somme frets figés`, `weight_mode='declared'`
  - UNKNOWN : `status='pending_arrival'`, `air_freight_fee = NULL`, `weight_mode='unknown'`, `shipping_service_id = choix global`
- Plus de `weightMode` global, plus de "tout-ou-rien".

### Étape 3 — Panier (`src/routes/cart.tsx`)
- Calculer `kind` par ligne (helper réutilisé).
- Sélecteur par ligne visible UNIQUEMENT pour `IMPORT_KNOWN_WEIGHT` (avec fret affiché en FCFA).
- Bloc global "Choisissez votre service" affiché UNIQUEMENT si au moins une ligne `IMPORT_UNKNOWN_WEIGHT`, et libellé "S'applique aux articles à poids inconnu". Affiche tarifs au kg.
- Badge par ligne : LOCAL / "Poids déclaré · fret figé" / "Poids inconnu · fret après pesée".
- `lineFreight` reste 0 pour UNKNOWN (badge "Calculé après pesée").

### Étape 4 — Dérivation sous-commandes (`src/cockpit/lib/sub-orders.ts`)
- Grouper par `(vendor_id, line_kind)` via `__line_kind` lu sur les articles.
- `DerivedSubOrder.kind` devient `LineKind`.
- `sub_order_key` propagé.
- Label : "Boutique X · Local" / "Boutique X · Import poids connu" / "Boutique X · Import poids inconnu".

### Étape 5 — Workflow par catégorie (`workflow.ts`)
- Trois flows indexés par `LineKind`. Pas de bascule par `weight_status` mère.
- KNOWN : new → confirmed → ordered_supplier → received_warehouse → weight_verified → ready_delivery → shipped → delivered (8 étapes, pas de calcul frais, pas de paiement).
- UNKNOWN : flow actuel 10 étapes.
- LOCAL : flow actuel 6 étapes.
- Export `getNextStepFor(kind, currentStatus)`.

### Étape 6 — Persistance par sous-commande
- Nouveau server fn `updateSubOrderStatus({ order_id, sub_order_key, status })` qui écrit dans `sub_order_states` (créé par la migration).
- `useRealOrders.updateStatus` devient `updateSubOrderStatus`, n'écrit plus sur `orders.status`.
- Le statut affiché en cockpit est lu depuis `sub_order_states` puis fallback `orders.status` pour les anciennes commandes.
- Le statut global `orders.status` est calculé serveur = min(statuts sous-commandes).

### Étape 7 — Pesée stricte (`WeightForm.tsx`, `useRealOrders.ts`)
- WeightForm n'accepte plus de soumission sans `real_weight_kg > 0` (ou dimensions valides).
- Liste affichée = uniquement items de la **sous-commande UNKNOWN ouverte** (filtre par sub_order_key).
- Mode "global" = somme du poids inconnu de cette sous-commande. Mode "par article" = saisie par item.
- Persiste sur l'assessment de cette sub_order_key uniquement (jamais celle KNOWN).
- Tant qu'aucun poids saisi : `real_weight_kg`, `volumetric_weight_kg`, `air_freight_fee` restent NULL.

### Étape 8 — Finances cockpit
- `getOrderFinancials(order)` agrège **par sous-commande** :
  - `freight = SUM(assessments.air_freight_fee NOT NULL)` (jamais d'estimation).
  - `productTotal` filtré par sub_order_key.
- Affiche par sous-commande dans le drawer ; le total mère = somme.

### Étape 9 — Badges visuels (règle 8)
- `SubOrderBadges.tsx` : 3 badges distincts (couleurs : LOCAL vert, KNOWN bleu, UNKNOWN orange).
- `OrderItemsPanel` et `cart.tsx` réutilisent le même composant `<LineKindBadge kind=... />`.

### Étape 10 — Vérif anti-fuite boutiques (règle 6)
- Audit SQL : `SELECT order_id, vendor_id, COUNT(*) FROM order_items WHERE vendor_id IS NULL` pour repérer les items orphelins.
- Ajouter `NOT NULL` runtime check au checkout : refuser un produit sans `vendor_id`.
- Dans `sub-orders.ts` : ignorer les articles avec `vendor_id == null` (les afficher dans un bucket "Inconnu" plutôt que de polluer une sous-commande légitime).

---

## 4. Fichiers touchés

| Étape | Fichier | Action |
|---|---|---|
| 1 | `src/lib/line-kind.ts` | créer |
| 2 | `src/lib/checkout.functions.ts` | refonte assessments |
| 3 | `src/routes/cart.tsx` | UI 3 catégories |
| 4 | `src/cockpit/lib/sub-orders.ts` | grouper (vendor, kind) |
| 4 | `src/cockpit/hooks/useSubOrderRows.ts` | propager sub_order_key |
| 5 | `src/cockpit/lib/workflow.ts` | flows par kind |
| 6 | `src/lib/sub-order-states.functions.ts` | créer (RPC update statut) |
| 6 | `src/cockpit/hooks/useRealOrders.ts` | persistance par sub-order |
| 7 | `src/cockpit/components/WeightForm.tsx` | strict + filtré sub-order |
| 7 | `src/cockpit/components/OrderDrawer.tsx` | passer sub_order_key au form |
| 8 | `src/lib/admin-logistics.functions.ts` | `total_shipping_fees` par sub-order |
| 9 | `src/cockpit/components/SubOrderBadges.tsx` | 3 badges |
| 9 | `src/components/cart/LineKindBadge.tsx` | nouveau partagé |

---

## 5. Risque & migration de données existantes

Les commandes déjà passées n'ont ni `__line_kind` ni `sub_order_key`. Le helper `readLineKindFromItem` recalcule à la volée à partir du produit actuel ; suffisant pour l'affichage. Les anciens assessments restent (unique par order_id, `sub_order_key = NULL`) et continuent d'être lus en fallback dans la finance.

---

## 6. Validation avant d'écrire

Avant d'attaquer le code, je veux confirmer trois points qui changent la portée :

1. **Sous-commande par catégorie** : valider qu'une boutique avec 1 produit KNOWN + 1 produit UNKNOWN doit donner **2 sous-commandes distinctes** côté cockpit (deux lignes dans la liste, deux workflows, deux historiques). C'est ma compréhension de la règle 3+5 mais ça change l'UI.
2. **Sélecteur global panier** : le bloc "Choisissez votre service" affiche-t-il les tarifs/kg de tous les services actifs ou seulement de ceux compatibles avec le pays de destination ?
3. **Statut commande mère** : faut-il garder `orders.status` (utilisé hors cockpit : admin1, vendor, customer notifications) calculé comme min des sous-commandes, ou le déprécier complètement ?

Réponds aux 3 et je lance l'implémentation dans l'ordre listé en §3.
