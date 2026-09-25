# Cockpit — centre de contrôle : archivage, suppression, notifications, rappels

## Analyse de l'existant (réponses 1 à 6)

**1. Archivage actuel.** Il existe en fait deux « archives » qui ne se parlent pas :
- Onglet « Archive » du Cockpit : ce n'est pas un vrai archivage. Une ligne y apparaît seulement si son statut *calculé par sous-commande* vaut « livrée » ou « annulée ».
- Une colonne « date d'archivage » existe sur les commandes (41 commandes l'ont remplie), mais **aucun écran du Cockpit ne la lit**.

**2. Pourquoi des commandes restent visibles (commandes fantômes).**
- Le serveur retire « livrée/validée » de la liste, mais pas « annulée ». Le navigateur, lui, trie sur le statut de *sous-commande*, pas sur celui de la commande. Les deux règles divergent : une commande annulée ou archivée peut rester dans « Actions ».
- La colonne « date d'archivage » est ignorée : 14 commandes « nouvelles » et 16 « confirmées » marquées archivées sont toujours affichées.
- Une commande de test encore « nouvelle » ne peut jamais être archivée, car seul le statut décide.
- État réel aujourd'hui : 107 commandes « nouvelles » non archivées (pour la plupart des tests).

**3. Données des commandes.** Une commande principale (référence unique KW-…), ses articles, ses sous-commandes par vendeur, ses paiements, ses pesées, ses événements et son historique de statuts (déjà rempli automatiquement à chaque changement). Les champs CJ sont sur la commande.

**4. Statuts.** Un champ texte par commande (new, confirmed, preparing, ready, shipped, delivered, cancelled, plus les étapes d'import), un statut logistique et un statut de paiement séparés, plus un statut par sous-commande. Chaque changement est déjà journalisé automatiquement.

**5. Notifications.** Une table de notifications existe déjà, avec cloche admin/vendeur, mises à jour en direct et page de liste. Il n'y a ni son, ni regroupement, ni réglage par type, ni historique des rappels.

**6. Tâches programmées.** Oui : un planificateur tourne déjà côté serveur (expiration vendeurs, worker CJ, images sensibles, purge KawScan). Il fonctionne même quand personne n'est connecté.

## Architecture proposée (réponses 7 à 11)

### A. Archivage fiable (une seule source de vérité)
- Nouvelles informations sur la commande : date d'archivage (déjà là), archivée par, durée de conservation, date prévue de suppression.
- **Règle unique** : « archivée » = la date d'archivage est remplie. Rien d'autre. Le statut n'intervient plus.
- La vue principale exclut les archivées côté serveur (dans les deux chemins de requête). L'onglet « Archives » affiche uniquement les archivées, avec la date d'archivage, la date de suppression prévue et le bouton « Restaurer ».
- Les commandes livrées ou annulées non archivées vont dans un onglet « Terminées », séparé des Archives.
- Archivage groupé : sélection multiple, puis « Archiver ».
- Durée par défaut réglable (7 j / 30 j / 60 j / 90 j / 1 an / jamais), modifiable commande par commande.

### B. Suppression automatique à expiration (11)
- Une tâche serveur tourne une fois par jour. Elle supprime uniquement les commandes qui cumulent : archivée **et** date de suppression dépassée **et** conservation différente de « jamais ».
- Garde-fou supplémentaire : jamais de suppression automatique si la commande a une commande CJ payée ou envoyée, ou un dossier SAV ouvert. Elle est alors gardée et signalée.
- Chaque suppression est inscrite au journal d'audit (référence, montant, auteur « système »).

### C. Suppression définitive protégée (10)
- Action serveur réservée aux super administrateurs (nouvelle permission « Suppression définitive des commandes »).
- Étapes : 1) avertissement, 2) saisie du mot de passe, vérifié côté serveur comme pour le changement de mot de passe, 3) saisie de la référence de la commande pour confirmer, 4) message final « ne pourra plus être récupérée ».
- Limite de tentatives. Les articles, paiements, événements et rappels liés sont supprimés dans la même opération. Un instantané minimal est gardé dans le journal d'audit.
- Refus si une commande CJ existe déjà chez CJ (il faut d'abord annuler côté CJ).

### D. Moteur de rappels côté serveur (7, 9)
Trois nouvelles tables :
- **Règles de rappel** : nom, déclencheur, condition, délai avant le premier rappel, fréquence, nombre maximum (ou illimité), niveau (info / attention / important / critique), son, activée oui/non.
- **Rappels actifs par commande** : règle, commande, début du délai, prochain rappel, rappels envoyés, maximum, état (en attente, actif, épuisé, résolu), date du dernier rappel, date et motif de résolution.
- **Historique des notifications** : chaque événement envoyé ou résolu, avec horodatage.

Déclencheurs disponibles, tous calculés à partir de données qui existent déjà :
- statut de commande = X depuis N ;
- paiement en attente ;
- payée mais pas envoyée à CJ ;
- problème de stock CJ ;
- expédiée sans suivi ;
- aucune action admin depuis N (dernier événement ou changement de statut).

Fonctionnement : une tâche serveur tourne **toutes les 5 minutes**. Pour chaque règle active, elle recalcule quelles commandes remplissent la condition *maintenant* :
- condition vraie et aucun rappel ouvert → création du rappel, qui démarre à la date d'entrée dans l'état ;
- condition devenue fausse → rappel « résolu » immédiatement, avec le motif (« Commande confirmée — rappels arrêtés ») ;
- rappel dû → une notification, un compteur incrémenté, le prochain rappel planifié ;
- maximum atteint → rappel « épuisé », silence ensuite.

En plus, quand le statut d'une commande change, les rappels devenus caducs sont clos tout de suite, sans attendre la tâche suivante. Ça fonctionne navigateur fermé et téléphone éteint : tout est en base. À la reconnexion, la cloche et le tableau « À faire » montrent l'état réel.

Règles fournies au départ (modifiables ou supprimables) : les 6 exemples de votre message, **désactivées** tant que vous ne les activez pas.

### E. Aucun doublon (8)
- Un seul rappel ouvert par couple (règle, commande), imposé par la base.
- L'envoi d'un rappel est une mise à jour conditionnelle : « compteur = valeur lue et prochain rappel ≤ maintenant ». Si deux passages tournent en même temps, un seul l'emporte.
- La tâche prend un verrou global : pas deux exécutions simultanées.
- Côté navigateur, un rafraîchissement ne crée rien : il lit seulement.

### F. Sons et regroupement
- Le serveur crée les notifications. Le navigateur les reçoit en direct et joue le son.
- Regroupement : les arrivées sont mises en tampon pendant 10 secondes, puis on joue **un seul son** avec « 5 nouvelles commandes ».
- Si plusieurs onglets sont ouverts, un seul joue le son.
- Paramètres enregistrés par administrateur : son global oui/non, silencieux, volume, son par type d'événement, type activé ou non, bouton « Tester ».
- Sons inclus dans l'application (5 à 6 sons courts), aucun service externe.
- Limite connue : sans application ouverte, pas de son (le téléphone ne peut pas sonner pour un site fermé). Les rappels restent en attente dans la cloche et dans l'historique.

### G. Tableau « À FAIRE » et priorités
- Bandeau en haut du Cockpit avec des tuiles cliquables, par exemple « 5 nouvelles commandes », « 1 problème de stock », « 4 en préparation trop longtemps », « 8 terminées aujourd'hui ».
- Les compteurs et la priorité viennent des **rappels actifs et du niveau de leur règle**, sans règle inventée. « À surveiller » = règle dont le délai arrive à échéance dans moins de 20 % du délai.
- Un clic ouvre la liste filtrée des commandes concernées. Pour le stock, la commande s'ouvre directement sur l'article en rupture (lien direct déjà prévu dans le Cockpit).

### H. Sécurité (13)
Le moteur et les notifications **ne modifient jamais une commande** : ils lisent l'état et écrivent uniquement dans les rappels et les notifications. Toutes les actions restent manuelles.

## Ce qui ne change pas
Statut « Payée », prix, marges, informations CJ, contrôle de stock, anti-doublon, envoi et synchronisation CJ, suivi, transport Chine → Sénégal, workflow des statuts.

## Plan de réalisation
1. Archivage fiable : règle unique, onglets Actions / Terminées / Archives, restauration, archivage groupé, durée de conservation, nettoyage des 107 commandes de test *par vous* (sélection puis archivage).
2. Suppression définitive protégée et expiration automatique quotidienne.
3. Tables de rappels, moteur serveur toutes les 5 minutes, résolution immédiate au changement de statut.
4. Page Paramètres → Notifications : sons, volume, types, test, règles (créer, modifier, supprimer, activer).
5. Sons regroupés en direct et historique des notifications.
6. Tableau « À FAIRE » avec priorités et liens directs.

## Détails techniques (12)
- Base : colonnes `archived_by`, `retention_days`, `purge_at` sur `orders` ; tables `reminder_rules`, `order_reminders` (unique `rule_id, order_id` où l'état est ouvert), `notification_log`, `admin_notification_prefs` ; fonctions `run_reminder_engine()` (SECURITY DEFINER, verrou `pg_try_advisory_lock`), `purge_expired_archived_orders()`, trigger `orders` AFTER UPDATE qui résout les rappels caducs ; cron `*/5` (moteur) et quotidien (purge). RLS et GRANT réservés aux admins.
- Serveur : `src/lib/order-archive.functions.ts` (archiver, restaurer, conserver, supprimer définitivement avec mot de passe vérifié par `signInWithPassword` sur un client isolé) et `src/lib/reminders.functions.ts` (CRUD règles, préférences, historique, compteurs « À faire »).
- Modifiés : `src/lib/admin-logistics.functions.ts` (filtre `archived_at`), `src/cockpit/pages/Dashboard.tsx` (onglets et bandeau), `src/cockpit/components/CockpitOrderDrawerHost.tsx` / `OrderDrawer.tsx` (actions Archiver/Supprimer), `src/hooks/use-notifications.ts` (son et regroupement).
- Nouveaux : `src/routes/admin.settings.notifications.tsx`, `src/cockpit/components/TodoBoard.tsx`, `ArchiveTab.tsx`, `HardDeleteDialog.tsx`, `src/lib/notification-sound.ts`, `public/sounds/*`.
