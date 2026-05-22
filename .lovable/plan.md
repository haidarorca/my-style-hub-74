## Plan de correction

1. **Supprimer la cause principale de l’ancienne coque vide**
   - Retirer le lien `manifest.webmanifest` du `<head>` pour arrêter l’installation/relance en mode application autonome qui garde l’ancienne version.
   - Conserver les icônes simples, sans comportement PWA.

2. **Forcer un vrai nettoyage côté client dès le chargement**
   - Renforcer le nettoyage existant pour supprimer tous les anciens service workers et caches.
   - Après nettoyage détecté, recharger une seule fois la page avec un paramètre frais pour éviter de rester sur une ancienne coque sans catégories/produits.
   - Ajouter une garde anti-boucle pour ne pas recharger en continu.

3. **Corriger les boutons/auto-update qui peuvent croire que l’app est à jour alors qu’elle est bloquée**
   - Harmoniser `AutoUpdatePrompt`, `UpdateAppButton`, `ErrorBoundary` et le watcher de version pour utiliser le même rechargement dur.
   - Ne plus se contenter de comparer les assets : si l’utilisateur clique “Mettre à jour”, on purge et recharge vraiment.

4. **Vérification**
   - Vérifier que les requêtes catégories et produits chargent toujours correctement.
   - Vérifier que le site ne garde plus un service worker actif et que les caches sont effacés.
   - Confirmer que l’accueil affiche les catégories et produits après rechargement.