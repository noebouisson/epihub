# EpiHub — design

Date : 2026-10-24
Statut : validé en conversation, en attente de relecture de la spec

## 1. Objectif

Une application de bureau personnelle (Linux en priorité) qui regroupe en une seule fenêtre :

- **GitHub**
- **Intranet Epitech** (intra.epitech.eu)
- **My Epitech** (my.epitech.eu, résultats des tests)
- **Microsoft Teams** (teams.microsoft.com)

…avec un **tableau de bord unifié** qui résume l'état de chaque service, et des **liens entre services**.

### Critères de réussite

1. Une seule connexion par service ; les sessions survivent au redémarrage de l'app.
2. L'accueil affiche en moins de 3 s (données en cache) : notifications GitHub, PR à relire, prochains rendus Epitech avec leur dernier commit, derniers résultats My Epitech, nombre de messages Teams non lus.
3. Toutes les notifications de bureau passent par l'app, sans doublon.
4. Ctrl+K trouve un repo, un projet ou un rendu et ouvre le bon onglet.
5. Si un service tombe ou une session expire, le reste de l'app continue de fonctionner.

### Hypothèses

- Utilisateur unique, sur sa propre machine.
- Aucune dépendance à une autorisation d'administrateur Epitech / Microsoft (pas d'app Azure, pas de Microsoft Graph).
- L'intranet et My Epitech n'ont pas d'API publique officielle : les modules correspondants sont isolés pour être faciles à corriger si le site change.

### Hors périmètre (v1)

- Lire ou envoyer le contenu des messages Teams par API.
- Version mobile, multi-utilisateur, synchronisation cloud.
- Édition de code / actions Git (push, merge) depuis l'app.

## 2. Technologies

- **Electron** (processus principal en TypeScript) + **React** + **Vite** (via `electron-vite`).
- **Vitest** pour les tests unitaires.
- **electron-builder** pour produire un AppImage / .deb.
- Stockage local : fichier JSON dans `app.getPath('userData')` ; secrets chiffrés avec `safeStorage` d'Electron.

## 3. Architecture

```
┌───────────────────────────── Processus principal ──────────────────────────────┐
│  services/                                                                      │
│    github.ts     intra.ts     myepitech.ts     teams.ts                         │
│        └───────────┴──────────────┴───────────────┘                             │
│                         ServiceRegistry (planificateur 5 min, cache)            │
│  links/   repoMatcher.ts  deadlineAlerts.ts  searchIndex.ts  shareText.ts       │
│  notify/  notificationHub.ts (file unique, déduplication)                       │
│  store/   settings.ts (JSON)  secrets.ts (safeStorage)                          │
│  ipc.ts   (API exposée au renderer via preload, typée)                          │
└──────────────────────────────────────────────────────────────────────────────────┘
                 ▲ IPC (contextBridge)                     ▲ sessions partagées
┌────────────── Renderer React ─────────────┐   ┌──── <webview> par service ─────┐
│ Sidebar · Accueil (cartes) · Ctrl+K ·      │   │ partition persist:github       │
│ Réglages · conteneur des webviews          │   │ persist:intra  persist:myepi   │
└────────────────────────────────────────────┘   │ persist:teams                  │
                                                  └────────────────────────────────┘
```

### 3.1 Interface commune des services

Chaque module de `services/` implémente :

```ts
interface Service<T> {
  id: 'github' | 'intra' | 'myepitech' | 'teams';
  status(): Promise<ServiceStatus>;   // 'ok' | 'needs-login' | 'error' (+ message)
  refresh(): Promise<T>;              // récupère et met en cache
  cached(): T | null;                 // dernières données connues
}
```

Le `ServiceRegistry` appelle `refresh()` au démarrage, puis toutes les 5 minutes, et à la demande (bouton « Rafraîchir »). Chaque service est appelé indépendamment : une erreur dans l'un n'empêche pas les autres de se mettre à jour.

### 3.2 Sessions et onglets

- Chaque service a sa propre partition persistante (`persist:<id>`) : cookies et stockage local isolés et gardés entre les redémarrages.
- Les onglets sont des `<webview>` dans le renderer, chargés à la première ouverture et gardés en mémoire ensuite.
- Le processus principal fait ses appels réseau avec `session.fromPartition('persist:<id>').fetch(...)` : il réutilise les cookies de l'onglet, donc aucun mot de passe n'est manipulé par l'app.
- Les liens externes (hors des domaines du service) s'ouvrent dans le navigateur par défaut.

## 4. Services

### 4.1 GitHub (`github.ts`)

- Authentification : token personnel (fine-grained ou classic, droits `repo`, `notifications`, `read:user`) saisi dans Réglages, stocké chiffré via `safeStorage`.
- Données : utilisateur, notifications non lues, PR où une revue est demandée, issues assignées, liste des repos (nom, URL, dernier push, branche par défaut), dernier commit d'un repo à la demande.
- API REST v3 (`https://api.github.com`), en-tête `If-None-Match` pour économiser le quota.
- Pas de token → statut `needs-login`, la carte propose « Ajouter un token ».

### 4.2 Intranet Epitech (`intra.ts`)

- Connexion : l'utilisateur se connecte une fois dans l'onglet (connexion Microsoft de l'école).
- Données lues via les pages JSON de l'intranet (`?format=json`) avec la session `persist:intra` :
  - utilisateur (login, promo, crédits, GPA)
  - prochains rendus de projets (code module, code projet, titre, date de fin, URL)
  - activités / événements à venir
  - notifications de l'intranet (messages, notes)
- Réponse HTML de connexion ou 401/403 → statut `needs-login`.
- Toutes les URL et le décodage sont regroupés dans ce fichier.

### 4.3 My Epitech (`myepitech.ts`)

- Connexion : l'utilisateur se connecte une fois dans l'onglet.
- Le jeton du site est lu dans le stockage local de la page my.epitech.eu (via `webContents.executeJavaScript` sur la webview, ou une fenêtre cachée de la même partition), puis utilisé pour appeler l'API des résultats.
- Données : derniers résultats de tests par projet (projet, date, pourcentage réussi, URL).
- Jeton absent ou expiré → `needs-login`.

### 4.4 Teams (`teams.ts`)

- Connexion : dans l'onglet, une fois.
- Nombre de non-lus : lu dans le titre de la page (motif `(N)` en tête), surveillé via l'événement `page-title-updated`.
- Notifications : un script de preload injecté dans la webview Teams remplace `window.Notification` pour transmettre titre et corps à l'app, qui les publie via le `notificationHub`.
- Statut `needs-login` si la page reste sur l'écran de connexion Microsoft.

## 5. Liens entre services

### 5.1 Projet Epitech ↔ repo GitHub (`links/repoMatcher.ts`)

- Association automatique : pour chaque projet de l'intranet, on cherche un repo dont le nom normalisé (minuscules, `-`/`_` équivalents) contient le code projet ou le code module + le nom court du projet (ex. `G-CPE-100` + `cpoolday01`). En cas d'égalité, on garde le repo poussé le plus récemment.
- Association manuelle : un bouton « Lier un repo » sur chaque rendu ; le choix manuel est enregistré dans `settings.json` et l'emporte toujours sur l'automatique.
- Affichage : chaque rendu montre le repo lié, le dernier commit (message, auteur, il y a combien de temps).

### 5.2 Alertes de rendu (`links/deadlineAlerts.ts`)

- Une alerte est levée si : date de fin dans moins de 48 h **et** (pas de repo lié **ou** aucun commit depuis 24 h).
- Niveau « urgent » si date de fin dans moins de 6 h.
- L'alerte s'affiche sur la carte et envoie une notification de bureau une seule fois par rendu et par niveau.

### 5.3 Notifications de bureau (`notify/notificationHub.ts`)

- Une seule file pour tous les services. Chaque élément a une clé `service:idSource`.
- Déduplication : une clé déjà notifiée n'est plus renvoyée (mémoire des clés gardée sur 7 jours).
- Cliquer une notification ouvre l'app sur l'onglet et la page concernés.
- Réglages : activer / désactiver par service.

### 5.4 Partager vers Teams (`links/shareText.ts`)

- Sur une PR, une issue ou un rendu : bouton « Partager sur Teams ».
- Génère un texte (`[Titre] — lien`), le copie dans le presse-papiers, ouvre l'onglet Teams et affiche « Copié, colle-le dans la conversation ».

### 5.5 Recherche globale Ctrl+K (`links/searchIndex.ts`)

- Index en mémoire reconstruit après chaque rafraîchissement : repos, PR / issues, projets et rendus Epitech, pages fixes (Réglages, chaque onglet).
- Recherche floue sur le titre et les codes, résultats classés par score puis par date.
- Entrée → ouvre l'onglet concerné à l'URL de l'élément.

## 6. Interface

- **Barre latérale** : Accueil, GitHub, Intranet, My Epitech, Teams (avec pastille de non-lus), Réglages.
- **Accueil** : cartes « À rendre bientôt » (rendus + repo + alertes), « GitHub » (notifs, PR à relire), « My Epitech » (derniers résultats), « Teams » (non-lus + bouton d'ouverture), « Profil Epitech » (crédits, GPA).
- **Réglages** : token GitHub, état de connexion de chaque service avec bouton « Se reconnecter », notifications par service, associations projet ↔ repo.
- Thème sombre par défaut, clair disponible.

## 7. Erreurs

- Chaque carte affiche l'état de son service : chargement, données (avec l'heure de mise à jour), `needs-login` (« Reconnecte-toi » → ouvre l'onglet), `error` (message court + « Réessayer »).
- En cas d'erreur, les dernières données en cache restent affichées avec la mention « données de HH:MM ».
- Erreurs réseau : nouvel essai au cycle suivant, sans boucle agressive.
- Aucune donnée sensible (token, cookies) dans les logs.

## 8. Sécurité

- Renderer avec `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` ; seul le preload expose une API typée et limitée.
- Les webviews n'ont pas accès à Node ; seule la webview Teams reçoit un preload minimal (capture des notifications).
- Navigation des webviews limitée aux domaines du service et à ceux de la connexion Microsoft ; le reste part dans le navigateur.
- Token GitHub chiffré avec `safeStorage` ; si le chiffrement n'est pas disponible sur le système, l'app prévient et ne stocke pas le token.

## 9. Tests

- **Unitaires (Vitest)** :
  - `repoMatcher` : correspondances exactes, partielles, égalités, priorité du choix manuel.
  - `deadlineAlerts` : seuils 48 h / 24 h / 6 h, absence de repo, déduplication.
  - `searchIndex` : classement, recherche floue, codes Epitech.
  - `notificationHub` : déduplication et expiration des clés.
  - Décodage des réponses intranet / My Epitech / GitHub à partir d'exemples JSON enregistrés.
- **Vérification manuelle** : construction, lancement, connexion à chaque service, affichage de l'accueil, Ctrl+K, une notification de bureau.

## 10. Structure du projet

```
(racine du dépôt)
  docs/superpowers/specs/  (cette spec)
  package.json  electron.vite.config.ts  electron-builder.yml
  src/main/        index.ts ipc.ts
  src/main/services/   github.ts intra.ts myepitech.ts teams.ts registry.ts
  src/main/links/      repoMatcher.ts deadlineAlerts.ts searchIndex.ts shareText.ts
  src/main/notify/     notificationHub.ts
  src/main/store/      settings.ts secrets.ts
  src/preload/     index.ts teams-webview.ts
  src/renderer/    App.tsx components/ pages/ styles/
  src/shared/      types.ts
  tests/           *.test.ts fixtures/
```
