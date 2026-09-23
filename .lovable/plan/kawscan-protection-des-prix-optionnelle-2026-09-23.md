# KawScan — Protection des prix (optionnelle)

## Constat sur l'existant
- Le QR magasin ouvre `/kawscan/store/<slug>`. Il n'y a **aucune session aujourd'hui** : la page appelle directement, sans compte, trois fonctions en base : `kawscan_public_store` (infos du magasin + état d'abonnement), `kawscan_lookup` (prix d'un code scanné), `kawscan_search` (recherche).
- Réglages du vendeur : `/kawscan/app/store/<id>` (onglets Produits / Étiquettes / Affiche). Accès sécurisé par `kawscan_can_manage` (propriétaire + employés).
- Conséquence : pour protéger les prix réellement, le contrôle doit se faire **dans `kawscan_lookup` et `kawscan_search`**. Masquer les prix uniquement à l'écran ne suffirait pas.

## Ce que verra le vendeur
Nouvel onglet **« Protection »** dans la page du magasin (le reste de l'écran ne change pas) :
- Mode : Aucun (par défaut) / Zone GPS / Code / Zone GPS + Code.
- Zone GPS : une carte centrée sur le magasin (bouton « Ma position »), un rectangle à 4 coins déplaçables, puis « Enregistrer la zone ».
- Code : durée 5 / 10 / 15 / 30 / 60 min ou personnalisée (entre 2 et 240 min). Le **code du moment** s'affiche en grand avec un compte à rebours, et change tout seul.
- Durée maximale d'une session : 5 / 10 / 15 / 30 / 60 min.
- **Sessions actives (N)** : Session #4821 | durée écoulée | scans | recherches | Active | bouton « Fermer », avec la confirmation « Voulez-vous vraiment fermer cette session ? ». La liste s'actualise toutes les 10 s.
- Aucune donnée personnelle : seulement un numéro anonyme à 4 chiffres.

## Ce que verra le client
- Mode Aucun : exactement comme aujourd'hui.
- Mode GPS : demande de localisation → vérification → scanner.
- Mode Code : « Entrez le code fourni par le personnel du magasin pour activer votre session » → scanner.
- Mode GPS + Code : les deux, dans cet ordre.
- Messages clairs : « Vous devez être dans la boutique pour consulter ses prix », « Localisation trop imprécise, activez la localisation et réessayez », « Code incorrect ou expiré », « Session terminée, réactivez-la ».
- Un petit bandeau indique le temps restant de la session.

## Règles GPS (anti faux blocage)
- Précision refusée si elle dépasse 100 m : on demande alors de réessayer.
- Accepté si la position est dans la zone, **ou** si le cercle de précision touche la zone, avec une marge fixe de 15 m.
- Pendant la session, la position est renvoyée toutes les 30 s environ. La session n'est suspendue qu'après **2 relevés consécutifs clairement hors zone** (au moins 60 s d'écart, même en comptant la précision). Un seul relevé isolé ne coupe jamais la session.

## Sécurité côté serveur
- Le code est calculé par le serveur à partir d'un secret propre à chaque magasin (stocké en base, jamais envoyé au client) et de la période en cours, via HMAC-SHA256, puis converti en 6 chiffres. On ne peut pas le deviner à partir de l'heure. La période précédente est acceptée 30 s pour absorber l'écart d'horloge.
- Limite anti-essais : 5 codes faux → attente de 5 minutes pour ce jeton.
- La session est un jeton aléatoire, conservé en base sous forme hachée et gardé côté client en sessionStorage.
- `kawscan_lookup` et `kawscan_search` prennent un paramètre facultatif `_session`. Si le magasin est protégé et que la session est absente, expirée, fermée ou suspendue, aucun prix n'est renvoyé (seulement une erreur `session_required`). Chaque appel valide incrémente les compteurs.
- Les sessions expirées ou fermées sont supprimées (nettoyage à chaque appel + purge des sessions de plus de 24 h). Aucun historique des produits consultés.

## Détails techniques
- Migration :
  - `kawscan_stores` : ajout de `protection_mode` (none/gps/code/gps_code, par défaut none), `zone_polygon` jsonb, `code_period_minutes`, `session_max_minutes`.
  - Nouvelle table `kawscan_store_secrets` (store_id, secret) sans aucun accès client.
  - Nouvelle table `kawscan_sessions` (id, store_id, token_hash, short_id, status, started_at, expires_at, scans, searches, failed_attempts, locked_until, out_of_zone_since). Lecture par les gestionnaires du magasin via RLS `kawscan_can_manage` ; modifications uniquement par des fonctions SECURITY DEFINER.
  - Fonctions RPC : `kawscan_session_start(_slug, _lat, _lng, _acc, _code)`, `kawscan_session_ping(_slug, _session, _lat, _lng, _acc)`, `kawscan_current_code(_store_id)` (gestionnaires uniquement, renvoie le code + son expiration), `kawscan_close_session(_id)`.
  - Mise à jour de `kawscan_lookup` / `kawscan_search` (nouvelle signature avec `_session` par défaut à null, rétro-compatible). `kawscan_public_store` renvoie en plus le mode de protection.
  - Test point-dans-polygone + distance au bord réalisés en SQL (formule plane locale, suffisante à l'échelle d'un magasin).
- Carte : `leaflet` + tuiles OpenStreetMap, chargée seulement dans le navigateur (import dynamique). Aucune clé nécessaire.
- Fichiers :
  - nouveau composant `components/kawscan/ProtectionSettings.tsx` (+ `ZoneMap.tsx`, `ActiveSessions.tsx`) ;
  - nouvel onglet dans `kawscan.app.store.$storeId.tsx` ;
  - écran d'activation dans `kawscan.store.$slug.tsx`, qui réutilise le même scanner et la même recherche ; le jeton est simplement ajouté aux appels existants.
- Aucun nouveau matériel, aucune analyse de comportement.

## Tests prévus
Chaque mode ; mauvais code ; code expiré et changement automatique ; expiration de la session ; fermeture manuelle ; sortie de zone simulée (2 relevés) ; plusieurs sessions en même temps ; appel direct à `kawscan_lookup` sans jeton sur un magasin protégé → aucun prix renvoyé ; vue mobile (taille d'écran Android/iPhone avec Playwright, localisation simulée).
