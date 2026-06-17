# Kawzone Admin — Command Center ERP
## Design PRD — Phase Premium UX

---

## 1. OVERVIEW

Kawzone Admin est transformé d'un "ERP développeur" (tableaux lourds, multiples pages, statuts complexes) en une **plateforme opérationnelle premium moderne** de type Shopify Admin / Linear / Stripe Dashboard.

**Objectif UX :** L'admin ne sert plus à "afficher des données" mais à **guider l'opérateur vers la prochaine action la plus importante**, avec un minimum de friction et de clics.

**Métaphore :** Un cockpit d'avion de chasse — seulement l'information critique, contextualisée, avec des actions à portée de main.

---

## 2. DESIGN TOKENS

### 2.1 Palette — Kawzone Premium

#### Backgrounds
| Token | Value | Usage |
|-------|-------|-------|
| `bg-base` | `#0A0A0F` | Page background (presque noir bleuté) |
| `bg-elevated` | `#111118` | Cards, panels, drawers |
| `bg-surface` | `#1A1A24` | Inputs, buttons, hover states |
| `bg-hover` | `#222230` | Hover on elevated elements |
| `bg-active` | `#2A2A3A` | Active/pressed state |
| `bg-glass` | `rgba(17, 17, 24, 0.85)` | Glass panels (backdrop-filter) |

#### Accents — Gradients subtils
| Token | Value | Usage |
|-------|-------|-------|
| `accent-primary` | `#6366F1` | Indigo — actions principales, primary button |
| `accent-primary-light` | `#818CF8` | Hover primary |
| `accent-success` | `#10B981` | Emerald — succès, livré, confirmé |
| `accent-warning` | `#F59E0B` | Amber — attention, attente |
| `accent-danger` | `#EF4444` | Red — urgence, bloqué, erreur |
| `accent-info` | `#3B82F6` | Blue — info, nouveau, import |
| `accent-commission` | `#D946EF` | Fuchsia — commission, vendeur |

#### Text
| Token | Value | Usage |
|-------|-------|-------|
| `text-primary` | `#F8FAFC` | Titres, texte principal |
| `text-secondary` | `#94A3B8` | Labels, descriptions |
| `text-tertiary` | `#64748B` | Placeholder, disabled |
| `text-inverse` | `#0A0A0F` | Sur boutons clairs |

#### Borders
| Token | Value | Usage |
|-------|-------|-------|
| `border-subtle` | `rgba(255,255,255,0.06)` | Card borders |
| `border-default` | `rgba(255,255,255,0.1)` | Input borders |
| `border-focus` | `#6366F1` | Focus ring |

### 2.2 Typography — Inter (Google Fonts)

| Token | Size | Weight | Line-Height | Letter-Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| `text-xs` | 12px | 400 | 16px | 0.01em | Labels, badges |
| `text-sm` | 14px | 400 | 20px | 0 | Body, descriptions |
| `text-base` | 16px | 400 | 24px | -0.01em | Primary text |
| `text-lg` | 18px | 500 | 28px | -0.02em | Card titles |
| `text-xl` | 24px | 600 | 32px | -0.02em | Section headers |
| `text-2xl` | 32px | 700 | 40px | -0.03em | Page title |

### 2.3 Spacing — 4px Grid

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight internal padding |
| `space-2` | 8px | Icon gaps, tight padding |
| `space-3` | 12px | Button padding |
| `space-4` | 16px | Card internal padding |
| `space-5` | 20px | Section gaps |
| `space-6` | 24px | Card gaps |
| `space-8` | 32px | Section spacing |
| `space-10` | 40px | Major sections |
| `space-12` | 48px | Page padding top |

### 2.4 Shadows & Elevation

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` | Buttons, small elements |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` | Cards |
| `shadow-lg` | `0 8px 24px rgba(0,0,0,0.5)` | Drawers, dialogs |
| `shadow-glow-primary` | `0 0 20px rgba(99,102,241,0.15)` | Glow sur éléments actifs |
| `shadow-glow-danger` | `0 0 20px rgba(239,68,68,0.15)` | Glow urgence |

### 2.5 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 6px | Badges, small chips |
| `radius-md` | 10px | Buttons, inputs |
| `radius-lg` | 16px | Cards |
| `radius-xl` | 20px | Panels, drawers |
| `radius-full` | 9999px | Avatars, circular buttons |

---

## 3. LAYOUT SYSTEM

### 3.1 Page Structure

```
┌──────────────────────────────────────────────────────┐
│  HEADER (fixed, z-50)                                 │
│  Logo · Breadcrumb · Search · Notifications · Profil │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│  SIDEBAR │  MAIN CONTENT                             │
│  (200px) │  (flex-1, scrollable)                    │
│          │                                           │
│  · Orders│  Padding: 40px 32px                      │
│  · Vendors│  Max-width: 1440px (centered)           │
│  · Products│                                         │
│  · Logistic│                                         │
│  · Comm. │                                           │
│  · Analytics│                                        │
│  · Settings│                                         │
│          │                                           │
└──────────┴───────────────────────────────────────────┘
```

### 3.2 Responsive

| Breakpoint | Layout |
|------------|--------|
| `≥ 1280px` | Sidebar 200px + Content 1240px |
| `1024–1279px` | Sidebar 180px + Content fluid |
| `768–1023px` | Sidebar collapsed (icons only 64px) |
| `< 768px` | Bottom nav bar (mobile), drawer for detail |

### 3.3 Glassmorphism Subtil

Les panels flottants (drawers, dropdowns) utilisent un effet glass :
```css
.glass {
  background: rgba(17, 17, 24, 0.85);
  backdrop-filter: blur(20px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
```

---

## 4. SHARED COMPONENTS

### 4.1 SmartCard — Card Intelligente

```
┌────────────────────────────────────┐
│ [Icon]  Title                    [▸] │ ← Header avec accent color
├────────────────────────────────────┤
│ Primary Value                      │ ← Grand nombre/texte
│ ↗ +12% vs last month              │ ← Trend micro (optionnel)
│                                    │
│ [Action 1] [Action 2]            │ ← Quick actions inline
└────────────────────────────────────┘
```

- `bg-elevated` background
- `border-subtle` border
- `radius-lg` (16px)
- Hover: border devient `border-default` + `shadow-md`
- Transition: `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`

### 4.2 ActionPill — Pilule d'Action

Bouton flottant pour actions rapides. Apparaît en bas-droite.

```
┌─────────────────┐
│ [+] New Order   │
└─────────────────┘
```

- `bg-accent-primary` → gradient subtil `linear-gradient(135deg, #6366F1, #818CF8)`
- `shadow-glow-primary`
- Hover: scale(1.05) + glow intensifié
- Press: scale(0.95)

### 4.3 StatusDot — Indicateur de Statut

```
●  Active      (green, pulsing)
●  Pending     (amber, static)
●  Blocked     (red, pulsing fast)
●  Shipped     (blue, static)
```

- 8px diameter
- Pulsing : `animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`
- Couleurs mappées sur `accent-*` tokens

### 4.4 OrderCard — Card Commande (remplace le tableau)

```
┌─────────────────────────────────────────────────┐
│ [#A1B2C3] [IMPORT]        [badge: À peser]      │
│ Jean Dupont · +225 0123...                      │
│                                                 │
│ 150 000 FCFA                    [Reste: 45k]   │
│ ────────────────                                │
│ ▓▓▓▓▓▓▓▓░░░░  (timeline mini)                  │
│ Commande → Entrepôt → Pesée → ...              │
│                                                 │
│ [✓ Confirmer] [✆ WhatsApp] [▸ Détails]       │
└─────────────────────────────────────────────────┘
```

### 4.5 DrawerPanel — Panel Latéral

Remplace les pages de détail. Glisse depuis la droite.

```
┌────────────────────────┬──────────────────────┐
│                        │ DRAWER (480px)       │
│  LISTE DES COMMANDES   │ ┌──────────────────┐ │
│                        │ │ Commande #A1B2C3 │ │
│  [card] [card]         │ │ [×]              │ │
│  [card] [card]         │ ├──────────────────┤ │
│  [card] [card]         │ │ CLIENT           │ │
│                        │ │ Jean Dupont      │ │
│                        │ │ +225 0123...     │ │
│                        │ │                  │ │
│                        │ │ TIMELINE         │ │
│                        │ │ ○─●─○─○─○─○─○   │ │
│                        │ │                  │ │
│                        │ │ FINANCIER        │ │
│                        │ │ Produits  150k   │ │
│                        │ │ Frais      45k   │ │
│                        │ │ Payé        0    │ │
│                        │ │ RESTE      195k  │ │
│                        │ │                  │ │
│                        │ │ [Confirmer]      │ │
│                        │ │ [WhatsApp]       │ │
│                        │ └──────────────────┘ │
└────────────────────────┴──────────────────────┘
```

- Slide-in depuis droite : `transform: translateX(100%)` → `translateX(0)`
- Duration: `0.3s cubic-bezier(0.32, 0.72, 0, 1)`
- Overlay sombre: `bg-black/40` avec `backdrop-filter: blur(4px)`
- Width: 480px desktop, 100% mobile

### 4.6 MiniTimeline — Timeline Compacte

```
○───●───○───○───○───○───○
Cmd  Ent  Pes  Env  Paie  Val  Exp  Liv
```

- 8 étapes max
- Fait : `●` (filled, accent color)
- Actif : `◐` (filled + pulse, accent color)
- À venir : `○` (empty, border tertiary)
- Connecteurs : `─` (1px line)

### 4.7 FloatingActionBar — Barre d'Actions Flottante

```
              ┌─────────────────────────────┐
              │ [Archive] [Export] [▾ More] │
              └─────────────────────────────┘
```

- Apparaît quand des items sont sélectionnés
- Fixed, bottom-center, z-50
- Slide-up animation : `translateY(100%)` → `translateY(0)`
- Glassmorphism background

### 4.8 AlertBanner — Bandeau d'Alerte Intelligent

```
┌──────────────────────────────────────────────────────┐
│ ⚡ 3 commandes bloquées depuis +14 jours              │
│    [Voir maintenant] [Ignorer]                        │
└──────────────────────────────────────────────────────┘
```

- Severity: info (blue), warning (amber), critical (red)
- Critical: `shadow-glow-danger` + border accent-danger
- Auto-dismiss pour info (10s), persistant pour critical
- Slide-down animation on appear

---

## 5. ANIMATIONS

### 5.1 Transitions Globales

```css
/* Tous les éléments interactifs */
.interactive {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Cards */
.card {
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: shadow-md;
  border-color: border-default;
}

/* Buttons */
.btn {
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}
.btn:active {
  transform: scale(0.97);
}
```

### 5.2 Animations d'Entrée

```css
/* Stagger pour les cards */
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.card-enter {
  animation: fadeSlideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
/* Stagger delay: 0.05s * index */

/* Drawer slide-in */
@keyframes slideInRight {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

/* Alert banner slide-down */
@keyframes slideDown {
  from { transform: translateY(-100%); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}

/* Pulse pour statuts actifs */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### 5.3 Micro-interactions

| Élément | Interaction | Animation |
|---------|-------------|-----------|
| Button hover | Hover | Background lighten 10%, scale 1.02 |
| Button press | Active | Scale 0.97, shadow reduce |
| Card hover | Hover | translateY(-2px), shadow-md |
| Badge status | Loading | Skeleton pulse shimmer |
| Input focus | Focus | Border `accent-primary`, glow ring |
| Tab switch | Click | Underline slide (width + position) |
| Drawer open | Click | Slide-in right 0.3s + overlay fade |
| Toast | Trigger | Slide-up + fade 0.3s |
| Number change | Value update | Count-up animation 0.5s |
| Order card | Hover | Border highlight + actions reveal |

### 5.4 Scroll Animations

```css
/* Fade-in on scroll (subtle) */
@keyframes scrollReveal {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* Trigger: when element enters viewport */
/* Duration: 0.3s, Easing: ease-out */
```

---

## 6. PAGES

### 6.1 ACTION CENTER (`/admin`) — La Page Centrale

**Objectif :** L'opérateur ouvre cette page et sait immédiatement quoi faire.

**Structure :**

```
┌──────────────────────────────────────────────────────────────┐
│ ACTION CENTER                                    [Search] [🔔]│
│ Bonjour, Haidar · Voici vos priorités aujourd'hui            │
├──────────────────────────────────────────────────────────────┤
│ ⚡ 3 commandes bloquées · [Résoudre maintenant] [Ignorer]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  VOS PRIORITÉS              MÉTRIQUES CLÉS                  │
│  ┌─────────────┐          ┌──────────┐ ┌──────────┐         │
│  │ [Zap] Traiter│          │ 156 Cmd  │ │ 12 Vendors│        │
│  │ 5 urgences   │          │  +8%     │ │  +3 ce mois│        │
│  │ [▸ Voir]     │          └──────────┘ └──────────┘         │
│  ├─────────────┤          ┌──────────┐ ┌──────────┐         │
│  │ [Truck] Expédier        │ 45k FCFA │ │ 3 Bloquées│        │
│  │ 2 à expédier  │          │  reste   │ │  urgence  │        │
│  │ [▸ Voir]     │          └──────────┘ └──────────┘         │
│  ├─────────────┤                                            │
│  │ [Dollar] Paiements                                      │
│  │ 8 en attente  │                                           │
│  │ [▸ Voir]     │                                           │
│  └─────────────┘                                            │
│                                                              │
│  PIPELINE LOGISTIQUE                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  À peser ████░░░░ 12    Paiement ██████░░ 18        │   │
│  │  Entrepôt ██████░░ 15   Validé ██████████ 8         │   │
│  │  Expédié ██████████ 24                               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  COMMANDES RÉCENTES                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ #A1B2C3      │ │ #B2C3D4      │ │ #C3D4E5      │        │
│  │ IMPORT       │ │ LOCAL        │ │ MIXTE        │        │
│  │ À peser      │ │ Confirmée    │ │ Attente      │        │
│  │ 150k FCFA    │ │ 75k FCFA     │ │ 230k FCFA    │        │
│  │ [▸]          │ │ [▸]          │ │ [▸]          │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Sections (dans l'ordre) :**

1. **Header personnalisé** — "Bonjour [Prénom] · Voici vos priorités"
2. **AlertBanner** — Alerte critique si applicable (sinon caché)
3. **Deux colonnes :**
   - Gauche (60%) : **Priorités** — Cards d'actions groupées par type
   - Droite (40%) : **Métriques clés** — 4 mini cards avec trends
4. **Pipeline logistique** — Barre visuelle horizontale (1 ligne)
5. **Commandes récentes** — Grille de 3-4 OrderCards compactes

### 6.2 ORDER HUB (`/admin/orders`) — Centre de Commandes

**Objectif :** Une seule page pour toutes les commandes, avec filtres contextuels et drawer de détail.

**Structure :**

```
┌──────────────────────────────────────────────────────────────┐
│ ORDER HUB                                          [+ Nouveau]│
│ 234 commandes · [Search____________] [Filtres ▾]            │
├──────────────────────────────────────────────────────────────┤
│ [ Toutes ▾ ] [▼]                                            │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [#A1B2C3]  [IMPORT]  Jean Dupont  150k FCFA  À peser   │ │
│ │ +225 01...  2j        [✆] [▸]                         │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [#B2C3D4]  [LOCAL]   Marie Kone    75k FCFA   Confirmée │ │
│ │ +225 07...  1j        [✆] [▸]                         │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ...                                                          │
│                                                              │
│          ┌─────────────────────────────┐                     │
│          │     [ 1  2  3  4  5  ▸ ]    │                     │
│          └─────────────────────────────┘                     │
└──────────────────────────────────────────────────────────────┘
```

**Comportement :**
- Click sur une card → Drawer s'ouvre avec les détails
- Filtre par type (Toutes/LOCAL/IMPORT/MIXTE) via dropdown élégant
- Search en temps réel (debounced)
- Pas de tableau — uniquement des OrderCards

**Drawer de détail (workflow adaptatif) :**

```
┌────────────────────────────────────┐
│ [#A1B2C3]              [IMPORT] [×]│
│ Jean Dupont                        │
│ +225 01 23 45 67                   │
├────────────────────────────────────┤
│                                    │
│ WORKFLOW (IMPORT — Complet)        │
│ ○───●───○───○───○───○───○        │
│ Cmd Ent Pes Env Paie Val Exp Liv   │
│        ↑ Actif : À peser           │
│                                    │
├────────────────────────────────────┤
│                                    │
│ FINANCIER                          │
│ Produits        150 000 FCFA       │
│ Frais transport  45 000 FCFA       │
│ Payé                   0 FCFA      │
│ ─────────────────────────────      │
│ RESTE           195 000 FCFA       │
│                                    │
├────────────────────────────────────┤
│                                    │
│ ACTIONS                            │
│ [▓ Créer évaluation]              │
│ [✆ Contacter client]              │
│ [📎 Voir pièces jointes]           │
│                                    │
└────────────────────────────────────┘
```

**Workflow adaptatif dans le drawer :**

| Type | Étapes visibles | Actions disponibles |
|------|----------------|---------------------|
| **LOCAL** | Commande → Confirmé → Livré (3 étapes) | Confirmer, Marquer livré, Annuler |
| **IMPORT** | 8 étapes complètes | Créer évaluation, Saisir poids, Envoyer frais, Confirmer paiement, Saisir tracking, Marquer livré |
| **MIXTE** | 5 étapes hybrides | Confirmer, Créer évaluation (partie import), Marquer livré |

### 6.3 ANALYTICS (`/admin/analytics`) — Vue Stratégique

**Objectif :** Vue synthétique pour la prise de décision, pas pour l'opérationnel.

```
┌──────────────────────────────────────────────────────────────┐
│ ANALYTICS                                         [Exporter] │
│ Vue d'ensemble de votre marketplace                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  REVENUE (30 JOURS)           COMMANDES PAR STATUT          │
│  ┌────────────────────────┐  ┌────────────────────────┐     │
│  │                        │  │    [pie chart]         │     │
│  │   [area chart]         │  │    45% Confirmées      │     │
│  │   2.4M FCFA            │  │    30% Nouvelles       │     │
│  │   +18% vs mois précéd. │  │    15% Livrées         │     │
│  │                        │  │    10% Annulées        │     │
│  └────────────────────────┘  └────────────────────────┘     │
│                                                              │
│  TOP VENDEURS                  PRODUITS PAR CATÉGORIE       │
│  ┌────────────────────────┐  ┌────────────────────────┐     │
│  │ 1. ABC Shop   450k     │  │    [horizontal bars]   │     │
│  │ 2. XYZ Store  320k     │  │    Électronique  ████  │     │
│  │ 3. Best Buy   280k     │  │    Mode          ███   │     │
│  │ ...                    │  │    Maison        ██    │     │
│  └────────────────────────┘  └────────────────────────┘     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 7. WORKFLOW ADAPTATIF

### 7.1 Détection Automatique du Type

Chaque commande est automatiquement classée :
- **LOCAL** : Tous les produits sont du pays du client
- **IMPORT** : Au moins un produit vient de l'étranger
- **MIXTE** : Mélange de local et import

### 7.2 Workflow LOCAL (3 étapes)

```
○───○───○
Nouvelle → Confirmée → Livrée
```

Actions : Confirmer (1 clic), Marquer livré (1 clic)
Pas de logistique complexe — livraison par le vendeur local.

### 7.3 Workflow IMPORT (8 étapes)

```
○───○───○───○───○───○───○
Nouvelle → Entrepôt → Pesée → Envoyé client → Paiement → Validé → Expédié → Livrée
```

Actions : Créer évaluation → Saisir poids/dims → Calcul auto → Envoyer au client → Attendre paiement → Confirmer → Saisir tracking → Marquer livré

### 7.4 Workflow MIXTE (5 étapes)

```
○───○───○───○───○
Nouvelle → Confirmée → Évaluation import → Expédié → Livrée
```

Actions : Confirmer → Créer évaluation (partie import seulement) → Paiement global → Expédition → Livraison

---

## 8. ASSETS

### 8.1 Logo

```
Description: Minimalist geometric "K" logo, abstract letterform combining
a forward arrow and the letter K, indigo/violet gradient, clean vector style,
transparent background, suitable for dark theme admin dashboard.
```

### 8.2 Icons

Tous les icons viennent de **lucide-react** (consistance avec shadcn/ui).
Aucun icon custom nécessaire — la force est dans la cohérence.

### 8.3 Illustrations d'État Vide

```
Description: Minimalist line illustration of an empty inbox/tray,
indigo accent color, clean geometric style, subtle gradient on lines,
dark background compatible, modern SaaS aesthetic.
```

---

## 9. IMPLEMENTATION NOTES

### 9.1 Design System

Le design system est basé sur **shadcn/ui** (déjà utilisé) avec des overrides :

```css
/* globals.css overrides pour le thème premium */
:root {
  --background: 240 14% 4%;           /* #0A0A0F */
  --foreground: 210 40% 98%;          /* #F8FAFC */
  --card: 240 14% 6%;                 /* #111118 */
  --card-foreground: 210 40% 98%;
  --popover: 240 14% 6%;
  --popover-foreground: 210 40% 98%;
  --primary: 239 84% 67%;             /* #6366F1 */
  --primary-foreground: 240 14% 4%;
  --secondary: 240 12% 12%;           /* #1A1A24 */
  --secondary-foreground: 210 40% 98%;
  --muted: 240 12% 12%;
  --muted-foreground: 215 16% 57%;    /* #94A3B8 */
  --accent: 240 12% 16%;              /* #222230 */
  --accent-foreground: 210 40% 98%;
  --destructive: 0 84% 60%;           /* #EF4444 */
  --destructive-foreground: 210 40% 98%;
  --border: 0 0% 100% / 0.06;
  --input: 0 0% 100% / 0.1;
  --ring: 239 84% 67%;
  --radius: 0.625rem;
}
```

### 9.2 Animation Library

Pas de librairie externe nécessaire. Toutes les animations utilisent :
- CSS transitions (hover, focus)
- CSS keyframes (entrées, pulse)
- Tailwind `animate-*` utilities
- Framer Motion optionnel pour les animations complexes (drawer, page transitions)

### 9.3 Performance

- **Pas de re-render inutile** : React.memo sur les cards
- **Virtual scrolling** : Si +100 commandes, utiliser react-window
- **Lazy loading** : Drawer charge les données on-demand
- **Image optimization** : Next-gen formats (WebP), lazy loading

---

## 10. CHECKLIST

### Avant implémentation
- [ ] Design tokens intégrés dans globals.css
- [ ] shadcn/ui theme configuré
- [ ] Fonts (Inter) chargées
- [ ] Layout responsive testé

### Phase 1 : Fondations
- [ ] Action Center page
- [ ] SmartCard component
- [ ] DrawerPanel component
- [ ] MiniTimeline component
- [ ] OrderCard component

### Phase 2 : Pages
- [ ] Order Hub (cards + drawer)
- [ ] Analytics (charts)
- [ ] Settings (forms)

### Phase 3 : Polish
- [ ] Animations (entrées, micro-interactions)
- [ ] Mobile responsive
- [ ] Dark theme finalisé
- [ ] Performance audit

---

*Document version 1.0 — Kawzone Admin Command Center ERP*
