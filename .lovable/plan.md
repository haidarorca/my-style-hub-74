# Activer la fonctionnalité d'import boutique (Taobao/1688)

## Diagnostic

Le code de la fonctionnalité est déjà présent dans le projet :
- `src/lib/admin-import-store.functions.ts` (server functions)
- `src/routes/admin.imports.tsx` (page admin des brouillons)
- `src/components/admin/ImportStoreDialog.tsx` (dialogue d'import)
- `supabase/migrations/20260121_import_store.sql` (fichier SQL préparé)

**Problème** : les tables `import_batches` et `import_products` n'existent **pas** dans la base de données. La migration SQL est dans le repo mais n'a jamais été exécutée. Sans ces tables, l'import ne peut rien enregistrer.

## Action

Appliquer la migration via l'outil Lovable Cloud (équivalent à l'exécuter dans le SQL Editor). Elle va créer :

- **Table `import_batches`** : sessions d'import (URL boutique, statut, progression `last_offset`, total importés)
- **Table `import_products`** : brouillons de produits importés (nom, prix, images, variantes, catégorie suggérée, détection de doublons)
- **Trigger** `updated_at` automatique sur les 2 tables
- **Politiques d'accès (RLS)** :
  - Les admins voient et gèrent tous les imports/brouillons
  - Les vendeurs voient et gèrent uniquement leurs propres imports

Aucun fichier de code n'est touché — tout est déjà en place et attend juste les tables.

## Vérification

Après application : ouvrir `/admin/imports`, lancer un import test, vérifier qu'un batch + brouillons apparaissent.
