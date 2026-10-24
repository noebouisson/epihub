# EpiHub — page « Projet »

Date : 2026-10-25
Statut : validé en conversation, en attente de relecture de la spec
Base : spec EpiHub du 2026-10-24 (`docs/superpowers/specs/2026-10-24-epihub-design.md`)

## 1. Objectif

Une page par projet Epitech qui réunit tout ce qui le concerne :

- le **sujet** (description et fichiers de l'intranet) ;
- le **rendu** (date de fin, compte à rebours, alerte existante) ;
- le **repo GitHub** lié (derniers commits, PR ouvertes) ;
- les **résultats My Epitech** (historique des passages de la moulinette et détail des tests du dernier passage) ;
- la **conversation Teams** du projet (lien collé à la main).

### Critères de réussite

1. Tous les projets de l'année apparaissent dans une liste : ceux à rendre (intranet) et ceux qui ont déjà des résultats My Epitech. Un projet présent des deux côtés n'apparaît qu'une fois.
2. Ouvrir la page d'un projet affiche immédiatement ce qui est déjà connu (titre, module, rendu, repo lié, dernier score), puis complète chaque section dès que ses données arrivent.
3. Une section en erreur (session expirée, réponse inattendue) n'empêche pas les autres de s'afficher.
4. Les liens repo et Teams peuvent être posés sur n'importe quel projet, y compris un projet passé, et sont conservés au redémarrage.
5. Un clic sur un rendu de l'accueil, ou Entrée sur un projet dans Ctrl+K, ouvre sa page.

### Hors périmètre

- Lire les messages Teams ou créer une conversation (pas d'API sans accord de l'admin).
- Afficher le PDF du sujet dans la page (il s'ouvre dans l'onglet Intranet).
- Projets des années précédentes.

## 2. Modèle de données

### 2.1 Clé de projet

Un projet est identifié par `projectKey = "<MODULE>/<nom compact>"` :

- `MODULE` : code module en majuscules (`G-CPE-100`) ;
- `nom compact` : nom du projet passé par `normalize()` puis débarrassé de tous les `-` (même règle que l'association repo, Ruling 1 de la spec EpiHub).

Exemple : module `G-CPE-100`, projet « C Pool Day 01 » → `G-CPE-100/cpoolday01`.

### 2.2 Fusion

```ts
interface ProjectSummary {
  key: string;               // projectKey
  title: string;             // titre intranet, sinon nom My Epitech
  moduleCode: string;
  deadline: DeadlineView | null;   // si le projet est à rendre (intranet)
  lastResult: TestResult | null;   // dernier passage My Epitech connu
  repo: Repo | null;               // repo lié (manuel ou automatique)
  teamsUrl: string | null;         // lien Teams collé
  status: 'en-cours' | 'termine';  // en-cours si deadline à venir
}
```

- Source intranet : `IntraData.deadlines` (déjà disponible).
- Source My Epitech : `MyEpitechData.results` (déjà disponible).
- Deux entrées fusionnent si elles ont la même `projectKey`.
- Tri de la liste : projets `en-cours` par date de fin croissante, puis `termine` par date du dernier résultat décroissante.

### 2.3 Liens enregistrés

`Settings` gagne deux champs :

```ts
projectRepoLinks: Record<string /* projectKey */, string /* repo fullName */>;
projectTeamsLinks: Record<string /* projectKey */, string /* URL Teams */>;
```

- Repo d'un projet : `projectRepoLinks[key]`, sinon l'ancien `repoLinks[deadline.id]` s'il existe (compatibilité), sinon l'association automatique existante.
- Poser un lien repo depuis la page projet écrit dans `projectRepoLinks`. Le sélecteur de l'accueil continue d'écrire dans `repoLinks` (inchangé).
- Lien Teams accepté seulement s'il est en `https://` sur `teams.microsoft.com` ou `teams.cloud.microsoft` ; sinon message « Ce lien n'est pas un lien Teams ».

## 3. Données chargées à l'ouverture d'une page

Chargées à la demande (pas à chaque rafraîchissement de 5 min), mises en cache 5 minutes par projet. Chaque section a son propre état : `loading`, `ok`, `needs-login`, `error`, `unavailable` (pas de source pour ce projet, ex. aucun repo lié).

### 3.1 Sujet (intranet)

- Seulement si le projet a un lien intranet (`deadline.url`).
- `GET <lien du projet>?format=json` → description du projet (texte, balises HTML retirées).
- `GET <lien du projet>file/?format=json` → liste des fichiers `{ title, fullpath }` ; URL d'ouverture = `https://intra.epitech.eu` + `fullpath`.
- Cliquer un fichier l'ouvre dans l'onglet Intranet.
- Même détection de session expirée que le service intranet existant.

### 3.2 Repo (GitHub)

- Seulement si un repo est lié.
- 5 derniers commits de la branche par défaut : `GET /repos/{fullName}/commits?sha={branch}&per_page=5`.
- PR ouvertes : `GET /repos/{fullName}/pulls?state=open&per_page=10`.
- Repo vide (409) → liste de commits vide, pas une erreur.

### 3.3 Résultats My Epitech

- Seulement si le projet a au moins un résultat (`lastResult`).
- Historique : `GET https://api.epitest.eu/me/<année>/<module>/<slug>` → un élément par passage : `{ date, results: { testRunId, skills } }`. Score d'un passage = même calcul que l'existant (Σpassed / Σcount).
- Détail du dernier passage : `GET https://api.epitest.eu/me/details/<testRunId>` → par catégorie (`skills`), la liste des tests avec réussi / échoué / crash.
- Le `slug` du projet est conservé dans `TestResult` (nouveau champ `slug`).
- Ces deux formats ne sont pas documentés : le décodage est isolé dans le service My Epitech et testé avec des exemples ; à vérifier avec une vraie session.

### 3.4 Teams

- Aucune donnée chargée. Si un lien est posé : bouton « Ouvrir la conversation » qui ouvre ce lien dans l'onglet Teams ; sinon bouton « Lier une conversation Teams ».
- Bouton « Partager sur Teams » existant (titre du projet + lien intranet ou My Epitech).

## 4. Interface

- **Barre latérale** : nouvelle entrée « Projets » entre Accueil et GitHub.
- **Liste des projets** : champ de filtre (titre, code module), deux groupes « En cours » et « Terminés ». Chaque ligne : titre, module, rendu ou dernier score, pastille d'alerte.
- **Page projet** : en-tête (titre, module, compte à rebours et alerte, boutons « Ouvrir sur l'intranet » / « Ouvrir sur My Epitech »), puis cartes Sujet, Repo, My Epitech, Teams.
- **Graphique** : courbe SVG simple du score (0–100 %) par passage, sans bibliothèque, avec la date au survol.
- **Accès** : clic sur un rendu de l'accueil → page du projet ; Ctrl+K : nouveau type de résultat « projet » (`project:<key>`) qui ouvre la page.
- Textes en français, thème sombre par défaut, mêmes composants que l'existant (Card, StatusBadge).

## 5. Architecture

- `src/main/links/projects.ts` : fusion pure (`buildProjects`, `projectKey`, `isTeamsUrl`). Testée.
- `src/main/services/intra.ts` : `projectDetails(url)` (sujet + fichiers).
- `src/main/services/github.ts` : `recentCommits(fullName, branch)`, `openPulls(fullName)`.
- `src/main/services/myepitech.ts` : `history(module, slug)`, `runDetails(testRunId)`.
- `src/main/app/projectDetails.ts` : assemble les sections d'une page, cache 5 min, états par section. Testé avec des services simulés.
- IPC : `epihub:projects` → `ProjectSummary[]` ; `epihub:project(key)` → détail par section ; liens via `settings:update`.
- Renderer : `pages/Projects.tsx`, `pages/Project.tsx`, `components/ScoreChart.tsx`, `components/TeamsLinkEditor.tsx`.

## 6. Erreurs et sécurité

- Section par section : `needs-login` → « Reconnecte-toi » (ouvre l'onglet du service) ; `error` → message court + « Réessayer » (recharge la section).
- Aucun token dans les logs ni dans le cache des pages projet.
- Les liens Teams collés sont validés (domaine Teams, https) avant d'être enregistrés et avant d'être ouverts ; l'ouverture passe par l'allowlist existante.
- Les URL de fichiers du sujet sont reconstruites sur `https://intra.epitech.eu` ; un `fullpath` qui n'est pas un chemin absolu est ignoré.

## 7. Tests

- `projects.ts` : clé (accents, espaces, tirets), fusion intranet + My Epitech, projet seulement d'un côté, tri, priorité des liens (projet > ancien lien > automatique), validation des liens Teams.
- Services : décodage sujet + fichiers, session expirée ; commits récents (409 → vide), PR ; historique et détail My Epitech, formats inattendus → erreur claire.
- `projectDetails.ts` : sections indépendantes (une en erreur, les autres ok), cache 5 min, états `unavailable`.
- Interface : vérification par typecheck, build et lancement.
