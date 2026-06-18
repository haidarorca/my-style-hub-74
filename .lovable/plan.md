
## Audit du flux actuel

J'ai relu Panier → Checkout → `order_items` → `order_shipment_assessments` → Cockpit → Workflow. Voici les écarts par rapport à ta logique métier.

### 1. Typage des lignes — manquant
Aujourd'hui le système raisonne sur deux axes mélangés : `is_local / is_import` (origine) et `weight_mode` global (assessment). Il n'existe nulle part de drapeau **par ligne** `IMPORT_KNOWN_WEIGHT` vs `IMPORT_UNKNOWN_WEIGHT`. D'où les mélanges de circuits sur les commandes mixtes.

### 2. Panier (`src/routes/cart.tsx`)
- Le bloc « Choisissez votre service de transport » (lignes 468+) existe encore mais s'applique au total via `hasIntlItems`. Le correctif précédent a ajouté un fallback `cheapestServiceId` par ligne pour les articles à poids connu — OK.
- Mais le bloc global est appliqué à **tous** les articles internationaux, y compris à poids connu, alors qu'il ne doit plus concerner que les poids inconnus.
- Aucun sélecteur individuel par ligne pour un produit poids connu si l'utilisateur veut changer (Express vs Avion).

### 3. Checkout (`src/lib/checkout.functions.ts`)
- `weightMode` est calculé **globalement** pour toute la commande (ligne 159) : `allIntlDeclared` devient `false` dès qu'**un seul** article est inconnu → la commande entière bascule en circuit "pesée", même les lignes à poids connu perdent leur statut.
- L'assessment unique par commande (`order_shipment_assessments`) ne permet pas d'exprimer "A et B figés, C et D à peser".

### 4. Cockpit / Workflow (`src/cockpit/lib/workflow.ts`, `useRealOrders.ts`)
- `getOrderFinancials` lit `order.total_shipping_fees` (OK depuis le dernier correctif), mais le workflow choisi reste binaire par commande.
- Conséquence : une commande mixte affiche encore "Pesée → Frais → Paiement" même pour ses lignes à poids connu.

### 5. Pesée — valeurs inventées
`WeightForm` calcule un fret estimatif en local et l'écrit dans `air_freight_fee` même quand l'agent n'a pas saisi de poids réel. À corriger : tant qu'aucune saisie, `real_weight_kg = NULL` et `air_freight_fee = NULL`.

### 6. Sous-commandes (`src/cockpit/lib/sub-orders.ts`)
Le groupement par `vendor_id` est correct — pas de mélange entre boutiques au niveau du calcul. **Le bug observé vient probablement d'ailleurs** : `updateStatus` agit sur la commande mère (`orders.status`), pas sur la sous-commande, donc faire avancer la boutique A fait avancer le statut affiché pour B. À vérifier en priorité.

---

## Architecture cible

### Trois types stricts, déterminés par ligne

```text
LOCAL                  : product.source_country = destination
IMPORT_KNOWN_WEIGHT    : import + weight_kg > 0
IMPORT_UNKNOWN_WEIGHT  : import + weight_kg = 0/NULL
```

Le type est dérivé à la volée (pas de migration) à partir de `products.weight_kg` et `source_country_id`, et stamp sur `order_items.customization.__line_kind` au checkout pour traçabilité.

### Sous-commande = (vendeur, type)
Au lieu de grouper uniquement par `vendor_id`, on groupe par `(vendor_id, kind)`. Une commande "Boutique X avec Huo (connu) + T-shirt (inconnu)" produit 2 sous-commandes :
- `Boutique X — Import poids connu` (circuit court)
- `Boutique X — Import poids inconnu` (circuit pesée)

Chaque sous-commande a son workflow indépendant.

### Assessment par sous-commande
Migration : ajouter `order_shipment_assessments.sub_order_key (text)` et basculer la contrainte d'unicité de `(order_id)` vers `(order_id, sub_order_key)`. Une commande mixte aura 1 assessment "declared" (avec `air_freight_fee` figé) + 1 assessment "unknown" (initialement NULL).

### Workflow par type

```text
LOCAL              : nouvelle → confirmée → préparation → prête → expédiée → livrée
IMPORT_KNOWN       : nouvelle → confirmée → fournisseur → réception → vérif poids → prête → expédiée → livrée
IMPORT_UNKNOWN     : nouvelle → confirmée → fournisseur → réception → pesée → frais → paiement → prête → expédiée → livrée
```

Aucune étape "pesée/frais/paiement" pour KNOWN, jamais.

---

## Changements concrets

### Panier (`src/routes/cart.tsx`)
- Restaurer un **sélecteur par ligne** sur chaque article `IMPORT_KNOWN_WEIGHT` (dropdown des services applicables, prix figé recalculé immédiatement).
- Le bloc global "Choisissez votre service de transport / prix au kg" ne s'affiche **que** s'il y a au moins un article `IMPORT_UNKNOWN_WEIGHT`, et ne s'applique qu'à ces lignes.
- `hasIntlItems` → remplacer par `hasUnknownWeightItems` pour la contrainte de validation.

### Checkout (`src/lib/checkout.functions.ts`)
- Calculer `kind` par ligne, stamper `customization.__line_kind`.
- Calculer `freight` par ligne uniquement pour `IMPORT_KNOWN_WEIGHT` (déjà fait, garder).
- Créer **N assessments** : un par `(kind)` pour les lignes import de la commande. KNOWN → `status="fees_calculated"`, `air_freight_fee=Σ freight`. UNKNOWN → `status="pending_arrival"`, `air_freight_fee=NULL`.

### Sous-commandes (`src/cockpit/lib/sub-orders.ts`)
- Groupement par `(vendor_id, kind)` où `kind ∈ {local, import_known, import_unknown}`.
- Label sous-commande : drapeau Chine + badge `Poids connu` / `Poids inconnu`.

### Workflow (`src/cockpit/lib/workflow.ts`, `src/lib/workflow.config.ts`)
- Trois workflows séparés indexés par `kind`.
- `WorkflowControlPanel` consomme le kind de la sous-commande, pas un `weight_mode` global.

### Statut par sous-commande (bug #7)
- Audit de `updateStatus` dans `admin-logistics.functions.ts` : si elle modifie `orders.status`, la passer à `order_article_states.status` ou créer une table `sub_order_states (order_id, sub_order_key, status, updated_at)`.
- Les transitions de la sous-commande A ne touchent plus celles de B.

### Pesée (`src/cockpit/components/WeightForm.tsx`)
- Mode global (existant) — conservé.
- Mode "par article inconnu" (existant) — corrigé : ne JAMAIS écrire `air_freight_fee` ni `real_weight_kg` tant que l'agent n'a pas saisi. Champs `dimensions L × l × H` optionnels pour calcul volumétrique. Formule : `max(real, volumetric) × rate`.
- Le formulaire ne liste que les articles `IMPORT_UNKNOWN_WEIGHT` de la sous-commande courante.

### Cockpit Finance (`useRealOrders.ts`)
- Source unique : somme des `air_freight_fee` des assessments de la commande + `__freight_fee` des lignes. Pas d'estimation.
- Si aucun assessment n'a `air_freight_fee`, afficher "Fret : en attente pesée" (pas 0, pas estimé).

### Badges
- `LOCAL` → drapeau pays destination, badge "Local".
- `IMPORT_KNOWN_WEIGHT` → drapeau Chine + badge vert "Poids connu — fret figé".
- `IMPORT_UNKNOWN_WEIGHT` → drapeau Chine + badge orange "Poids inconnu — pesée requise".

---

## Détails techniques

**Fichiers modifiés (sans schéma) :**
- `src/lib/checkout.functions.ts` — stamp `__line_kind`, créer N assessments.
- `src/routes/cart.tsx` — sélecteur par ligne KNOWN, bloc global réservé UNKNOWN.
- `src/cockpit/lib/sub-orders.ts` — groupement `(vendor, kind)`.
- `src/cockpit/lib/workflow.ts`, `src/lib/workflow.config.ts` — 3 workflows distincts.
- `src/cockpit/components/WeightForm.tsx` — pas d'écriture sans saisie, dimensions optionnelles.
- `src/cockpit/components/OrderDrawer.tsx`, `WorkflowControlPanel.tsx` — passer le `kind` au workflow.
- `src/cockpit/hooks/useRealOrders.ts` — finances par sous-commande, jamais inventées.
- `src/cockpit/components/SubOrderBadges.tsx`, `SubOrderCard.tsx` — nouveaux badges.

**Migration DB minimale :**
1. `order_shipment_assessments.sub_order_key TEXT` (nullable, défaut NULL = ancien comportement).
2. Index `(order_id, sub_order_key)`.
3. `order_shipment_assessments.air_freight_fee` rendu nullable si ce n'est pas déjà le cas.
4. Backfill : pour les commandes existantes, laisser `sub_order_key = NULL`.

**Hors scope :**
- Pas de refonte UI Cockpit générale.
- Pas de changement de la logique d'audit/events.
- Pas de modification des règles de commission.

---

## Question avant exécution

Cette refonte touche 9 fichiers + 1 micro-migration. Je préfère confirmer 2 points avant de coder :

**1. Stratégie sous-commande** : grouper par `(vendor_id, kind)` (= une boutique avec mix KNOWN+UNKNOWN apparaît 2 fois dans le cockpit, chacun son workflow) — ou garder 1 sous-commande par boutique avec un état mixte affichant les deux circuits côte à côte ?

**2. Migration assessment** : ajouter `sub_order_key` (recommandé, propre) — ou conserver un seul assessment par commande avec un champ JSON `per_kind_freight` (plus rapide à livrer mais moins propre) ?

Réponds par exemple : "1=split / 2=sub_order_key" et je lance l'implémentation globale.
