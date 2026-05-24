## Diagnostic

L'erreur "Crawling result not available" vient du plugin TanStack Router code-splitter de Vite. Le fichier `src/routes/admin.imports.tsx` est syntaxiquement correct maintenant (les `}})` parasites ont été corrigés et les nouveaux `<li>` sont valides), mais le cache Vite garde l'état d'échec précédent — il n'arrive plus à reconstruire la route.

## Fix

Redémarrer le dev server Vite pour vider le cache du code-splitter. Aucune modification de code nécessaire.

## Hors scope

- Pas de modif de fichier.
- Pas de revert.
