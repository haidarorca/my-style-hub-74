# Intégration commandes CJ — audit et plan de correction

## Résultat de l'audit (le plus important)

**Votre commande test n'existe pas chez CJ, et elle ne pouvait pas exister.**
Aujourd'hui KawZone ne possède aucun code capable d'envoyer une commande à CJ.
L'intégration CJ actuelle sait uniquement : se connecter, lire un produit,
importer un produit et ses variantes. Rien d'autre. Il n'y a donc ni appel de
création, ni numéro CJ, ni statut CJ, ni suivi.

Autres manques constatés :

- La commande KawZone n'a **pas de référence stable** : le numéro « KZ-000001 »
  est fabriqué dans le navigateur (mémoire locale) et diffère d'un appareil à
  l'autre. Impossible de s'en servir comme référence chez CJ.
- La commande ne stocke **aucun champ CJ** (numéro, statut, paiement, suivi).
- Il n'existe **aucune adresse d'entrepôt en Chine** configurée. Seule
  l'adresse du client sénégalais est enregistrée.
- Les identifiants CJ nécessaires sont bien là : identifiant produit CJ et
  identifiant de variante CJ présents sur les 3 produits importés (152
  variantes, toutes avec leur identifiant CJ). Rien à recréer de ce côté.

L'ancienne erreur « Produit indisponible » n'avait aucun rapport avec CJ :
c'était un contrôle interne de publication, déjà corrigé.

## Ce que dit la documentation officielle CJ (vérifié)

- Interface actuelle : `POST /api2.0/v1/shopping/order/createOrderV3`.
- `orderFlow = 1` = « flux produit CJ », c'est notre cas : on envoie le vrai
  identifiant de variante CJ. Le flux 2 (boutique) ne nous concerne pas.
- `orderNumber` (50 caractères) : notre référence, unique et stable.
- `remark` (500 caractères) : commentaire de commande, renvoyé dans les
  consultations CJ.
- **Aucun champ « shipping mark » n'existe dans l'API CJ.** Je l'ai cherché
  dans toute la documentation : il n'y a que `orderNumber` et `remark`. Et la
  documentation **ne garantit nulle part** que l'un ou l'autre soit imprimé
  physiquement sur le colis. Je ne vais donc rien inventer : on transmet notre
  référence dans ces deux champs, et le marquage physique devra être confirmé
  avec le service CJ, pas promis par le code.
- `storageId` = identifiant d'un **entrepôt CJ**, jamais notre adresse. On ne
  l'utilise pas (mode marchand par défaut).
- Paiement : la création et le paiement sont séparés. Enchaînement officiel :
  création → panier → confirmation panier → génération du paiement →
  `payBalanceV2`. **Nous nous arrêtons à la création**, comme demandé.
- Statuts CJ : CREATED, IN_CART, UNPAID, PENDING, PROCESSING, UNSHIPPED,
  SHIPPED, DELIVERED, CANCELLED.
- Suivi : la consultation de commande CJ renvoie `trackNumber`,
  `trackingProvider`, `trackingUrl`.
- Webhooks disponibles : commande, logistique, produit, stock — un seul lien de
  rappel, réponse en moins de 3 secondes, signature HMAC.
- Coût : la création et la consultation de commande coûtent **0 point**. Le
  calcul de frais CJ coûte 10 points.
- **Point à valider par un test réel** : la documentation ne dit nulle part si
  CJ accepte une livraison **à l'intérieur de la Chine** (entrepôt CJ → notre
  entrepôt chinois). Tous les exemples sont internationaux. C'est le premier
  test à faire avant tout le reste.

## Plan de réalisation

### Étape 1 — Base de données (une migration)
- Référence de commande stable en base : colonne `reference` sur les commandes,
  format `KW-2026-000001`, générée par séquence, jamais modifiable.
- Champs CJ sur la commande : identifiant CJ, numéro CJ, statut CJ, statut de
  paiement CJ, méthode logistique, numéro de suivi, transporteur, lien de suivi,
  dates de création / paiement / expédition CJ, dernière synchronisation,
  dernière erreur.
- Ligne de commande : identifiant produit CJ et identifiant variante CJ figés au
  moment de la commande (jamais perdus même si le produit change).
- Table de configuration « Adresse de réception CJ (entrepôt Chine) » :
  nom de l'entrepôt, destinataire, téléphone, pays, province, ville, adresse,
  complément, code postal.
- Journal des appels CJ commande (requête, réponse, code, message).

### Étape 2 — Vérification du transport CJ (test réel, avant tout envoi)
Appel du calcul de frais CJ depuis la Chine vers l'adresse de notre entrepôt
chinois, avec la vraie variante. Objectif : savoir si CJ propose des méthodes
pour cette destination et lesquelles. **Aucune méthode ne sera codée en dur** :
on n'utilisera que celles renvoyées par CJ. Si CJ n'en renvoie aucune, je vous
le dis et on n'envoie pas la commande.

### Étape 3 — Création de commande CJ (côté serveur, admin uniquement)
- Fonction serveur : construction de la commande à partir de la commande
  KawZone ; destination = **adresse entrepôt Chine** ; le client sénégalais
  reste uniquement sur la commande KawZone.
- `orderFlow = 1`, chaque ligne envoyée avec son identifiant de variante CJ
  exact, sa quantité, son prix.
- `orderNumber` = référence KawZone ; `remark` = « KAWZONE / Commande : ... ».
- Mode test : indicateur bac à sable et adresse de test contrôlée.
- Aucun paiement CJ déclenché. Aucun envoi automatique : bouton admin
  uniquement, et seulement si le paiement client est confirmé.
- Sauvegarde intégrale de la réponse CJ et de tous les identifiants.

### Étape 4 — Synchronisation statuts et suivi
- Fonction de relecture de la commande chez CJ (0 point) : statut, paiement,
  suivi. Déclenchable par l'admin, plus une synchronisation périodique modérée.
- Correspondance statuts CJ → statuts KawZone, sans écraser le suivi interne
  Chine → Sénégal (les deux transports restent distincts et affichés séparément).
- Webhooks commande et logistique préparés en point d'entrée public avec
  vérification de signature (activation après validation du flux).

### Étape 5 — Écran d'administration
Dans la fiche commande : référence KawZone, paiement client, état CJ
(créée / non créée), identifiant et numéro CJ, statut CJ, paiement CJ,
destination (entrepôt Chine), référence transmise, suivi CJ, historique des
appels, et le bouton « Créer la commande chez CJ ».

### Étape 6 — Test réel obligatoire
Commande test identifiée, produit et variante CJ réels, quantité 1, adresse de
test contrôlée. Je vous rends : statut HTTP, code CJ, message, identifiant CJ,
numéro CJ, statut CJ, et l'emplacement exact où la commande apparaît dans votre
compte CJ — avec l'explication.

## Ce qui n'est pas touché
Import produits, variantes, prix, stock, panier, transport client
Chine → Sénégal, commissions, marges, commandes historiques, langues, vitrine.
Aucun paiement CJ automatique.
