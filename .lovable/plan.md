
# Intégration Bright Data — Import Taobao/1688

## 1. Coûts estimés (tarifs publics Bright Data, Nov 2025)

**Web Scraper API (datasets dédiés Taobao / Tmall / 1688)** — modèle Pay-As-You-Go :

| Volume mensuel | Tarif unitaire | Coût total |
|---|---|---|
| 100 produits | ~$1.50 / 1 000 records (palier bas) | **~$0.15 – $0.30** |
| 1 000 produits | $1.50 / 1 000 | **~$1.50 – $3** |
| 10 000 produits | dégressif (~$1.05/1 000) | **~$10 – $20** |
| 100 000 produits | dégressif (~$0.80/1 000) | **~$80 – $150** |

**Coûts annexes possibles** :
- Pas d'abonnement obligatoire en PAYG (mais Bright Data pousse souvent un plan $499/mois "Growth" — **à refuser**, le PAYG suffit largement à votre échelle de démarrage).
- Découverte boutique (Discover by shop URL) : facturée au record retourné, même tarif.
- Pas de frais de proxy résidentiel séparés — tout est inclus dans le prix par record.

**Coût pratique pour Kawzone** :
- 100 imports/mois ≈ **< $1**
- 1 000 imports/mois ≈ **~$2**
- Boutique de 500 produits ≈ **~$1**

→ Très en-dessous du coût d'un VPS + Playwright (~$20–50/mois + maintenance).

## 2. Architecture cible

```text
Admin UI (existant)
   │
   ▼
[importTaobaoProduct(url)]  ◄── server fn (TanStack)
   │
   ├─► 1. Normaliser URL (résoudre click.world.taobao.com → vrai item.htm)
   ├─► 2. Cache anti-doublon (product_admin_metadata.source_url + source_product_id)
   ├─► 3. Bright Data API (scrape ou trigger+poll selon dataset)
   │        └─► JSON propre : titre, prix, prix par SKU, images HD, variantes, vendeur
   ├─► 4. IA Gemini (traduction FR, désignation, description marketing, mapping catégorie EXISTANTE)
   └─► 5. Insertion brouillon (status="draft", is_active=false) + images + variants
                                                            │
                                                            ▼
                                                Admin valide manuellement
```

**Aucune publication automatique. Aucune création de nouvelle catégorie.**

## 3. APIs Bright Data utilisées

| Besoin | Dataset / Endpoint |
|---|---|
| Produit Taobao | `Taobao Products` (collect by URL) |
| Produit Tmall | `Tmall Products` (collect by URL) |
| Produit 1688 | `1688 Products` (collect by URL) |
| Boutique Taobao/Tmall | `Taobao Shop` (discover by shop URL → liste de produits) |
| Boutique 1688 | `1688 Shop` (discover by shop URL) |

Mode d'appel : **Trigger + Poll** (`POST /datasets/v3/trigger` → `GET /datasets/v3/snapshot/{id}`), ou `Collect by URL` synchrone pour 1 produit.

## 4. Gestion des problématiques

| Sujet | Solution |
|---|---|
| **Sessions** | Géré par Bright Data côté serveur — pas de cookies à stocker chez nous |
| **Cookies** | Idem, transparent |
| **Proxies** | Résidentiels chinois inclus, rotation automatique |
| **Anti-blocage** | Inclus (CAPTCHA, retry, fingerprint) — c'est le cœur du service |
| **Cache** | Table `product_admin_metadata` (déjà existante) + clé d'unicité sur `source_url` normalisée + `source_product_id` |
| **Doublons** | 3 niveaux : URL normalisée, `source_product_id` extrait, hash (vendor + nom). Si doublon → renvoyer ID existant, pas de réimport |
| **Limite intelligente** | Lots de 5–10 produits, backoff exponentiel, plafond configurable (défaut 50 par lancement boutique) |

## 5. Ce qui sera supporté

- ✅ Variantes complètes (taille, couleur, image par variante)
- ✅ **Prix par variante / SKU** (le dataset Taobao les retourne)
- ✅ Images HD (URLs originales, pas de thumbnails)
- ✅ Import par URL produit unique
- ✅ Import boutique entière (avec limite)
- ✅ Brouillons admin uniquement (`status="draft"`, `is_active=false`)
- ✅ Anti-doublons strict
- ✅ Catégories existantes uniquement (mapping IA, pas de création)

## 6. Phases de livraison

### Phase 1 — Fondations (immédiat, ~1 itération)
1. Ajout des secrets : `BRIGHTDATA_API_KEY`, `BRIGHTDATA_DATASET_TAOBAO_PRODUCT`, `_TMALL_PRODUCT`, `_1688_PRODUCT`, `_TAOBAO_SHOP`, `_1688_SHOP`
2. Nouveau module `src/lib/scraping/brightdata.server.ts` (trigger + poll + normalisation JSON)
3. Helper `resolveTaobaoShortLink()` (résout `click.world.taobao.com` → vraie URL)
4. Mise à jour de `scrapeProductForAi` : Bright Data en moteur principal, Firecrawl en fallback
5. Anti-doublons renforcé (ajout colonne `source_product_id` si absente)

→ **Prêt immédiatement** : import produit unique Taobao/Tmall/1688 avec variantes + prix par SKU + images HD.

### Phase 2 — Boutique + lots (suit Phase 1)
1. `discoverShopProductLinks` réécrit avec Bright Data `Discover by shop URL`
2. Traitement par lot de 5 (concurrence limitée), avec progression UI
3. Skip automatique des doublons
4. Statut "X/Y importés, Z doublons ignorés"

→ **Prêt** : import boutique 1 à 500 produits.

### Phase 3 — Robustesse & évolutivité (plus tard, si besoin)
- File d'attente persistante (Inngest, déjà connecté) pour gros lots > 50
- Re-sync programmée des prix/stocks des produits déjà importés
- Vue admin "Historique des imports" + relance d'un échec
- Webhook Bright Data → traitement asynchrone (au lieu de poll)

## 7. Limites & risques

| Risque | Mitigation |
|---|---|
| Dataset Bright Data temporairement HS | Fallback Firecrawl conservé |
| Prix Bright Data évolue | PAYG sans engagement, basculement possible |
| Quotas dépassés en un coup | Plafond dur côté serveur (par défaut 50/lancement, configurable) |
| Latence trigger+poll (5–30 s par produit) | UI asynchrone avec barre de progression, ou Inngest en Phase 3 |
| Catégorie IA mal mappée | Catégorie laissée à `null` si pas de match — admin choisit |

## 8. Ce qui ne change PAS

- Pages admin existantes, routes, layouts
- Tables `products`, `product_images`, `product_variants`, `product_admin_metadata`, `categories`
- Workflow de validation manuelle (brouillon → admin valide → publication)
- Firecrawl (gardé en fallback pour sites non-Taobao/1688)
- Toutes les autres server functions

## 9. Ce qu'il me faut de votre côté avant Phase 1

1. Créer un compte sur **brightdata.com**
2. Activer en Pay-As-You-Go les 5 datasets :
   - Taobao Products, Tmall Products, 1688 Products
   - Taobao Shop, 1688 Shop
3. Copier dans un endroit sûr :
   - **API Token** (Account settings → API tokens)
   - **5 Dataset IDs** (format `gd_xxxxxxxxxxxxx`)

Dès que vous me dites "OK Phase 1", je demande les 6 secrets via le formulaire sécurisé, puis je code Phase 1 sans toucher au reste du projet.
