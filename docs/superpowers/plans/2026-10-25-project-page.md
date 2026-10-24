# Page « Projet » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à EpiHub une liste « Projets » et une page par projet qui réunit sujet intranet, rendu, repo GitHub, historique My Epitech et conversation Teams.

**Architecture:** Une fusion pure (`buildProjects`) produit la liste à partir des données déjà rafraîchies (rendus intranet, résultats My Epitech, repos). Les services gagnent des appels à la demande (sujet, commits/PR, historique/détail My Epitech). Un assembleur (`createProjectDetails`) charge les sections d'une page indépendamment, avec un cache de 5 min. Deux canaux IPC (`epihub:projects` et `epihub:project`) alimentent deux nouvelles pages React.

**Tech Stack:** l'existant (Electron 33, React 18, TypeScript 5, Vitest 2). Aucune nouvelle dépendance.

**Spec:** `docs/superpowers/specs/2026-10-25-project-page-design.md`

## Global Constraints

- Clé de projet : `"<MODULE en majuscules>/<nom compact>"`. Nom compact = sans accents, en minuscules, sans espaces, `_` ni `-`.
- Cache des pages projet : **5 minutes** par projet. Le chargement se fait à l'ouverture de la page, jamais dans le cycle de 5 min des services.
- États de section : `loading` | `ok` | `needs-login` | `error` | `unavailable`. Une section en échec n'empêche jamais les autres.
- Nouveaux réglages : `projectRepoLinks` et `projectTeamsLinks` (`Record<projectKey, string>`), `{}` par défaut.
- Priorité du repo : `projectRepoLinks[key]` (si le repo existe), puis `repoLinks[deadline.id]`, puis association automatique.
- Lien Teams accepté seulement en `https://` avec l'hôte `teams.microsoft.com` ou `teams.cloud.microsoft`. Sinon le message affiché est « Ce lien n'est pas un lien Teams ».
- Le décodage des formats intranet, GitHub et My Epitech reste dans le fichier de service concerné. Aucun token dans les logs ni dans le cache.
- Textes de l'interface en français. On réutilise `Card` et `StatusBadge`.

## Review Focus

1. **Accents et ponctuation** : un nom comme « Mini Shéll_2 » doit donner la même clé côté intranet et côté My Epitech (test dans la tâche 1).
2. **Lien Teams invalide** : `http://teams.microsoft.com/...`, `https://evil.com/teams.microsoft.com` ou `javascript:` sont refusés à l'enregistrement et jamais ouverts (tests dans la tâche 1).
3. **Repo lié supprimé** : un lien manuel vers un repo absent retombe sur le lien suivant, sans planter (test dans la tâche 1).
4. **Format My Epitech inattendu** : objet au lieu de tableau, `results` manquant. Le résultat doit être une erreur claire « Format My Epitech inattendu » dans la seule section résultats (tests dans les tâches 2 et 3).
5. **Projet passé sans lien intranet** : la section Sujet est `unavailable`, pas `error` (test dans la tâche 3).

---

## File Structure

| Fichier | Rôle |
|---|---|
| `src/shared/projects.ts` | `projectKey`, `isTeamsUrl` : fonctions pures partagées entre main et renderer |
| `src/shared/types.ts` | Nouveaux types (ProjectSummary, sections, données de page), `TestResult.slug`, `Settings`, `EpihubApi`, `SearchItem.kind` |
| `src/main/store/settings.ts` | Valeurs par défaut des deux nouveaux réglages |
| `src/main/links/projects.ts` | `buildProjects` (fusion + tri + liens) |
| `src/main/services/intra.ts` | `projectDetails(url)` |
| `src/main/services/github.ts` | `recentCommits`, `openPulls` |
| `src/main/services/myepitech.ts` | `slug` dans les résultats, `history`, `runDetails` |
| `src/main/app/projectDetails.ts` | Assemblage des sections, cache 5 min |
| `src/main/links/searchIndex.ts` | Éléments `project:<key>` |
| `src/main/ipc.ts`, `src/main/index.ts`, `src/preload/index.ts` | Canaux `epihub:projects` et `epihub:project` |
| `src/renderer/src/**` | Entrée « Projets », pages Projects et Project, ScoreChart, TeamsLinkEditor, accès depuis l'accueil et Ctrl+K |

---

### Task 1: Types, réglages et fusion des projets

**Files:**
- Create: `src/shared/projects.ts`, `src/main/links/projects.ts`
- Modify: `src/shared/types.ts`, `src/main/store/settings.ts`
- Test: `tests/shared/projects.test.ts`, `tests/links/projects.test.ts`, `tests/store/settings.test.ts`

**Interfaces:**
- Produces (`src/shared/types.ts`, ajouts) :

```ts
export interface TestResult { id: string; project: string; module: string; slug: string; date: string; percent: number; url: string } // + slug
export interface ProjectSummary {
  key: string; title: string; moduleCode: string;
  deadline: DeadlineView | null; lastResult: TestResult | null;
  repo: Repo | null; teamsUrl: string | null; status: 'en-cours' | 'termine';
}
export type SectionState = 'loading' | 'ok' | 'needs-login' | 'error' | 'unavailable';
export interface Section<T> { state: SectionState; data: T | null; message?: string }
export interface SubjectData { description: string; files: { title: string; url: string }[] }
export interface PullSummary { number: number; title: string; url: string; author: string; updatedAt: string }
export interface RepoActivity { commits: Commit[]; pulls: PullSummary[] }
export interface TestRun { id: string; date: string; percent: number }
export interface TestCase { name: string; passed: boolean; crashed: boolean }
export interface SkillReport { name: string; passed: number; count: number; tests: TestCase[] }
export interface ResultsData { runs: TestRun[]; latest: SkillReport[] }
export interface ProjectDetail { summary: ProjectSummary; subject: Section<SubjectData>; repo: Section<RepoActivity>; results: Section<ResultsData> }
// Settings gagne : projectRepoLinks: Record<string, string>; projectTeamsLinks: Record<string, string>
// SearchItem.kind gagne 'project'
// (EpihubApi.projects / project sont ajoutés dans la tâche 3, avec le preload)
```

- Produces (`src/shared/projects.ts`) : `projectKey(moduleCode: string, name: string): string` ; `isTeamsUrl(url: string): boolean`.
- Produces (`src/main/links/projects.ts`) : `buildProjects(input: { deadlines: DeadlineView[]; results: TestResult[]; repos: Repo[]; settings: Pick<Settings, 'repoLinks' | 'projectRepoLinks' | 'projectTeamsLinks'>; now: Date }): ProjectSummary[]`.

Règles de `buildProjects` :
- **Fusion** : clé `projectKey(deadline.moduleCode, deadline.title)` côté intranet, `projectKey(result.module, result.project)` côté My Epitech. Deux entrées de même clé fusionnent : le titre intranet est prioritaire et `lastResult` est le résultat le plus récent.
- **Repo** : `projectRepoLinks[key]` s'il figure dans `repos`, sinon `repoLinks[deadline.id]` s'il figure dans `repos`, sinon `deadline.repo`, sinon `matchRepo({ id: key, moduleCode, projectCode: normalize(title), title, end: '', url: '' }, repos, {}).repo`.
- **teamsUrl** : `projectTeamsLinks[key]` si `isTeamsUrl` est vrai, sinon `null`.
- **Statut** : `en-cours` si `deadline` existe et que `deadline.end > now`, sinon `termine`.
- **Tri** : les projets `en-cours` par `deadline.end` croissante, puis les `termine` par `lastResult.date` décroissante (ceux sans résultat en dernier).

- [ ] **Step 1: Tests qui doivent échouer**

```ts
// tests/shared/projects.test.ts
test('clé : accents, espaces, _ et -', () => expect(projectKey('g-cpe-100', 'Mini Shéll_2 - v')).toBe('G-CPE-100/minishell2v'));
test('clé identique des deux côtés', () => expect(projectKey('B-PSU-100', 'My Sokoban')).toBe(projectKey('B-PSU-100', 'my_sokoban')));
test('lien Teams valide', () => { expect(isTeamsUrl('https://teams.microsoft.com/l/chat/19:abc/0')).toBe(true); expect(isTeamsUrl('https://teams.cloud.microsoft/l/channel/x')).toBe(true); });
test('lien Teams refusé', () => { for (const u of ['http://teams.microsoft.com/l/chat/x', 'https://evil.com/teams.microsoft.com', 'https://teams.microsoft.com.evil.com/x', 'javascript:alert(1)', '']) expect(isTeamsUrl(u)).toBe(false); });

// tests/links/projects.test.ts (now = 2026-10-25T12:00:00Z)
test('fusionne intranet et My Epitech de même clé', () => {
  const p = buildProjects({ deadlines: [dv({ moduleCode: 'G-CPE-100', title: 'C Pool Day 01' })], results: [res({ module: 'G-CPE-100', project: 'cpoolday01', date: '2026-10-20T10:00:00Z' })], repos: [], settings: empty, now });
  expect(p).toHaveLength(1);
  expect(p[0]).toMatchObject({ key: 'G-CPE-100/cpoolday01', title: 'C Pool Day 01', status: 'en-cours' });
  expect(p[0].lastResult?.date).toBe('2026-10-20T10:00:00Z');
});
test('projet seulement My Epitech → terminé, sans deadline', () => expect(buildProjects({ deadlines: [], results: [res({})], repos: [], settings: empty, now })[0]).toMatchObject({ status: 'termine', deadline: null }));
test('garde le résultat le plus récent', () => expect(buildProjects({ ...base, results: [res({ date: '2026-10-01T00:00:00Z' }), res({ date: '2026-10-22T00:00:00Z' })] })[0].lastResult?.date).toBe('2026-10-22T00:00:00Z'));
test('tri : en cours par échéance, puis terminés par date de résultat', () => {
  // deadlines A (fin +2 j) et B (fin +1 j) ; projets seulement My Epitech C (résultat 2026-10-20) et D (résultat 2026-10-22)
  expect(buildProjects({ deadlines: [dvA, dvB], results: [resC, resD], repos: [], settings: empty, now }).map((p) => p.title)).toEqual(['B', 'A', 'D', 'C']);
});
test('priorité du repo : projet > ancien lien > automatique', () => { /* projectRepoLinks gagne ; sans lui repoLinks[deadline.id] ; sans eux deadline.repo */ });
test('lien projet vers repo supprimé → lien suivant', () => { /* projectRepoLinks pointe vers un repo absent → retombe sur repoLinks / auto */ });
test('lien Teams invalide ignoré', () => expect(buildProjects({ ...base, settings: { ...empty, projectTeamsLinks: { [key]: 'https://evil.com' } } })[0].teamsUrl).toBeNull());

// tests/store/settings.test.ts (ajouts)
test('nouveaux réglages par défaut', () => expect(createSettingsStore(p).get()).toMatchObject({ projectRepoLinks: {}, projectTeamsLinks: {} }));
test('un ancien fichier sans les nouveaux champs les reçoit', () => { writeFileSync(p, JSON.stringify({ repoLinks: { a: 'me/r' } })); expect(createSettingsStore(p).get().projectTeamsLinks).toEqual({}); });
```

- [ ] **Step 2: Lancer** — `npx vitest run tests/shared tests/links/projects.test.ts tests/store/settings.test.ts` → FAIL
- [ ] **Step 3: Implémenter** les types, `src/shared/projects.ts`, `buildProjects` et les valeurs par défaut des réglages. Ajouter `slug` partout où un `TestResult` est construit : le service My Epitech le remplit avec `e.project.slug`, et les fixtures et tests existants sont mis à jour.
- [ ] **Step 4: Lancer** → PASS. Puis `npm test` (suite complète) et `npm run typecheck` → aucune erreur.
- [ ] **Step 5: Commit** — `"feat: fusion des projets intranet et My Epitech"`

---

### Task 2: Appels à la demande des services

**Files:**
- Modify: `src/main/services/intra.ts`, `src/main/services/github.ts`, `src/main/services/myepitech.ts`
- Create: `tests/fixtures/intra/project.json`, `tests/fixtures/intra/project-files.json`, `tests/fixtures/github/commits-5.json`, `tests/fixtures/github/pulls.json`, `tests/fixtures/myepitech/history.json`, `tests/fixtures/myepitech/details.json`
- Test: `tests/services/intra.test.ts`, `tests/services/github.test.ts`, `tests/services/myepitech.test.ts`

**Interfaces:**
- Consumes: types de la tâche 1 ; `FetchLike`, `NeedsLoginError` (existant).
- Produces :
  - `createIntraService(fetch)` renvoie aussi `projectDetails(url: string): Promise<SubjectData>`.
    - Refuse (`Error('URL intranet invalide')`) une URL qui ne commence pas par `https://intra.epitech.eu/`.
    - Chemin = l'URL sans la base, terminée par `/`.
    - Description = `stripTags(json.description ?? '')` à partir de `GET <chemin>?format=json`.
    - Fichiers = `GET <chemin>file/?format=json` : tableau de `{ title, fullpath }`, URL = `https://intra.epitech.eu` + `fullpath`. Une réponse qui n'est pas un tableau donne `[]`, et un `fullpath` qui ne commence pas par `/` est ignoré.
    - Session expirée : même détection que l'existant (`getJson`).
  - `createGithubService(...)` renvoie aussi :
    - `recentCommits(fullName: string, branch: string): Promise<Commit[]>` : `GET /repos/{fullName}/commits?sha={branch}&per_page=5`, 409 donne `[]`. Même conversion en `Commit` que `lastCommit`, sans dupliquer le code.
    - `openPulls(fullName: string): Promise<PullSummary[]>` : `GET /repos/{fullName}/pulls?state=open&per_page=10`, avec `number`, `title`, `html_url`, `user.login` et `updated_at`.
  - `createMyEpitechService(...)` renvoie aussi :
    - `history(module: string, slug: string): Promise<TestRun[]>` : `GET https://api.epitest.eu/me/<année>/<module>/<slug>` (composants encodés), un élément par passage, `id = String(results.testRunId)`, `percent` avec le calcul existant, tri par date croissante.
    - `runDetails(testRunId: string): Promise<SkillReport[]>` : `GET https://api.epitest.eu/me/details/<testRunId>`. Chaque élément de `skills` vaut `{ FullSkillReport: { name, tests: [{ name, passed, crashed }] } }`. On en tire `passed` = nombre de tests réussis et `count` = nombre de tests.
    - Les deux : un code 401 ou 403 lève `NeedsLoginError`, pas de token lève `NeedsLoginError`, et un format inattendu (pas un tableau, champ manquant) lève `Error('Format My Epitech inattendu')`.

- [ ] **Step 1: Fixtures** au format décrit, avec 3 passages dans l'historique (scores 25, 50, 75 %) et 2 catégories dans le détail (une avec un test en crash).
- [ ] **Step 2: Tests qui doivent échouer**

```ts
test('projectDetails : description sans balises et fichiers absolus', async () => {
  const s = await intra.projectDetails('https://intra.epitech.eu/module/2026/G-CPE-100/LYN-0-1/acti-123/project/');
  expect(s.description).not.toContain('<');
  expect(s.files[0].url).toBe('https://intra.epitech.eu/module/2026/G-CPE-100/LYN-0-1/acti-123/project/file/sujet.pdf');
  expect(s.files.every((f) => f.url.startsWith('https://intra.epitech.eu/'))).toBe(true); // fullpath relatif ignoré
});
test('projectDetails : URL hors intranet refusée', async () => { await expect(intra.projectDetails('https://evil.com/x')).rejects.toThrow('URL intranet invalide'); });
test('projectDetails : page de connexion → NeedsLoginError', async () => { serveLoginHtml = true; await expect(intra.projectDetails(PROJECT_URL)).rejects.toBeInstanceOf(NeedsLoginError); });
test('recentCommits : 5 commits', async () => expect(await gh.recentCommits('me/r', 'main')).toHaveLength(5));
test('recentCommits : repo vide (409) → []', async () => expect(await gh.recentCommits('me/empty', 'main')).toEqual([]));
test('openPulls', async () => expect((await gh.openPulls('me/r'))[0]).toMatchObject({ number: 3, author: 'octocat' }));
test('history : trié, pourcentages', async () => expect((await myepi.history('G-CPE-100', 'cpoolday01')).map((r) => r.percent)).toEqual([25, 50, 75]));
test('runDetails : compte réussis / total et crash', async () => { const d = await myepi.runDetails('42'); expect(d[0]).toMatchObject({ passed: 1, count: 2 }); expect(d[1].tests.some((t) => t.crashed)).toBe(true); });
test('history : format inattendu → erreur claire', async () => { serveObject = true; await expect(myepi.history('G-CPE-100', 'x')).rejects.toThrow('Format My Epitech inattendu'); });
test('runDetails : 401 → NeedsLoginError', async () => { status401 = true; await expect(myepi.runDetails('42')).rejects.toBeInstanceOf(NeedsLoginError); });
test('les résultats exposent le slug', async () => expect((await myepi.refresh()).results[0].slug).toBe('cpoolday01'));
```

- [ ] **Step 3: Lancer** → FAIL ; **Step 4: Implémenter** ; **Step 5: Lancer** → PASS ; `npm test` et `npm run typecheck` → aucune erreur.
- [ ] **Step 6: Commit** — `"feat: sujet intranet, activité du repo et historique My Epitech à la demande"`

---

### Task 3: Assemblage des pages, recherche et IPC

**Files:**
- Create: `src/main/app/projectDetails.ts`
- Modify: `src/main/links/searchIndex.ts`, `src/main/ipc.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/shared/types.ts` (EpihubApi)
- Test: `tests/app/projectDetails.test.ts`, `tests/links/searchIndex.test.ts`

**Interfaces:**
- Consumes: `buildProjects` (tâche 1), les appels de la tâche 2.
- Produces :
  - `createProjectDetails(deps: { intra: { projectDetails(url: string): Promise<SubjectData> }; github: { recentCommits(f: string, b: string): Promise<Commit[]>; openPulls(f: string): Promise<PullSummary[]> }; myepitech: { history(m: string, s: string): Promise<TestRun[]>; runDetails(id: string): Promise<SkillReport[]> }; now(): number }): { get(summary: ProjectSummary, force?: boolean): Promise<ProjectDetail> }`
    - Les sections sont chargées en parallèle (`allSettled`).
    - **Sujet** : `unavailable` sans `summary.deadline`.
    - **Repo** : `unavailable` sans `summary.repo`. Il appelle `recentCommits(repo.fullName, repo.defaultBranch)` et `openPulls`.
    - **Résultats** : `unavailable` sans `summary.lastResult`. Il appelle `history(lastResult.module, lastResult.slug)`, puis `runDetails` sur le dernier passage. Sans passage : `ok` avec `{ runs: [], latest: [] }`.
    - **Erreurs** : `NeedsLoginError` donne `needs-login`, une autre erreur donne `error` avec `message`.
    - **Cache** : par `summary.key` pendant 5 min (`now()`), contourné par `force`. Le `summary` renvoyé est toujours celui passé en paramètre (liens à jour), même quand les sections viennent du cache.
  - `buildSearchItems(snap, projects?: ProjectSummary[])` ajoute `{ id: 'project:' + key, kind: 'project', title, subtitle: moduleCode, service: 'app', url: '' }`.
  - IPC (`handle` existant, avec vérification de l'expéditeur) :
    - `epihub:projects` renvoie `buildProjects` (calculé avec `effects.deadlines`, les résultats My Epitech, les repos GitHub, les réglages et la date courante).
    - `epihub:project(key: unknown, force: unknown)` renvoie le `ProjectDetail` du projet de cette clé, ou `null` si la clé est inconnue ou n'est pas une chaîne.
    - `epihub:search` passe désormais la liste des projets à `buildSearchItems`.
  - Preload / `EpihubApi` : `projects()` et `project(key, force?)`.

- [ ] **Step 1: Tests qui doivent échouer**

```ts
test('sections indépendantes : résultats en erreur, les autres ok', async () => {
  const d = await details({ myepitech: failing(new Error('Format My Epitech inattendu')) }).get(full);
  expect(d.subject.state).toBe('ok'); expect(d.repo.state).toBe('ok');
  expect(d.results).toMatchObject({ state: 'error', message: 'Format My Epitech inattendu' });
});
test('projet passé sans lien intranet → sujet unavailable', async () => expect((await details().get({ ...full, deadline: null })).subject.state).toBe('unavailable'));
test('sans repo → repo unavailable ; sans résultat → résultats unavailable', async () => { /* ... */ });
test('NeedsLoginError → needs-login', async () => { /* intra lève NeedsLoginError → subject.state 'needs-login' */ });
test('détail du dernier passage seulement', async () => { /* history 3 passages → runDetails appelé une fois avec l'id du dernier */ });
test('cache 5 min, force le contourne', async () => { /* 2 appels < 5 min → services appelés une fois ; force → deux fois ; après 5 min → deux fois */ });
test('le summary renvoyé est celui passé, même depuis le cache', async () => { /* teamsUrl modifié entre deux get → visible */ });
test('recherche : élément projet', () => expect(search(buildSearchItems({}, [summary]), 'cpoolday')[0].id).toBe('project:G-CPE-100/cpoolday01'));
```

- [ ] **Step 2: Lancer** → FAIL ; **Step 3: Implémenter** l'assembleur, puis la recherche, puis l'IPC, le preload et le câblage dans `index.ts`, en réutilisant les instances de service existantes.
- [ ] **Step 4: Lancer** → PASS ; `npm test`, `npm run typecheck` et `npm run build` → aucune erreur.
- [ ] **Step 5: Commit** — `"feat: assemblage des pages projet et canaux IPC"`

---

### Task 4: Interface : liste « Projets » et page projet

**Files:**
- Create: `src/renderer/src/pages/Projects.tsx`, `src/renderer/src/pages/Project.tsx`, `src/renderer/src/components/ScoreChart.tsx`, `src/renderer/src/components/TeamsLinkEditor.tsx`, `src/renderer/src/chart.ts`
- Modify: `src/renderer/src/services.ts` (type `View`), `src/renderer/src/App.tsx`, `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/components/DeadlineRow.tsx`, `src/renderer/src/components/CommandPalette.tsx`, `src/renderer/src/components/RepoPicker.tsx`, `src/renderer/src/pages/Home.tsx`, `src/renderer/src/styles/app.css`
- Test: `tests/renderer/chart.test.ts`

**Interfaces:**
- Consumes: `window.epihub.projects()`, `window.epihub.project(key, force)`, `updateSettings`, `share`, `projectKey`, `isTeamsUrl` (`src/shared/projects.ts`).
- Produces :
  - `View` gagne `'projects'`. `App` garde `projectKey: string | null` et expose `openProject(key: string)`, qui passe en vue `projects` avec cette clé. `projectKey = null` affiche la liste.
  - `chart.ts` : `scorePoints(runs: TestRun[], width: number, height: number): { x: number; y: number; run: TestRun }[]`. L'axe x est réparti uniformément (un seul passage → centré). L'axe y va de 0 % en bas à 100 % en haut, avec des valeurs hors bornes ramenées dans [0, 100].
  - **Barre latérale** : l'entrée « Projets » est placée entre Accueil et GitHub.
  - **Projects** :
    - charge `projects()` au montage et à chaque `onChanged` ;
    - champ « Filtrer » sur le titre et le code module ;
    - groupes « En cours » et « Terminés » ;
    - chaque ligne affiche le titre, le module, puis `relativeTime(deadline.end)` ou « Dernier score : N % », et une pastille d'alerte.
  - **Project** :
    - affiche immédiatement le `summary` issu de la liste, puis appelle `project(key)` ;
    - bouton « Rafraîchir » qui appelle `project(key, true)` ;
    - en-tête : titre, module, échéance avec alerte, boutons « Ouvrir sur l'intranet » et « Ouvrir sur My Epitech » quand leur lien existe ;
    - cartes « Sujet » (description, fichiers ouverts dans l'onglet Intranet), « Repo » (repo lié ou « Lier un repo », 5 commits, PR ouvertes), « My Epitech » (ScoreChart, puis les catégories du dernier passage avec `passed/count`, dépliables pour voir chaque test : ✓, ✗ ou « crash ») et « Teams » ;
    - états de section avec `StatusBadge`. `unavailable` affiche un texte neutre : « Pas de sujet sur l'intranet pour ce projet », « Aucun repo lié », « Aucun résultat My Epitech ».
  - **TeamsLinkEditor** :
    - affiche « Ouvrir la conversation » quand un lien existe (`open('teams', url)` seulement si `isTeamsUrl`), plus « Modifier » et « Retirer » ;
    - sinon : champ « Colle le lien de la conversation Teams » et bouton « Enregistrer ». Un lien invalide affiche « Ce lien n'est pas un lien Teams » ;
    - l'enregistrement fait `updateSettings({ projectTeamsLinks: { ...actuels, [key]: url } })` ;
    - à côté se trouve le bouton existant « Partager sur Teams ».
  - **RepoPicker** : il gagne une prop optionnelle `onSelect(fullName: string | null)`. Avec elle, la page projet écrit dans `projectRepoLinks` ; sans elle, le comportement actuel est inchangé.
  - **DeadlineRow** : le clic sur le titre fait `openProject(projectKey(d.moduleCode, d.title))`, et un petit lien « intranet » garde l'accès direct.
  - **CommandPalette** : le type `project` fait `openProject(id.slice('project:'.length))`.

- [ ] **Step 1: Test qui doit échouer**

```ts
test('un seul passage centré', () => expect(scorePoints([run(50)], 200, 100)[0]).toMatchObject({ x: 100, y: 50 }));
test('0 % en bas, 100 % en haut', () => { const p = scorePoints([run(0), run(100)], 200, 100); expect(p[0].y).toBe(100); expect(p[1].y).toBe(0); });
test('valeurs hors bornes ramenées', () => expect(scorePoints([run(140)], 200, 100)[0].y).toBe(0));
test('aucun passage → []', () => expect(scorePoints([], 200, 100)).toEqual([]));
```

- [ ] **Step 2: Lancer** → FAIL ; **Step 3: Implémenter `chart.ts`** ; **Step 4: Lancer** → PASS
- [ ] **Step 5: Implémenter** les pages et les composants.
- [ ] **Step 6: Vérifier** — `npm test`, `npm run typecheck` et `npm run build` → aucune erreur. Lancer `npm run dev` environ 15 s : aucune erreur JS au démarrage.
- [ ] **Step 7: Commit** — `"feat: liste Projets et page projet"`
