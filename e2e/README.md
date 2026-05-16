# Tests E2E — Kawzone

Tests de non-régression Playwright pour les flux **admin**, **vendeur** et **acheteur**. Objectif : détecter les régressions avant chaque déploiement.

## Comptes de test

Créés automatiquement par la migration `seed_e2e_test_accounts` :

| Rôle    | Email                          | Mot de passe   |
|---------|--------------------------------|----------------|
| Admin   | `e2e-admin@kawzone.test`       | `TestPass123!` |
| Vendeur | `e2e-vendor@kawzone.test`      | `TestPass123!` |
| Acheteur| `e2e-buyer@kawzone.test`       | `TestPass123!` |

⚠️ Ces comptes sont **uniquement** destinés aux tests automatisés. Ne pas les utiliser en production réelle.

## Installation (une seule fois)

```bash
bun run test:e2e:install   # installe Chromium + dépendances système
```

## Lancer les tests

### En local (contre le dev server, démarré automatiquement)

```bash
bun run test:e2e
```

### Contre la preview ou la prod

```bash
BASE_URL=https://my-style-hub-74.lovable.app bun run test:e2e
# ou en preview :
BASE_URL=https://id-preview--fa78f6b9-1ce8-4e6e-8494-e0b16eb5f978.lovable.app bun run test:e2e
```

### Mode UI interactif

```bash
bun run test:e2e:ui
```

## Couverture

- **`auth.spec.ts`** — login, signup, forgot-password, reset-password, login échec
- **`buyer.spec.ts`** — home, categories, search, cart, orders, account
- **`vendor.spec.ts`** — dashboard, products list, new product form, orders, preparation, settings
- **`admin.spec.ts`** — dashboard, orders, vendors, products, categories, customers, contrôle d'accès

## Intégration CI (GitHub Actions)

Créer `.github/workflows/e2e.yml` :

```yaml
name: E2E
on:
  pull_request:
  push:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps chromium
      - name: Run E2E against preview
        env:
          BASE_URL: https://id-preview--fa78f6b9-1ce8-4e6e-8494-e0b16eb5f978.lovable.app
        run: bun run test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Rapport HTML

Après chaque run, ouvrir le rapport :

```bash
bunx playwright show-report
```

## Conseils

- Les tests tournent en **série** (`workers: 1`) car ils partagent la même session Supabase.
- Si un test échoue, la trace, capture d'écran et vidéo sont conservées (`test-results/`).
- Pour déboguer un test : `bunx playwright test e2e/admin.spec.ts --debug`
