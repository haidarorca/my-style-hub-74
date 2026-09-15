# KawScan — qualité caméra et analyse locale par zone

## Objectif
Améliorer la qualité réellement capturée et analysée par KawScan, sans reconstruire le scanner ni changer sa logique magasin/prix. Remplacer la lecture OCR générale par une capture temporaire haute définition avec sélection tactile d’une zone.

## Modifications prévues

### 1. Corriger la chaîne caméra
- Demander d’abord la caméra arrière avec ses contraintes natives, puis sélectionner la caméra principale après autorisation lorsque les libellés deviennent disponibles.
- Négocier la meilleure résolution utile réellement supportée, sans associer arbitrairement les maxima largeur/hauteur ni forcer un format incompatible.
- Attendre les métadonnées vidéo avant de mesurer `videoWidth/videoHeight`, puis exposer les réglages réellement obtenus : résolution, cadence, caméra, mise au point et zoom.
- Appliquer séparément les contraintes supportées afin qu’une option refusée ne fasse pas échouer toutes les autres.
- Éviter les traitements qui agrandissent artificiellement les pixels : le moteur natif recevra la frame source, et les recadrages resteront limités à la résolution réellement disponible.
- Garder le scan automatique local avec BarcodeDetector en priorité et ZXing en repli, avec autofocus, flash, zoom et protection anti-doublon.

### 2. Capture temporaire haute qualité
- Ajouter au scanner une fonction de capture en mémoire utilisant `ImageCapture.grabFrame()` lorsqu’il est disponible, sinon la frame vidéo à sa résolution intrinsèque.
- Convertir la frame en canvas local sans compression JPEG, sans stockage et sans envoi serveur.
- Libérer explicitement bitmap, canvas et références temporaires à la fermeture ou après analyse.

### 3. Sélection tactile de zone
- Remplacer « Lire le texte » par « Analyser une zone ».
- Afficher la capture dans un écran dédié avec un rectangle initial visible.
- Permettre de déplacer la zone et de redimensionner ses quatre coins au doigt, avec dimensions minimales et limites de l’image.
- Afficher l’instruction « Encadrez le texte ou le code que vous souhaitez analyser. » puis les actions Annuler et Analyser.

### 4. Barcode puis OCR local sur la zone
- Recadrer uniquement la zone choisie à partir de la capture pleine résolution.
- Chercher d’abord un code avec BarcodeDetector ; utiliser ZXing local sur le recadrage en repli.
- Si aucun code n’est détecté, préparer le crop pour l’OCR : niveaux de gris, contraste local, légère netteté et variantes de rotation utiles.
- Exécuter Tesseract localement et ponctuellement, jamais en continu.
- Nettoyer les mots OCR et lancer la recherche intelligente KawZone existante ; un code reconnu lance directement la recherche de prix existante.

### 5. Vérifications
- Vérifier les types et les imports.
- Tester l’écran scanner mobile : retour, recherche, capture, sélection tactile, redimensionnement, états d’analyse et nettoyage mémoire avec caméra simulée.
- Vérifier le panier mobile : une seule barre basse, actions du panier au-dessus, contenu visible et liens Accueil/Catégories/Recherche/Compte accessibles.
- Documenter dans l’interface la résolution réellement obtenue afin qu’un test sur téléphone confirme la source fournie par le navigateur.

## Limites matérielles
La page web ne peut pas reproduire tout le traitement photographique propriétaire de l’application caméra native. KawScan utilisera toutefois la meilleure frame réellement fournie par le navigateur, sans capture basse résolution ni agrandissement artificiel.
