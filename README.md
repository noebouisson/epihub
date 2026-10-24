# EpiHub

Hub personnel (Linux) qui regroupe **GitHub**, l'**intra Epitech**, **My Epitech** et **Microsoft Teams** dans une seule fenêtre, avec un accueil unifié et des liens entre les services. Application Electron + React, interface en français, thème sombre par défaut.

## Installation

Les paquets sont générés dans `dist/` (voir `npm run dist`).

- **AppImage** :
  ```bash
  chmod +x dist/EpiHub-*.AppImage
  ./dist/EpiHub-*.AppImage
  ```
- **.deb** :
  ```bash
  sudo apt install ./dist/epihub_*.deb
  ```
  Puis lancer « EpiHub » depuis le menu des applications.

## Développement

```bash
npm install
npm run dev        # lance l'application en mode développement
npm test           # tests unitaires (vitest)
npm run typecheck  # vérification TypeScript
npm run dist       # construit l'AppImage et le .deb dans dist/
```

## Première utilisation

1. Ouvrir chaque onglet (GitHub, Intra, My Epitech, Teams) et s'y connecter une fois. Les sessions sont conservées entre les lancements (partitions `persist:github`, `persist:intra`, `persist:myepitech`, `persist:teams`).
2. Créer un token GitHub : *GitHub → Settings → Developer settings → Personal access tokens*, avec les droits **`repo`**, **`notifications`** et **`read:user`**.
3. Ouvrir **Réglages** dans EpiHub et coller le token. Il est chiffré avec `safeStorage` ; si le chiffrement n'est pas disponible sur la machine, l'application refuse de le stocker et le signale.

## Fonctionnalités

- **Accueil** : vue unifiée des rendus, dépôts GitHub et notifications, rafraîchie automatiquement toutes les 5 minutes (un service en erreur ne bloque pas les autres).
- **Liens rendus ↔ dépôts** : chaque rendu de l'intra est associé à son dépôt GitHub. Une alerte est émise quand la fin est dans moins de 48 h et qu'il n'y a pas de dépôt lié ou aucun commit depuis 24 h ; elle devient *urgente* sous 6 h.
- **Notifications de bureau** : rendus à risque, notifications GitHub, messages Teams. Une notification par rendu et par niveau, dédupliquée sur 7 jours.
- **Recherche Ctrl+K** : palette de recherche rapide dans les rendus, dépôts et services.
- **Partage vers Teams** : partager un élément (rendu, dépôt…) vers Teams.

## Limites

- Il n'existe **pas d'API officielle Epitech** : l'intra et My Epitech sont lus via leurs sites. Si ces sites changent, les modules correspondants devront être mis à jour.
- Pour **Teams**, seuls le **nombre de messages non lus** et les **notifications** sont récupérés ; le contenu des messages n'est pas lu.
- Aucun token ni cookie n'est écrit dans les logs.
