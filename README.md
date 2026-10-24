# EpiHub

Hub personnel (Linux) qui regroupe **GitHub**, l'**intra Epitech**, **My Epitech** et **Microsoft Teams** dans une seule fenêtre, avec un accueil unifié et des liens entre les services. Application Electron + React, interface en français, thème sombre par défaut.

## Installation

Les paquets sont générés dans `dist/` (voir `npm run dist`).

- **AppImage** :
  ```bash
  chmod +x dist/EpiHub-*.AppImage
  ./dist/EpiHub-*.AppImage
  ```
  L'AppImage nécessite FUSE 2 : `sudo apt install libfuse2` (`libfuse2t64` sur Ubuntu 24.04+). Sans FUSE, lancer avec `APPIMAGE_EXTRACT_AND_RUN=1 ./EpiHub-0.1.0.AppImage`.

  Sur Ubuntu 24.04 et plus récent, les espaces de noms utilisateur non privilégiés sont restreints par AppArmor : le bac à sable de Chromium ne peut alors pas démarrer depuis une AppImage et l'application se ferme avec une erreur `chrome-sandbox` / « The SUID sandbox helper binary was found, but is not configured correctly ». Dans ce cas, lancer `./EpiHub-0.1.0.AppImage --no-sandbox` (ce qui désactive le bac à sable des processus de rendu de Chromium), ou préférer le paquet `.deb` (recommandé).
- **.deb** (recommandé sur Ubuntu) :
  ```bash
  sudo apt install ./dist/epihub_*.deb
  ```
  Le paquet installe l'application dans `/opt/EpiHub`, l'ajoute au menu des applications et pose un profil AppArmor (`/etc/apparmor.d/epihub`) pour que le bac à sable Chromium fonctionne sur Ubuntu 23.10+. Le profil est retiré à la désinstallation (`sudo apt remove epihub`).

### Icône sur le bureau

Après l'installation du `.deb` :

```bash
./scripts/desktop-shortcut.sh           # ajoute EpiHub sur le bureau
./scripts/desktop-shortcut.sh --remove  # la retire
```

Le script copie le raccourci du menu sur le bureau et le marque « de confiance » pour GNOME, ce qui permet de lancer EpiHub d'un double-clic. Pour l'épingler au dock : ouvre EpiHub, clic droit sur son icône dans le dock → « Épingler au dock ».

## Développement

```bash
npm install
npm run dev        # lance l'application en mode développement
npm test           # tests unitaires (vitest)
npm run typecheck  # vérification TypeScript
npm run dist       # construit l'AppImage et le .deb dans dist/
```

Code source : https://github.com/noebouisson/epihub

## Première utilisation

1. Ouvrir chaque onglet (GitHub, Intra, My Epitech, Teams) et s'y connecter une fois. Les sessions sont conservées entre les lancements (partitions `persist:github`, `persist:intra`, `persist:myepitech`, `persist:teams`).
2. Créer un token GitHub **classique** (le lien est dans **Réglages**) avec les droits **`repo`**, **`notifications`** et **`read:user`**. Un token « fine-grained » fonctionne aussi, mais sans les notifications GitHub.
3. Ouvrir **Réglages** dans EpiHub et coller le token (bouton « Supprimer le token » pour l'effacer). Il est chiffré avec `safeStorage` ; si le chiffrement n'est pas disponible sur la machine (y compris sous Linux sans trousseau, backend `basic_text`), l'application refuse de le stocker et le signale.

## Fonctionnalités

- **Accueil** : vue unifiée des rendus, dépôts GitHub et notifications, rafraîchie automatiquement toutes les 5 minutes (un service en erreur ne bloque pas les autres).
- **Liens rendus ↔ dépôts** : chaque rendu de l'intra est associé à son dépôt GitHub. Une alerte est émise quand la fin est dans moins de 48 h et qu'il n'y a pas de dépôt lié ou aucun commit depuis 24 h ; elle devient *urgente* sous 6 h.
- **Notifications de bureau** : rendus à risque, notifications GitHub, messages Teams. Une notification par rendu et par niveau, dédupliquée sur 7 jours (2 minutes pour les messages Teams). Au premier passage de chaque service, l'existant est marqué comme lu sans notifier.
- **Teams en arrière-plan** : l'onglet Teams est chargé (caché) dès le lancement, pour que le nombre de non-lus et les notifications fonctionnent sans l'ouvrir.
- **Démarrage rapide** : les dernières données connues (sans aucun token) sont gardées dans `cache.json` et affichées dès l'ouverture, le temps du premier rafraîchissement.
- **Recherche Ctrl+K** : palette de recherche rapide dans les rendus, dépôts et services.
- **Partage vers Teams** : copie le titre et le lien de l'élément (rendu, dépôt…) dans le presse-papiers et ouvre l'onglet Teams ; il ne reste qu'à coller dans la conversation.

## Limites

- Il n'existe **pas d'API officielle Epitech** : l'intra et My Epitech sont lus via leurs sites. Si ces sites changent, les modules correspondants devront être mis à jour.
- Pour **Teams**, seuls le **nombre de messages non lus** et les **notifications** sont récupérés ; le contenu des messages n'est pas lu.
- Aucun token ni cookie n'est écrit dans les logs.
