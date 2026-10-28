# Application Android

Petite enveloppe qui affiche le site en ligne (https://elfreto.github.io/ferme-sibita/).
Les mises à jour du site arrivent donc toutes seules dans l'application, et la saisie
hors ligne marche comme dans le navigateur (service worker + IndexedDB).
Les fichiers Excel exportés sont enregistrés dans Téléchargements (Android 10 et plus)
puis proposés au partage (WhatsApp, etc.).

Il ne faut refaire l'APK que si ce dossier change.

## Compiler

Chaque push qui touche `android/` lance `.github/workflows/apk.yml`. Il publie
`ferme-sibita-non-signe.apk` et `apksigner.jar` dans la release `apk-non-signe`.

## Signer

La clé est gardée hors du dépôt (dossier `android-cle/` des fichiers du projet).
Toujours signer avec cette même clé, sinon le téléphone refuse la mise à jour
et il faudrait désinstaller (ce qui efface les saisies pas encore envoyées).

    java -jar apksigner.jar sign --ks ferme-sibita.keystore --ks-key-alias sibita \
      --out ferme-sibita.apk ferme-sibita-non-signe.apk

Penser à augmenter `versionCode` dans `app/build.gradle` avant chaque nouvel APK.
