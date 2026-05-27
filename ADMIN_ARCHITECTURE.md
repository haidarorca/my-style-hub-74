# KAWZONE — Architecture Espace Admin Complet (Documentation Interne)

## SOMMAIRE
1. [Vue d'ensemble](#1-vue-densemble)
2. [Stack Technique](#2-stack-technique)
3. [Authentification & Securite](#3-authentification--securite)
4. [Systeme de Permissions (RBAC)](#4-systeme-de-permissions-rbac)
5. [Audit Logging](#5-audit-logging)
6. [Structure des Fichiers](#6-structure-des-fichiers)
7. [Module Commandes](#7-module-commandes)
8. [Module Logistique (ERP)](#8-module-logistique-erp)
9. [Module Commission](#9-module-commission)
10. [Module Vendeurs](#10-module-vendeurs)
11. [Module Produits](#11-module-produits)
12. [Module Import/Export](#12-module-importexport)
13. [Workflows Metiers](#13-workflows-metiers)
14. [Base de Donnees](#14-base-de-donnees)
15. [Flux de Donnees (Data Flow)](#15-flux-de-donnees)

---

## 1. VUE D'ENSEMBLE

Kawzone est une marketplace internationale (B2B2C) qui connecte :
- **Fournisseurs** (principalement en Chine/Turquie) → vendent des produits
- **Vendeurs locaux** (Afrique) → revendent avec commission
- **Clients finaux** → achètent sur la plateforme

### L'espace admin est un ERP (Enterprise Resource Planning) qui gere :
- **Commandes** : validation, traitement, statuts
- **Logistique** : pesee, fret aerien, tracking, livraison
- **Commission** : calcul et paiement des commissions vendeurs
- **Produits** : moderation, import, categorisation
- **Vendeurs** : onboarding, validation, statistiques
- **Finances** : paiements, confirmations, reste a payer
- **Audit** : trace de toutes les actions admin

---

## 2. STACK TECHNIQUE

### Frontend
| Technologie | Usage |
|-------------|-------|
| **React 19** | Framework UI |
| **TypeScript** | Typage statique |
| **Tailwind CSS** | Styling utilitaire |
| **shadcn/ui** | Composants UI (boutons, tableaux, dialogs) |
| **TanStack Router** | Routage type-safe (fichiers dans `src/routes/`) |
| **TanStack Query** | Gestion d'etat serveur (cache, invalidation) |
| **TanStack Start** | Server Functions (remplace API REST traditionnelle) |
| **sonner** | Toast notifications |
| **lucide-react** | Icones |

### Backend (serverless via Supabase)
| Technologie | Usage |
|-------------|-------|
| **Supabase** | Backend-as-a-Service (BaaS) |
| **PostgreSQL** | Base de donnees relationnelle |
| **Row Level Security (RLS)** | Controle d'acces au niveau des lignes |
| **Supabase Auth** | Authentification (OTP, email, OAuth) |
| **Supabase Storage** | Stockage fichiers (images, photos colis) |
| **Supabase Functions** | Edge functions (optionnel) |

### Outils
| Outil | Usage |
|-------|-------|
| **Vite** | Bundler / build tool |
| **Git** | Version control |
| **Lovable** | Plateforme de deploiement (CI/CD) |

---

## 3. AUTHENTIFICATION & SECURITE

### 3.1 Auth Middleware
Fichier : `src/integrations/supabase/auth-middleware.ts`

```
Chaque requete admin passe par ce middleware :
1. Verifie le token JWT Supabase dans le cookie
2. Recupere l'userId du contexte
3. Si pas authentifie → erreur 401
4. Si authentifie → ajoute { userId, supabase } au contexte
```

### 3.2 Admin Auth Core
Fichier : `src/lib/admin-auth.core.ts`

```typescript
// Verifie qu'un admin a une permission specifique
assertPermission(userId, "orders")     // → throw si pas autorise
assertPermission(userId, "vendors")    // → throw si pas autorise
assertPermission(userId, "products")   // → throw si pas autorise
assertSuperAdmin(userId)               // → throw si pas super-admin

// Log toute action admin
logAdminAction({
  action: "shipment.payment_confirm",
  targetType: "shipment_payment",
  targetId: "uuid",
  oldValues: { status: "pending" },
  newValues: { status: "confirmed" }
})

// Combinaison : verifie permission + log automatique
requireAdminAction(userId, "orders", auditPayload)
```

### 3.3 Permission Check SQL
Fichier : SQL dans Supabase

```sql
-- Fonction SQL qui verifie les permissions
has_admin_permission(user_id UUID, permission TEXT) → BOOLEAN

-- Table admin_roles
admin_id | role (super_admin, admin, moderator, support)

-- Table admin_role_permissions
role       | permission
super_admin | orders
super_admin | vendors
super_admin | products
admin       | orders
admin       | shipments
...
```

---

## 4. SYSTEME DE PERMISSIONS (RBAC)

### Roles disponibles
| Role | Permissions |
|------|-------------|
| **super_admin** | TOUT (orders, vendors, products, finances, settings) |
| **admin** | orders, vendors, products, shipments, categories |
| **moderator** | products (moderation uniquement) |
| **support** | orders (lecture uniquement), chat support |
| **logistics_manager** | shipments, tracking, warehouse |
| **finance_manager** | payments, commissions, refunds |

### Granularite des permissions
Chaque fonction serveur verifie la permission :
```typescript
// Exemple : lister les commandes
listOrders: assertPermission("orders")
// Exemple : confirmer un paiement
confirmPayment: assertPermission("orders")
// Exemple : valider un vendeur
validateVendor: assertPermission("vendors")
// Exemple : moderer un produit
moderateProduct: assertPermission("products")
```

---

## 5. AUDIT LOGGING

### 5.1 Table admin_action_log
```sql
id          | UUID (PK)
action      | TEXT (ex: "shipment.payment_confirm")
actor_id    | UUID (admin qui a fait l'action)
actor_email | TEXT
actor_role  | TEXT
target_type | TEXT ("order", "shipment_payment", "vendor")
target_id   | UUID
old_values  | JSONB
new_values  | JSONB
created_at  | TIMESTAMP
```

### 5.2 Actions tracees automatiquement
- Creation d'evaluation logistique
- Confirmation de paiement
- Mise a jour tracking
- Validation vendeur
- Moderation produit
- Archivage commande
- Creation colonne personnalisee

### 5.3 Front
Fichier : `src/routes/admin.audit.tsx`
- Table paginee des actions
- Filtres par date, admin, type d'action
- Diff visuel old → new

---

## 6. STRUCTURE DES FICHIERS

```
src/
├── routes/                          # Pages (TanStack Router)
│   ├── admin.tsx                    # Layout admin (sidebar, header)
│   ├── admin.index.tsx              # Dashboard principal
│   ├── admin.orders.tsx             # Liste commandes
│   ├── admin.order.$orderId.tsx     # Detail commande
│   ├── admin.logistics.tsx          # ★ ERP Logistique
│   ├── admin.shipments.tsx          # Evaluations logistiques
│   ├── admin.commission-orders.tsx  # Commandes commission
│   ├── admin.commission-products.tsx# Produits commission
│   ├── admin.commission-invoices.tsx# Factures commission
│   ├── admin.commission-payouts.tsx # Paiements commission
│   ├── admin.vendors.tsx            # Liste vendeurs
│   ├── admin.vendor.$vendorId.tsx   # Detail vendeur
│   ├── admin.products.tsx           # Liste produits
│   ├── admin.categories.tsx         # Categories
│   ├── admin.audit.tsx              # Logs audit
│   ├── admin.imports.tsx            # Import produits
│   ├── admin.analytics.tsx          # Statistiques
│   └── admin.settings.tsx           # Parametres
│
├── lib/                             # Fonctions serveur
│   ├── admin-auth.core.ts           # ★ Auth + permissions + audit
│   ├── admin-orders.functions.ts    # Commandes (CRUD)
│   ├── admin-logistics.functions.ts # ★ ERP Logistique (fallback robuste)
│   ├── admin-archive.functions.ts   # Archivage
│   ├── admin-commission.functions.ts# Commission
│   ├── admin-vendor.functions.ts    # Vendeurs
│   ├── admin-products.functions.ts  # Produits
│   ├── admin-analytics.functions.ts # Stats
│   ├── admin-ai.functions.ts        # AI features
│   ├── shipment-assessments.functions.ts # Evaluations logistiques
│   ├── import-export.functions.ts   # Import/Export CSV
│   └── taobao-scraper.service.ts   # Scraping Taobao
│
├── components/
│   ├── shared/
│   │   ├── OrderStatusBadge.tsx     # Badge statut commande
│   │   ├── OrderItemsList.tsx       # Liste items commande
│   │   ├── ShipmentAssessmentDialog.tsx # ★ Dialog evaluation
│   │   ├── BulkActionsBar.tsx       # Actions groupées
│   │   └── EmptyState.tsx           # Etat vide
│   └── ui/                          # shadcn/ui components
│       ├── button.tsx
│       ├── input.tsx
│       ├── dialog.tsx
│       ├── badge.tsx
│       └── ...
│
├── hooks/
│   ├── use-auth.tsx                 # Hook auth (isAdmin, user)
│   └── use-toast.ts                 # Toast notifications
│
├── integrations/
│   └── supabase/
│       ├── auth-middleware.ts       # Middleware auth server
│       ├── client.ts               # Client Supabase (frontend)
│       └── client.server.ts        # Client Supabase (server)
│
├── lib/
│   └── utils.ts                     # cn() et utilitaires
│
supabase/
├── migrations/                      # Migrations SQL
│   ├── 20260527000001_erp_logistics.sql     # Tables logistique
│   └── 20260527000002_fix_logistics_view.sql # Vue logistique
│
└── ...
```

---

## 7. MODULE COMMANDES

### 7.1 Routes
- `/admin/orders` → Liste paginee, filtres, recherche
- `/admin/orders/$orderId` → Detail complet avec timeline

### 7.2 Fonctions serveur
```typescript
listOrders({ page, pageSize, status, q, dateFrom, dateTo }) → OrdersPage
getOrder({ orderId }) → OrderDetail
updateOrderStatus({ orderId, status }) → void
archiveOrders({ orderIds }) → void
```

### 7.3 Statuts de commande
```
new → confirmed → processing → shipped → delivered
           ↓
      cancelled / refunded
```

### 7.4 Filtres
- Par statut (nouvelle, confirmee, en cours, expediee, livree)
- Par date de creation
- Par client (nom, telephone)
- Par montant
- Par pays de destination

---

## 8. MODULE LOGISTIQUE (ERP)

### 8.1 Route principale
- `/admin/logistics` → Centre de controle logistique

### 8.2 Architecture en 3 tiers

#### TIER 1 — KPI Cards (stats globales)
| Carte | Compteur | Valeur FCFA |
|-------|----------|-------------|
| A peser | N | Poids total KG |
| Attente paiement | N | Montant FCFA |
| A expedier | N | N destinations |
| Expediees | N | N destinations |

#### TIER 2 — Tableau Desktop (12 colonnes)
Type | Commande | Client | Statut | Logistique | Paiement | Produits | Total | Frais | Paye | Reste | Tracking | Actions

#### TIER 3 — Mobile Cards
Cards compactes avec actions (Details, WhatsApp)

### 8.3 Fonctions serveur
```typescript
listLogisticsOrders({ page, pageSize, q, orderType, logisticsStatus, paymentStatus }) → LogisticsPage
getLogisticsStats() → LogisticsStats
confirmShipmentPayment({ assessmentId, amountConfirmed }) → void
updateShipmentTracking({ assessmentId, trackingNumber, carrierName, ... }) → void
recordShipmentPayment({ assessmentId, amount, paymentMethod }) → void
listCustomColumns() → CustomColumn[]
saveCustomColumnValue({ columnId, assessmentId, value }) → void
```

### 8.4 Pipeline logistique (workflow)
```
pending_arrival
    ↓
awaiting_weighing        ← Colis arrive a l'entrepot
    ↓
fees_calculated          ← Pesee + calcul volumetrique
    ↓
awaiting_client_validation ← Envoi frais au client
    ↓
validated                ← Client accepte
    ↓
ready_to_ship            ← Preparation expedition
    ↓
shipped                  ← Colis envoye (tracking)
    ↓
delivered                ← Client recoit
```

### 8.5 Calcul du poids volumetrique
```
poids_volumetrique = (Longueur × Largeur × Hauteur) / 5000
poids_facturable = MAX(poids_reel, poids_volumetrique)
fret_aerien = poids_facturable × tarif_kg
frais_totaux = fret_aerien + frais_service + frais_extra
```

### 8.6 Detection automatique LOCAL / IMPORT / MIXED
Pour chaque commande, le systeme analyse les produits :
```
Pour chaque item de la commande :
  → Recupere le product_id
  → Recupere le shop_id du produit
  → Recupere source_country_id du shop
  → Si source_country_id existe → IMPORT
  → Sinon → LOCAL

Resultat :
  - Que des imports → badge IMPORT (bleu)
  - Que des locaux → badge LOCAL (vert)
  - Mixte → badge MIXTE (orange)
  - Impossible a determiner → fallback LOCAL
```

### 8.7 Fallback ultra-robuste
Si les tables logistiques n'existent pas encore :
1. Requete `orders` seule (pas de jointure)
2. Requete `order_items` separee
3. Requete `products` + `shops` separee
4. Requete `order_shipment_assessments` separee
5. Requete `shipment_payments` separee
6. Requete `shipment_tracking` separee
7. Assemblage en memoire

→ **Le dashboard affiche TOUJOURS des donnees**, meme sans migration SQL.

### 8.8 Timeline visuelle (8 etapes)
1. Commande | 2. Entrepot | 3. Pesee | 4. Envoye client | 5. Paiement | 6. Valide | 7. Expedie | 8. Livre

Chaque etape est coloree : gris (pending) → bleu (active) → vert (done)

---

## 9. MODULE COMMISSION

### 9.1 Routes
- `/admin/commission-orders` → Commandes avec commission
- `/admin/commission-products` → Produits commissionnables
- `/admin/commission-invoices` → Factures generees
- `/admin/commission-payouts` → Paiements effectues

### 9.2 Logique
```
Produit commissionnable :
  - Vendeur A ajoute produit du fournisseur F
  - Prix fournisseur : 10 000 FCFA
  - Prix vente : 15 000 FCFA
  - Commission : 5 000 FCFA (33%)

Quand un client achete :
  1. Commande creee avec is_commission = true
  2. Le vendeur recoit la commission
  3. Le fournisseur recoit son prix
  4. La plateforme recoit sa marge
```

---

## 10. MODULE VENDEURS

### 10.1 Routes
- `/admin/vendors` → Liste vendeurs avec statuts
- `/admin/vendors/$vendorId` → Detail vendeur

### 10.2 Statuts vendeur
```
pending_validation → validated → active
                          ↓
                    suspended / blocked
```

### 10.3 Fonctions
```typescript
listVendors({ page, status, q }) → VendorPage
getVendor({ vendorId }) → VendorDetail
validateVendor({ vendorId }) → void
suspendVendor({ vendorId, reason }) → void
```

---

## 11. MODULE PRODUITS

### 11.1 Routes
- `/admin/products` → Liste produits avec moderation
- `/admin/categories` → Arbre categories (L1/L2/L3)

### 11.2 Fonctions
```typescript
listProducts({ page, status, q, categoryId }) → ProductPage
moderateProduct({ productId, action, reason }) → void
updateProductCategory({ productId, categoryId }) → void
```

---

## 12. MODULE IMPORT/EXPORT

### 12.1 Import CSV/Excel
- Upload fichier → preview → mapping colonnes → validation → import

### 12.2 Import AI (visuel)
- Upload photo/video produit
- AI analyse et extrait : nom, description, prix, images
- Generation auto de variants (couleurs, tailles)
- Publication manuelle apres review

### 12.3 Scraping Taobao
- URL Taobao → scraping → extraction données → création produit

---

## 13. WORKFLOWS METIERS

### 13.1 Workflow complet : Commande → Livraison
```
CLIENT passe commande
    ↓
SYSTEME detecte type (LOCAL/IMPORT)
    ↓
SI IMPORT :
    → Commande apparait dans /admin/logistics
    → Statut : "pending_arrival"
    ↓
ENTREPOT recoit colis
    → Admin clique "Creer evaluation"
    → Statut : "awaiting_weighing"
    ↓
ADMIN pese et mesure
    → Saisit L × l × H
    → Systeme calcule poids volumetrique
    → Genere frais de transport
    → Statut : "fees_calculated"
    ↓
SYSTEME envoie frais au client
    → WhatsApp/SMS/Email
    → Statut : "awaiting_client_validation"
    ↓
CLIENT valide les frais
    → Statut : "validated"
    ↓
CLIENT paie (Wave/OM/Especes)
    → Admin confirme paiement
    → Statut : "confirmed"
    ↓
ADMIN prepare expedition
    → Saisit numero tracking
    → Choisit transporteur
    → Statut : "ready_to_ship" → "shipped"
    ↓
CLIENT recoit colis
    → Statut : "delivered"
```

### 13.2 Workflow : Paiement Commission
```
Commande livree
    ↓
Systeme calcule commission (prix_vente - prix_fournisseur)
    ↓
Commission apparait dans /admin/commission-payouts
    ↓
Admin verifie et approuve
    ↓
Paiement envoye au vendeur (Wave/OM/Virement)
    ↓
Statut : "paid" → "confirmed"
```

---

## 14. BASE DE DONNEES

### 14.1 Tables principales

```sql
-- Commandes
orders
  id, status, customer_name, customer_phone, customer_address,
  total, created_at, is_commission, shipping_service_id,
  destination_country_id, archived_at

-- Items de commande
order_items
  id, order_id, product_id, quantity, price

-- Evaluations logistiques
order_shipment_assessments
  id, order_id, status, real_weight_kg, volumetric_weight_kg,
  air_freight_fee, service_fee, extra_fees, admin_comment,
  parcel_photo_url, warehouse_location, agent_name, created_by

-- Paiements logistique
shipment_payments
  id, order_shipment_assessment_id, payment_status,
  amount_requested, amount_paid, payment_method,
  payment_reference, confirmed_by, confirmed_at, notes

-- Tracking
shipment_tracking
  id, order_shipment_assessment_id, tracking_number,
  carrier_name, tracking_url, warehouse_received_at,
  weighed_at, shipped_at, estimated_arrival_at

-- Colonnes personnalisees
shipment_custom_columns
  id, name, key, column_type, is_active, sort_order

-- Valeurs personnalisees
shipment_custom_values
  id, column_id, order_shipment_assessment_id,
  value_text, value_number, value_date, value_boolean

-- Audit
admin_action_log
  id, action, actor_id, actor_email, actor_role,
  target_type, target_id, old_values, new_values, created_at

-- Roles admin
admin_roles
  id, admin_id, role

-- Permissions admin
admin_role_permissions
  id, role, permission
```

### 14.2 Vue SQL (optionnelle)
```sql
-- Vue qui joint toutes les tables logistique
logistics_order_view
  (order + assessment + payment + tracking en une seule vue)
```

---

## 15. FLUX DE DONNEES

### 15.1 Chargement initial page /admin/logistics
```
Page charge
    ↓
useAuth() verifie isAdmin
    ↓
getLogisticsStats()        -- Stats globales (KPI cards)
    ↓
listLogisticsOrders()      -- Liste commandes (tableau)
    ↓
Donnees affichees
    ↓
User clique "Details" sur une ligne
    ↓
Dialog s'ouvre avec Timeline + Actions
```

### 15.2 Action : Confirmer un paiement
```
User clique "Confirmer paiement"
    ↓
confirmShipmentPayment({ assessmentId, amountConfirmed })
    ↓
Server : assertPermission("orders")
    ↓
Server : UPDATE shipment_payments SET amount_paid = ?, status = "confirmed"
    ↓
Server : INSERT INTO admin_action_log (action, target_type, ...)
    ↓
Return { ok: true }
    ↓
Frontend : invalidateQueries(["admin-logistics"])
    ↓
Frontend : toast.success("Paiement confirme")
    ↓
KPI cards + Tableau se rafraichissent
```

### 15.3 Action : Creer evaluation
```
User clique "Creer evaluation"
    ↓
getOrCreateShipmentAssessment({ order_id })
    ↓
Server : assertPermission("orders")
    ↓
Server : INSERT INTO order_shipment_assessments (order_id, status: "pending_arrival")
    ↓
Return { assessment_id }
    ↓
Frontend : Dialogue evaluation s'ouvre
    ↓
Admin saisit poids, dimensions
    ↓
Systeme calcule frais automatiquement
    ↓
Admin sauvegarde → envoie au client
```

---

## 16. SECURITE & ROBUSTESSE

### 16.1 Protection contre les crashs
```typescript
// Tous les lookups de config sont "safe" :
safeOrderStatus(status)     // fallback "?" gris
safeLogStatus(status)       // fallback "?" gris
safePayStatus(status)       // fallback "?" gris
safeOrderType(type)         // fallback "local"

// Toutes les valeurs optionnelles ont fallback :
detailRow?.amount_remaining ?? 0
stats?.total_remaining ?? 0
row?.tracking_number ?? null
```

### 16.2 Fallback query indestructible
```
Si vue SQL n'existe pas → fallback requetes separees
Si tables logistique n'existent pas → fallback sur orders seul
Si tout echoue → retourne [] (pas d'erreur)
```

### 16.3 Mobile-first
```
Desktop : Tableau dense 12 colonnes
Mobile  : Cards compactes + filtres scrollables horizontaux
```

---

## 17. ROADMAP

### Deja implemente
- [x] Dashboard principal (KPI + Tableau + Mobile)
- [x] Timeline visuelle 8 etapes
- [x] Detection auto LOCAL/IMPORT/MIXED
- [x] Fallback query ultra-robuste
- [x] Safe lookups (pas de crash runtime)
- [x] Audit logging
- [x] Permissions RBAC

### A venir
- [ ] Colonnes personnalisees (UI)
- [ ] Multi-paiements (historique versements)
- [ ] Upload photo colis
- [ ] QR code entrepot
- [ ] Notifications push (nouvelle commande import)
- [ ] Rapport PDF expedition
- [ ] Integration transporteurs (API)

---

**Document genere le :** 2026-05-27
**Version :** 1.0
**Projet :** Kawzone Marketplace ERP
