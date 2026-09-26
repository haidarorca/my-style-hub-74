- [x] Refaire l’interface du Centre CJ autour de recherche, sélection, import et suivi
- [x] Préserver et brancher toutes les actions réelles (import, synchronisation, pause, reprise, annulation, retry, programmation)
- [x] Vérifier l’affichage ordinateur et téléphone et les actions principales
- [x] Accélérer l'import CJ (produits en parallèle, images en parallèle, variantes groupées, débit CJ adaptatif, étape en cours, réessai par produit, dates de synchro par partie)
- [x] Import de 100 produits testé (227 s, 0 erreur) ; reprise via bail expiré
- [x] Import autonome page fermée (réveil serveur chaque minute), annulation définitive, règle désactivée = imports annulés
- [x] Transport : moteur central unique panier/checkout (minimum et frais fixes une fois par envoi)
- [ ] Tester la synchro « stock seul »
- [x] Validation produits : validation automatique CJ, origine, filtres serveur, liste infinie, tout sélectionner par filtre, actions en masse par lots
- [x] Sourcing CJ : sélection famille / sous-famille / sous-sous-famille (manuel + programmé), quota jusqu'à 5 000/jour, reprise du parcours d'un jour à l'autre
- [x] Import manuel réorganisé (sélecteur en arbre, tri, détails repliés, import auto des nouveaux)
- [x] Catalogue public filtrable (/catalogue) : matière, couleur, taille, pays, prix, stock, tri

## Intégration commandes CJ
- [x] Contrôle stock n°1 (commande client) et n°2 (avant envoi CJ), par variante
- [x] Statut « Problème de stock — action requise » + alerte Cockpit
- [x] Verrou anti-doublon + rattachement d'une commande CJ déjà existante
- [x] Relecture automatique statuts/suivi CJ (toutes les 2 h)
- [ ] Webhooks CJ (attente : activation dans le compte CJ)
- [ ] Paiement CJ automatique (attente : plafond choisi par l'utilisateur)
- [ ] Module Caisses CN-2026-xxx (attente : accord consolidation avec CJ)

- [x] Cockpit : archivage fiable, suppression définitive protégée, rappels serveur, sons, tableau À faire, historique
- [x] Suggestions sous les produits : famille pertinente avec repli non vide (vérification en situation réelle après retour de la base)
- [ ] Pays d'origine des produits CJ existants : correction progressive lancée, contrôle final après retour de la base ; futurs imports renseignés
- [x] Partage KawZone : QR vers le bon site et visuels propres à la marque (aperçu vérifié)
