# Corriger définitivement les familles CJ en double

## Objectif
Garantir qu’un même rayon CJ n’apparaisse qu’une seule fois dans KawZone, tout en conservant une hiérarchie stricte : famille → sous-famille → sous-sous-famille.

## Actions
- Identifier chaque branche CJ dupliquée par son chemin complet, pas seulement par son nom affiché.
- Rattacher les produits, correspondances CJ et usages existants vers la branche canonique correcte.
- Retirer uniquement les branches devenues totalement inutilisées après vérification ; aucun produit ne sera supprimé.
- Renforcer la normalisation des variantes de noms CJ (apostrophes, pluriels, virgules et séparateurs).
- Empêcher la création future d’un doublon sous un autre parent et masquer les sous-familles réellement vides côté client.
- Vérifier les familles visibles, les nombres de produits et la compilation finale.

## Règles de sécurité
- Aucun prix, stock, variante, image, commande ou traduction produit n’est modifié.
- Les associations validées manuellement restent prioritaires.
- Une catégorie n’est retirée qu’après déplacement vérifié de toutes ses références.
