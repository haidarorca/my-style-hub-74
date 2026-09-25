# Intégration CJ ↔ KawZone — architecture proposée (à valider avant développement)

## Règle fondamentale
Une commande client = une seule commande dans le Cockpit. CJ n'est qu'une « fiche fournisseur » rattachée à cette commande. L'intégration ne crée jamais de commande KawZone.

## Ce qui existe déjà (vérifié)
- Commande unique avec référence stable en base (`KW-2026-000001`), protégée par une contrainte d'unicité. 169 commandes, 1 seule déjà liée à CJ.
- Sur la commande : tous les champs CJ sont déjà prévus (ID CJ, numéro CJ, statut, paiement CJ, transporteur, suivi, dates, dernière erreur, mode test).
- Sur chaque article : identifiant produit CJ, identifiant variante CJ et SKU figés au moment de la commande, plus le libellé de variante (couleur/taille).
- Sur chaque variante produit : stock CJ (`supplier_stock`) importé et mis à jour par les synchronisations ciblées.
- Adresse de l'entrepôt Chine distincte de l'adresse client, journal complet des appels CJ.
- Bouton admin « Créer la commande chez CJ » (création seule, aucun paiement CJ).
- Statut « Payée » : saisi manuellement par l'admin, indépendant de tout paiement CJ.

## Ce qui manque
1. Aucun contrôle de stock CJ en temps réel au moment où le client commande (seul le stock en base, parfois ancien, est utilisé).
2. Aucun second contrôle juste avant l'envoi à CJ.
3. Pas de statut « Problème de stock — action requise » ni d'alerte Cockpit dédiée.
4. Pas de verrou anti-doublon sur l'envoi (deux clics ou une coupure réseau peuvent théoriquement relancer la création).
5. Pas de relecture automatique des statuts/suivi CJ, pas de webhooks actifs.
6. Paiement CJ automatique non construit (volontairement).
7. Consolidation en caisses : rien d'existant.

## Flux cible

```text
Client commande
  -> Contrôle stock n°1 (temps réel, par variante)
       rupture -> article bloqué au panier, commande refusée pour cet article
  -> Commande KW-... créée  [En attente de paiement]
  -> Admin confirme "Payée" (inchangé)
  -> Contrôle stock n°2 (temps réel, juste avant l'envoi)
       tout OK   -> envoi CJ (une seule fois) -> paiement CJ si activé
       rupture   -> "Problème de stock — action requise" + alerte Cockpit
  -> Relecture statuts CJ (préparation, expédition, suivi)
  -> Rattachement à une caisse CN-2026-xxx -> entrepôt Chine
```

## 1. Stock CJ
- Source officielle : interrogation du stock par variante CJ (0 point).
- Trois niveaux de fraîcheur :
  - Fiche produit : stock en base, actualisé en fond (produits consultés/vendus toutes les 6 h ; le reste une fois par jour, par lots, dans la limite des appels CJ).
  - Contrôle n°1 (validation de la commande) : appel temps réel pour chaque variante du panier. Si CJ ne répond pas : on accepte avec le dernier stock connu s'il a moins de 24 h, sinon article marqué « à confirmer » (la commande n'est pas bloquée, l'admin est prévenu).
  - Contrôle n°2 (avant envoi) : appel temps réel obligatoire. Sans réponse CJ, rien n'est envoyé.
- Le contrôle compare la quantité commandée au stock de la variante exacte, jamais au produit global.
- Produit supprimé / variante disparue chez CJ = rupture.

## 2. Rupture partielle
- Statut CJ de la commande : `stock_issue`, avec le détail par article (quantité demandée, stock CJ, date du contrôle).
- Bandeau Cockpit : « Attention — commande KW-2026-000125 : Produit C — Noir / M — rupture chez CJ ».
- L'admin choisit par article, avec les décisions déjà existantes du Cockpit (attendre réappro, rembourser, avoir, remplacer, expédier partiellement) + annuler la commande.
- Envoi partiel possible : seuls les articles disponibles partent chez CJ ; les autres suivent la décision choisie. Conforme à la règle « livraison partielle normale ».
- Aucun paiement CJ tant qu'un article est en problème non tranché.

## 3. Anti-doublon (garanti techniquement)
- Numéro envoyé à CJ = référence KawZone (unique en base). CJ refuse lui-même un second `orderNumber` identique ; on le traite comme « déjà envoyée » et on relit la commande existante.
- Verrou en base sur la commande pendant l'envoi (état `sending`) : un second clic ou une relance attend ou reçoit « déjà en cours ».
- Si la réponse CJ est perdue (coupure) : avant toute nouvelle tentative, on recherche la commande chez CJ par notre référence et on la relie au lieu d'en recréer une.
- Une commande avec un ID CJ n'est jamais renvoyée ; seules les mises à jour sont faites.

## 4. Synchronisation CJ -> KawZone
- Relecture périodique des commandes CJ ouvertes (toutes les 2 h, 0 point) : statut, paiement, transporteur, suivi.
- Webhooks commande/logistique CJ activés ensuite, avec vérification de signature, en complément (pas en remplacement).
- Statuts CJ affichés à part, sans écraser le statut KawZone ni le transport Chine -> Sénégal.
- Annulation côté KawZone : si la commande CJ n'est pas payée, annulation chez CJ ; si payée, alerte admin (remboursement CJ manuel). Modification après envoi : interdite automatiquement, alerte admin.

## 5. Paiement CJ automatique (option)
- Réglage désactivé par défaut. Activé : paiement sur le solde CJ uniquement si contrôle n°2 OK, commande client « Payée », montant CJ sous un plafond défini par vous. Sinon, bouton manuel.

## 6. Consolidation en caisses
- L'API CJ ne propose pas de regroupement de commandes en caisses ni de « shipping mark ». Ce point ne peut pas être garanti par le code.
- Proposition : chaque commande CJ part vers votre entrepôt avec notre référence dans `orderNumber` et `remark`. La consolidation se fait par accord commercial avec CJ (service « consolidation »), ou à votre entrepôt Chine.
- Côté KawZone : nouveau module « Caisses » (CN-2026-001) pour rattacher les commandes reçues, imprimer la liste de contenu, suivre la caisse jusqu'au Sénégal. La chaîne Client -> Commande -> Commande CJ -> Articles -> Caisse -> Entrepôt reste visible sur la fiche commande.

## 7. Sécurité
- Identifiants CJ déjà stockés en secrets serveur ; tous les appels passent par le serveur, réservés aux administrateurs, journalisés.

## Ordre de réalisation proposé
1. Contrôles de stock n°1 et n°2 + statut « Problème de stock » + alerte Cockpit.
2. Verrou anti-doublon et récupération après coupure.
3. Relecture automatique des statuts/suivi, puis webhooks.
4. Paiement CJ automatique (option).
5. Module Caisses.

## Non touché
Prix, marges, commissions, transport client, panier (hors blocage d'un article en rupture), statut « Payée », anciennes commandes.

## Points à décider
- Contrôle n°1 : si CJ ne répond pas, accepter la commande avec le dernier stock connu (recommandé) ou la bloquer ?
- Envoi partiel automatique des articles disponibles, ou toujours attendre votre décision (recommandé au début) ?
- Plafond de paiement CJ automatique.
