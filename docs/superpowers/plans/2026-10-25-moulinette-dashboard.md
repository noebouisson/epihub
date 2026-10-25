# Nouveau My Epitech, tableau de bord et rapports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrancher EpiHub sur le nouveau My Epitech, ajouter un tableau de bord d'avancement et générer localement un rapport à chaque passage de moulinette.

**Architecture:** Un moteur de rapport pur (analyse, Markdown, HTML) se construit sur des types de passage décodés. Le service My Epitech est réécrit : jeton capturé sur les requêtes de la page et nouvelle API. Tout ce qui lisait l'intranet passe sur My Epitech. Un pipeline détecte les nouveaux passages, écrit les rapports et notifie. L'interface ajoute une page Tableau de bord et un lecteur de rapport.

**Tech Stack:** l'existant (Electron 33, React 18, TypeScript 5, Vitest 2), sans nouvelle dépendance.

**Spec:** `docs/superpowers/specs/2026-10-25-moulinette-dashboard-design.md`

## Global Constraints

- **API** : base `https://my.epitech.eu/api`, en-tête `Authorization: Bearer <jeton>`. Les endpoints et les champs sont exactement ceux du §3 de la spec.
- **Jeton** : capturé via `onBeforeSendHeaders` sur `https://my.epitech.eu/api/*` (partition `persist:myepitech`). Il reste en mémoire seulement, n'est jamais lu dans le stockage du site, jamais écrit ni loggé. Renouvellement : fenêtre cachée, attente de 15 s au maximum. Réponse 401 : `invalidate`, puis une seule nouvelle tentative.
- **Rafraîchissement des passages** : à chaque cycle de 5 min pour les projets actifs (fin dans le futur ou depuis moins de 14 jours), toutes les 6 h au plus pour les autres. Concurrence maximale : 4. Une réponse 400 sur `test-results` donne `[]`.
- **Score** : Σ`passed` / Σ`count` des catégories, en %, arrondi ; `null` s'il n'y a aucun test.
- **Verdict** : `reussi` = 100 % sans aucun flag. `echoue` = score < 50 %, ou `deliveryError`/`makeError` non nul, ou présence du flag `no-test-passed`. `partiel` = tous les autres cas.
- **Fichiers** : `<Documents>/EpiHub/rapports/<UNIT>-<projectCode>/<YYYY-MM-DD_HH-mm>-<runId>.md`. Les noms sont nettoyés : seuls `[A-Za-z0-9_-]` sont gardés.
- **Index** : `userData/reports.json`. Les rapports JSON vont dans `userData/reports/<runId>.json`.
- **Premier lancement** : un rapport par projet, pour son dernier passage seulement, sans notification.
- **Interdits** : HTML brut issu des données dans l'interface comme dans le PDF ; jeton, cookie ou commentaire de moulinette dans les logs.
- **Ancien intranet** : `intra` reste un `ServiceId` (onglet). Son état est `ok` avec `data: null`, et EpiHub ne lit plus aucune donnée intranet.
- Interface en français.

## Review Focus

1. **Passage sans aucun test** (`skillBreakdowns` vide) : le score vaut `null` et le verdict `echoue`, sans division par zéro (test en tâche 1).
2. **Commentaire de moulinette contenant `<script>`, des backticks ou des retours à la ligne** : il reste du texte en Markdown (bloc de code sûr) et il est échappé en HTML (tests en tâche 1).
3. **Jeton expiré pendant un cycle** : la réponse 401 déclenche un seul renouvellement, puis `needs-login`, sans boucle infinie (test en tâche 2).
4. **Détail d'un passage en erreur** : aucun rapport partiel n'est indexé, et le pipeline réessaie au cycle suivant (test en tâche 3).
5. **IPC « ouvrir le fichier »** : un `runId` inconnu, ou un chemin indexé hors du dossier des rapports, est refusé (test en tâche 3).

---

## File Structure

| Fichier | Rôle |
|---|---|
| `src/shared/types.ts` | Types `RunSummary`, `RunDetail`, `RunTest`, `Report`, `Verdict`, nouveau `MyEpitechData`, `ReportEntry`, ajouts `EpihubApi` |
| `src/main/reports/analyze.ts` | `scoreOf`, `verdictOf`, `buildReport` (pur) |
| `src/main/reports/markdown.ts` | `renderMarkdown`, `reportPath` (pur) |
| `src/main/reports/html.ts` | `renderHtml` (pur) |
| `src/main/services/myepitechAuth.ts` | Capture et renouvellement du jeton |
| `src/main/services/myepitech.ts` | Client de la nouvelle API (réécrit) |
| `src/main/services/intra.ts` | Service « onglet seulement » |
| `src/main/reports/store.ts` | Index et rapports JSON |
| `src/main/reports/pipeline.ts` | Détection, génération, fichiers, notifications |
| `src/main/reports/pdf.ts` | Export PDF (fenêtre cachée) |
| Adaptations | `effects.ts`, `links/projects.ts`, `app/projectDetails.ts`, `links/searchIndex.ts`, `ipc.ts`, `index.ts`, `preload/index.ts`, renderer |

---

### Task 1: Moteur de rapport (types, analyse, Markdown, HTML)

**Files:**
- Modify: `src/shared/types.ts` (ajouts seulement)
- Create: `src/main/reports/analyze.ts`, `src/main/reports/markdown.ts`, `src/main/reports/html.ts`
- Test: `tests/reports/analyze.test.ts`, `tests/reports/markdown.test.ts`, `tests/reports/html.test.ts`

**Interfaces:**
- Produces (types) :

```ts
export type Verdict = 'reussi' | 'partiel' | 'echoue';
export interface SkillBreakdown { count: number; passed: number; crashed: number; mandatoryFailed: number }
export interface RunStyle { fatal: number; major: number; minor: number; info: number; penalty: number | null }
export interface RunSummary {
  id: string; unitCode: string; projectCode: string; title: string; year: number;
  date: string; commit: string; members: string[]; failureFlags: string[];
  style: RunStyle; coverage: { lines: number | null; branches: number | null };
  categories: Record<string, SkillBreakdown>; repoLink: string | null;
}
export interface RunTest { name: string; passed: boolean; crashed: boolean; skipped: boolean; mandatory: boolean; comment: string }
export interface RunDetail {
  categories: { name: string; tests: RunTest[] }[];
  deliveryError: string | null; makeError: string | null; bannedFunctions: string[];
  coverage: { lines: number | null; branches: number | null };
}
export interface ReportAdvice { priority: 1 | 2 | 3; title: string; text: string; tests: string[] }
export interface Report {
  runId: string; projectTitle: string; unitCode: string; projectCode: string;
  date: string; commit: string; members: string[];
  score: number | null; verdict: Verdict; delta: number | null; summary: string;
  blockers: string[];
  categories: { name: string; passed: number; count: number; crashed: number; mandatoryFailed: number }[];
  failedTests: { category: string; name: string; mandatory: boolean; crashed: boolean; comment: string }[];
  style: RunStyle; coverage: { lines: number | null; branches: number | null };
  advice: ReportAdvice[];
  evolution: { fixed: string[]; broken: string[]; byCategory: boolean } | null;
  working: string[];
}
```

- Produces (fonctions) :
  - `scoreOf(categories: Record<string, SkillBreakdown>): number | null`
  - `verdictOf(summary: RunSummary, detail: RunDetail | null): Verdict`
  - `buildReport(summary: RunSummary, detail: RunDetail, previous?: { summary: RunSummary; detail: RunDetail | null }): Report`
  - `renderMarkdown(r: Report): string`
  - `reportPath(r: Report): { dir: string; file: string }`, avec `dir = <UNIT>-<projectCode>` et `file = <YYYY-MM-DD_HH-mm>-<runId>.md` en heure locale, noms nettoyés
  - `renderHtml(r: Report): string` : document HTML complet, styles inline, tout le texte échappé

Règles de `buildReport` (spec §7.1) :
- **`blockers`**, dans cet ordre :
  - `Erreur de livraison : <texte>` si `deliveryError` ;
  - `Erreur de compilation : <texte>` si `makeError` ;
  - `Fonctions interdites : a, b` si `bannedFunctions` n'est pas vide ;
  - puis chaque flag. `no-test-passed` donne « Aucun test ne passe : le binaire ne compile pas, ne s'appelle pas comme attendu ou ne produit aucune sortie ». Un flag inconnu est affiché tel quel, préfixé « Indicateur moulinette : ».
- **`categories`** : triées par nom.
- **`failedTests`** : tous les tests avec `passed === false && skipped === false`, d'abord les obligatoires et les crashs, puis l'ordre d'origine.
- **`advice`** :
  - P1 :
    - un conseil par blocker ;
    - « Tests obligatoires » (cite les tests) si au moins un obligatoire échoue ;
    - « Crashs » si au moins un crash, avec le texte « Lance ton programme avec valgrind ou compile avec -g3 -fsanitize=address ; vérifie les pointeurs NULL, les dépassements de tableau et les free en double. ».
  - P2 :
    - « Tests de base d'abord » si une catégorie dont le nom contient `base` ou `easy` (hors `format`) est incomplète alors qu'une catégorie `medium` ou `hard` a des tests passés ou à faire ;
    - « Format de sortie » si une catégorie dont le nom contient `format` est incomplète, avec le texte « Compare ta sortie caractère par caractère : espaces, retours à la ligne, sortie d'erreur et code de retour. ».
  - P3 :
    - « Coding style » si `fatal + major > 0` : on traite fatal puis major ;
    - « Couverture » si `coverage.lines !== null && coverage.lines < 50` : ajouter des tests unitaires Criterion.
  - Tri : par priorité, puis par ordre d'ajout.
- **`summary`** :
  - `"<passés> tests sur <total> passent."` ;
  - plus `" Priorité : <titre du premier conseil P1>."` s'il existe ;
  - ou `" Tous les tests passent."` à 100 %.
- **`delta`** : `scoreOf(summary) - scoreOf(previous.summary)` si les deux existent, sinon `null`.
- **`evolution`** :
  - si `previous.detail` existe : `fixed` = noms qui échouaient et passent maintenant, `broken` = l'inverse, `byCategory: false` ;
  - sinon, si seul `previous.summary` existe : comparaison catégorie par catégorie (`"<catégorie> : +N"` dans `fixed`, `"<catégorie> : -N"` dans `broken`), `byCategory: true` ;
  - sans `previous` : `null`.
- **`working`** : catégories avec `passed === count && count > 0`.

Règles de `renderMarkdown` :
- titres `#`, `##` ;
- les commentaires vont dans un bloc de code délimité par une clôture plus longue que la plus longue série de backticks du commentaire (au moins 3) ;
- les autres textes issus des données ont `* _ [ ] < >` échappés.

- [ ] **Step 1: Tests qui doivent échouer**

```ts
// analyze
test('score : somme des catégories', () => expect(scoreOf({ a: cat(10, 7), b: cat(10, 3) })).toBe(50));
test('score : aucun test → null', () => expect(scoreOf({})).toBeNull());
test('verdict réussi', () => expect(verdictOf(sum({ categories: { a: cat(5, 5) } }), det())).toBe('reussi'));
test('verdict : 100 % mais un flag → partiel', () => expect(verdictOf(sum({ categories: { a: cat(5, 5) }, failureFlags: ['x'] }), det())).toBe('partiel'));
test('verdict échoué : < 50 %, no-test-passed, makeError, aucun test', () => {
  expect(verdictOf(sum({ categories: { a: cat(10, 4) } }), det())).toBe('echoue');
  expect(verdictOf(sum({ categories: { a: cat(10, 9) }, failureFlags: ['no-test-passed'] }), det())).toBe('echoue');
  expect(verdictOf(sum({ categories: { a: cat(10, 9) } }), det({ makeError: 'make: *** Error 1' }))).toBe('echoue');
  expect(verdictOf(sum({ categories: {} }), det())).toBe('echoue');
});
test('blockers dans l’ordre et flag inconnu', () => expect(buildReport(sum({ failureFlags: ['no-test-passed', 'weird'] }), det({ deliveryError: 'x', makeError: 'y', bannedFunctions: ['printf'] })).blockers.map((b) => b.split(' :')[0])).toEqual(['Erreur de livraison', 'Erreur de compilation', 'Fonctions interdites', 'Aucun test ne passe', 'Indicateur moulinette']));
test('tests échoués : obligatoires et crashs d’abord, skipped exclus', () => { /* entrée: t1 ko normal, t2 ko obligatoire, t3 crash, t4 skipped → noms ['t2','t3','t1'] */ });
test('conseils P1 crash avec texte valgrind et tests cités', () => { const a = buildReport(s, d).advice.find((x) => x.title === 'Crashs')!; expect(a.priority).toBe(1); expect(a.text).toContain('valgrind'); expect(a.tests).toEqual(['t3']); });
test('conseil format et base-avant-hard', () => { /* catégories '01 - base tests' 3/5, '04 - hard tests' 0/4, '05 - easy format tests' 1/3 → titres contiennent 'Tests de base d’abord' et 'Format de sortie' en P2 */ });
test('style et couverture en P3', () => { /* style fatal 1, coverage.lines 30 → 'Coding style' et 'Couverture' P3 */ });
test('résumé', () => expect(buildReport(s, d).summary).toBe('18 tests sur 29 passent. Priorité : Tests obligatoires.'));
test('évolution par test', () => { /* précédent: a ko, b ok ; actuel: a ok, b ko → fixed ['a'], broken ['b'], byCategory false */ });
test('évolution par catégorie sans détail précédent', () => { /* cat x 2/5 → 4/5 : fixed ['x : +2'] byCategory true */ });
test('delta', () => expect(buildReport(sum({ categories: { a: cat(10, 6) } }), det(), { summary: sum({ categories: { a: cat(10, 4) } }), detail: null }).delta).toBe(20));

// markdown
test('le commentaire reste du code, même avec des backticks', () => { const md = renderMarkdown(rep({ failedTests: [ft({ comment: 'got ``` <script>alert(1)</script>' })] })); expect(md).toContain('````'); expect(md).toContain('<script>alert(1)</script>'); /* à l’intérieur du bloc */ });
test('texte des données échappé hors blocs', () => expect(renderMarkdown(rep({ projectTitle: 'a_b *c* <d>' }))).toContain('a\\_b \\*c\\* \\<d\\>'));
test('reportPath nettoyé et horodaté', () => expect(reportPath(rep({ unitCode: 'G-CPE-101', projectCode: 'my printf/..', date: '2026-10-20T08:05:00', runId: '42' }))).toEqual({ dir: 'G-CPE-101-myprintf', file: '2026-10-20_08-05-42.md' }));
test('le Markdown contient les sections', () => { const md = renderMarkdown(full); for (const h of ['## Résumé', '## Pourquoi', '## Comment s’améliorer', '## Évolution', '## Ce qui marche']) expect(md).toContain(h); });

// html
test('HTML échappé', () => { const h = renderHtml(rep({ failedTests: [ft({ comment: '<script>x</script>' })] })); expect(h).not.toContain('<script>x'); expect(h).toContain('&lt;script&gt;x'); });
test('document complet', () => expect(renderHtml(full)).toMatch(/^<!doctype html>/i));
```

- [ ] **Step 2: Lancer** → FAIL ; **Step 3: Implémenter** ; **Step 4: Lancer** → PASS ; `npm test` et `npm run typecheck` → aucune erreur.
- [ ] **Step 5: Commit** — `"feat: moteur de rapport de moulinette (analyse, Markdown, HTML)"`

---

### Task 2: Nouveau My Epitech (jeton, client, bascule des données)

**Files:**
- Create: `src/main/services/myepitechAuth.ts`, `tests/fixtures/myepitech2/{profile,projects-p1,projects-p2,test-results,run-detail,history}.json`
- Rewrite: `src/main/services/myepitech.ts` ; Delete: `src/main/myepitechToken.ts` et les anciennes fixtures et tests My Epitech devenus inutiles
- Modify: `src/shared/types.ts` (`MyEpitechData`, `ServiceDataMap.intra = null`, `ProjectSummary.lastResult` → `RunSummary | null`, suppression de `TestResult`), `src/main/services/intra.ts`, `src/main/app/effects.ts`, `src/main/links/projects.ts`, `src/main/app/projectDetails.ts`, `src/main/links/searchIndex.ts`, `src/main/index.ts`, `src/main/ipc.ts`, et le renderer au minimum pour compiler (`Home.tsx` : carte profil depuis `myepitech.profile` ; `Projects.tsx` et `Project.tsx` : score via `lastResult`)
- Test: `tests/services/myepitechAuth.test.ts`, `tests/services/myepitech.test.ts` (réécrit), tests existants adaptés (`effects`, `projects`, `projectDetails`, `searchIndex`, `intra`)

**Interfaces:**
- Consumes: `RunSummary`, `RunDetail`, `scoreOf` (tâche 1).
- Produces :
  - Types :

```ts
export interface MyProject { id: string; name: string; unitCode: string; unitName: string; description: string; start: string; end: string; url: string }
export interface MyProfile { login: string; name: string; promotion: number | null; semester: number | null; gpa: string | null; cursus: string | null }
export interface MyEpitechData { profile: MyProfile; projects: MyProject[]; runs: Record<string, RunSummary[]> }
```

  - `createMyEpitechAuth(deps: { onRequestHeaders(listener: (url: string, headers: Record<string, string>) => void): void; openHiddenPage(): Promise<() => void>; now(): number; waitMs?: number }): { getToken(): Promise<string | null>; invalidate(): void }` : `waitMs` vaut 15000 par défaut. Le jeton est mémorisé seulement pour les URL `https://my.epitech.eu/api/`. Un JWT dont `exp` est dépassé compte comme absent. Les appels `getToken` concurrents partagent un seul renouvellement.
  - Exports de décodage purs :
    - `decodeProfile(raw)` ;
    - `decodeProject(raw)`, avec `url = https://my.epitech.eu/` si aucune URL de projet n'est constructible ;
    - `decodeRunSummary(raw)`, où `penalty` = `codingStyle.penalty?.Penalty?.value ?? null` et la couverture vient de `linePercentage` / `branchPercentage` ;
    - `decodeRunDetail(raw)`, où `deliveryError` / `makeError` valent la chaîne, ou `JSON.stringify(objet)`, ou `null`, `bannedFunctions` = noms trouvés (tableau de chaînes ou clés d'objet), et la couverture = `coveredLines / totalLines * 100` arrondi.
    - Un format inattendu lève `Error('Format My Epitech inattendu')`.
  - `createMyEpitechService(deps: { fetch: FetchLike; auth: { getToken(): Promise<string | null>; invalidate(): void }; now(): number }): Service<'myepitech'> & { runDetail(runId: string): Promise<RunDetail>; history(year: number, unitCode: string, projectCode: string): Promise<RunSummary[]> }`
    - `refresh()` récupère le profil et toutes les pages de projets, et garde `isUserRegistered`.
    - Il récupère ensuite les passages selon la règle actif / 6 h (cache interne par projet), avec une concurrence de 4. Une réponse 400 donne `[]`. Les passages sont triés du plus récent au plus ancien.
    - Pas de jeton : `NeedsLoginError`. Réponse 401 : `invalidate`, puis une seule nouvelle tentative, puis `NeedsLoginError`.
  - Le service `intra` renvoie `null` (état `ok`) sans aucun appel réseau.
  - `effects` : les rendus viennent de `myepitech.projects` dont `end > now`, avec `Deadline = { id: 'mye-' + id, moduleCode: unitCode, projectCode: normalize(name), title: name, end, url }`. Les notifications intranet disparaissent.
  - `buildProjects` : la source « intranet » est remplacée par les projets My Epitech (une `deadline` seulement si `end > now`, sinon `null`, et le statut suit). `lastResult` = premier passage de `runs[id]`. Les alias incluent `projectKey(unitCode, run.projectCode)`. Les passages sans projet inscrit sont ignorés.
  - `projectDetails` :
    - Sujet = `{ description: project.description, files: [] }`, sans appel réseau ; `unavailable` si la description est vide.
    - Résultats : `runs` = passages du projet convertis en `TestRun` (`percent = scoreOf ?? 0`) et triés par date croissante. `latest` = `runDetail(premier.id)` converti en `SkillReport[]`, best-effort comme aujourd'hui.
    - `ProjectSummary` gagne `projectId: string | null`.
  - Câblage dans `index.ts` :
    - `onRequestHeaders` = `session.fromPartition('persist:myepitech').webRequest.onBeforeSendHeaders({ urls: ['https://my.epitech.eu/api/*'] }, …)`, en appelant toujours `callback({ requestHeaders })` ;
    - `openHiddenPage` = `BrowserWindow` cachée (`sandbox`, sans preload, popups refusées) chargée sur `https://my.epitech.eu/`, détruite par la fonction renvoyée.

- [ ] **Step 1: Fixtures** à partir de la structure de la spec §3 (données neutres : octocat, jane.doe). Elles comprennent un projet non inscrit, 2 pages de projets, un passage avec flag `no-test-passed` et un détail avec un test `crashed` et un `mandatory`.
- [ ] **Step 2: Tests qui doivent échouer**

```ts
// auth
test('mémorise le jeton des requêtes API seulement', async () => { emit('https://my.epitech.eu/api/x', { Authorization: 'Bearer ' + jwt(+3600) }); emit('https://evil.com/api', { Authorization: 'Bearer other' }); expect(await auth.getToken()).toBe(jwt(+3600)); });
test('jeton expiré → renouvellement par page cachée', async () => { emit(API, bearer(jwt(-10))); openHidden.mockImplementation(async () => { emit(API, bearer(jwt(+3600))); return close }); expect(await auth.getToken()).toBe(jwt(+3600)); expect(close).toHaveBeenCalled(); });
test('aucun jeton après 15 s → null', async () => { vi.useFakeTimers(); const p = auth.getToken(); await vi.advanceTimersByTimeAsync(15000); expect(await p).toBeNull(); });
test('appels concurrents → un seul renouvellement', async () => { await Promise.all([auth.getToken(), auth.getToken()]); expect(openHidden).toHaveBeenCalledTimes(1); });
// service
test('profil, projets paginés, seulement inscrits', async () => { const d = await svc.refresh(); expect(d.projects.map((p) => p.id)).toEqual(['101', '205']); expect(d.profile).toMatchObject({ login: 'jane.doe@epitech.eu', promotion: 2030 }); });
test('passages décodés et triés, 400 → []', async () => { const d = await svc.refresh(); expect(d.runs['101'][0]).toMatchObject({ id: '9001', unitCode: 'G-CPE-101', projectCode: 'myprintf', failureFlags: ['no-test-passed'] }); expect(d.runs['205']).toEqual([]); });
test('401 → invalidate, une nouvelle tentative, puis NeedsLoginError', async () => { always401(); await expect(svc.refresh()).rejects.toBeInstanceOf(NeedsLoginError); expect(auth.invalidate).toHaveBeenCalledTimes(1); });
test('pas de jeton → NeedsLoginError', async () => { auth.getToken.mockResolvedValue(null); await expect(svc.refresh()).rejects.toBeInstanceOf(NeedsLoginError); });
test('projets inactifs : passages refaits au plus toutes les 6 h', async () => { /* 2 refresh à 1 h d’écart → test-results du projet terminé il y a 30 j appelé une fois ; à +6 h → deux fois */ });
test('runDetail décodé', async () => { const d = await svc.runDetail('9001'); expect(d.categories[0].tests.some((t) => t.crashed)).toBe(true); expect(d.coverage.lines).toBe(40); });
test('format inattendu → erreur claire', async () => { serveGarbage(); await expect(svc.runDetail('1')).rejects.toThrow('Format My Epitech inattendu'); });
// bascule
test('intra : null sans réseau', async () => { expect(await createIntraService().refresh()).toBeNull(); });
test('rendus depuis My Epitech', () => { /* projet end futur → Deadline id 'mye-101', moduleCode 'G-CPE-101' ; projet terminé → absent */ });
test('buildProjects depuis My Epitech, alias projectCode', () => { /* projet 'My printf' + passage projectCode 'myprintf' → un projet, lastResult = passage, aliases contient 'G-CPE-101/myprintf' */ });
test('projectDetails : sujet = description, sans réseau', async () => { /* ... */ });
```

- [ ] **Step 3: Lancer** → FAIL ; **Step 4: Implémenter**, en supprimant tout le code mort (anciens jeton et API, lecture intranet) ; **Step 5: Lancer** → PASS. Puis `npm test`, `npm run typecheck` et `npm run build` → aucune erreur.
- [ ] **Step 6: Commit** — `"feat: bascule sur le nouveau My Epitech (jeton capturé, nouvelle API)"`

---

### Task 3: Pipeline des rapports, stockage, PDF et IPC

**Files:**
- Create: `src/main/reports/store.ts`, `src/main/reports/pipeline.ts`, `src/main/reports/pdf.ts`
- Modify: `src/main/index.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/shared/types.ts` (`ReportEntry`, `EpihubApi`)
- Test: `tests/reports/store.test.ts`, `tests/reports/pipeline.test.ts`, `tests/reports/ipcGuards.test.ts`

**Interfaces:**
- Consumes: `buildReport`, `renderMarkdown`, `reportPath`, `renderHtml` (tâche 1) ; `myepitech.runDetail`, `MyEpitechData`, `projectKey` (tâche 2).
- Produces :
  - Type `ReportEntry = { runId: string; projectKey: string; projectId: string; file: string | null; score: number | null; verdict: Verdict; date: string; generatedAt: number }`.
  - `createReportStore(dir: string /* userData */)` renvoie :
    - `has(runId)`, `get(runId): ReportEntry | null`, `list(projectKey): ReportEntry[]` (par date décroissante) ;
    - `save(entry: ReportEntry, report: Report): void`, qui écrit `reports/<runId>.json` puis l'index ;
    - `report(runId): Report | null` ;
    - `isInitialized()` / `markInitialized()`.
    - Un index corrompu donne un index vide (sans plantage).
  - `createReportPipeline(deps: { runDetail(id: string): Promise<RunDetail>; store; docsDir: string; writeFile(path: string, data: string): Promise<void>; mkdir(path: string): Promise<void>; notify(title: string, body: string, projectKey: string): void; projectKeyOf(p: MyProject): string })` renvoie `{ process(data: MyEpitechData): Promise<void> }`. Pour chaque projet dont le premier passage n'a pas d'entrée :
    - récupérer le détail du passage et celui du précédent (best-effort) ;
    - calculer `buildReport` ;
    - écrire le `.md` dans `docsDir/EpiHub/rapports/<dir>/<file>` : en cas d'échec, `file: null` et nouvel essai d'écriture au cycle suivant ;
    - `store.save` ;
    - notifier `"<titre> : <score> % (<±Δ>)"` / `"Rapport prêt"`, sauf si `!store.isInitialized()`.
    - En fin de premier `process` réussi : `markInitialized()`.
    - Un détail en erreur : rien n'est sauvé pour ce passage, et les autres projets continuent.
    - Deux `process` concurrents ne génèrent pas de doublon (verrou interne).
  - `isInsideDir(file: string, dir: string): boolean` (pur, avec `path.resolve`) : utilisé pour l'ouverture et l'export.
  - `exportPdf(report: Report, outFile: string): Promise<void>` : `BrowserWindow` cachée (`sandbox`, sans preload, `javascript: false`), `loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(renderHtml(r)))`, `printToPDF`, écriture, destruction.
  - IPC, tous via `handle()`, avec des arguments validés :
    - `epihub:reports(projectKey: string)` → `ReportEntry[]` ;
    - `epihub:report(runId: string)` → `Report | null` (`runId` doit correspondre à `/^\d+$/`) ;
    - `epihub:openReportFile(runId)` → `shell.openPath` seulement si l'entrée existe, que `file` n'est pas null et que `isInsideDir(file, rapportsDir)` ; renvoie `boolean` ;
    - `epihub:exportReportPdf(runId)` → chemin du PDF (à côté du `.md`, ou dans le dossier du projet), puis `shell.showItemInFolder`.
  - Preload / `EpihubApi` : `reports(projectKey)`, `report(runId)`, `openReportFile(runId)`, `exportReportPdf(runId)`.
  - Câblage : `pipeline.process(myepitech.data)` après chaque rafraîchissement My Epitech réussi (dans le chemin `afterRefresh`, sans bloquer l'interface). Le clic sur la notification ouvre la page du projet (`epihub:open` avec `{ service: 'app', url: 'project:' + key }` ; le renderer gère ce préfixe dans la tâche 4).

- [ ] **Step 1: Tests qui doivent échouer**

```ts
test('nouveau passage → rapport, fichier, entrée, notification', async () => { await pipe.process(data); expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('/EpiHub/rapports/G-CPE-101-myprintf/'), expect.stringContaining('## Pourquoi')); expect(store.has('9001')).toBe(true); expect(notify).toHaveBeenCalledWith('My printf : 62 % (+12)', 'Rapport prêt', 'G-CPE-101/myprintf'); });
test('premier lancement : pas de notification, puis initialisé', async () => { freshStore(); await pipe.process(data); expect(notify).not.toHaveBeenCalled(); expect(store.isInitialized()).toBe(true); });
test('pas de doublon', async () => { await pipe.process(data); await pipe.process(data); expect(runDetail).toHaveBeenCalledTimes(2 /* actuel + précédent, une seule fois */); });
test('détail en erreur → rien d’indexé, réessayé ensuite', async () => { runDetail.mockRejectedValueOnce(new Error('x')); await pipe.process(data); expect(store.has('9001')).toBe(false); await pipe.process(data); expect(store.has('9001')).toBe(true); });
test('écriture en échec → entrée avec file null, réécrite au cycle suivant', async () => { /* ... */ });
test('process concurrents : une seule génération', async () => { await Promise.all([pipe.process(data), pipe.process(data)]); expect(store.list('G-CPE-101/myprintf')).toHaveLength(1); });
test('store : index corrompu → vide', () => { writeFileSync(join(dir, 'reports.json'), '{x'); expect(createReportStore(dir).list('a')).toEqual([]); });
test('isInsideDir', () => { expect(isInsideDir('/d/r/a.md', '/d/r')).toBe(true); expect(isInsideDir('/d/r/../x.md', '/d/r')).toBe(false); expect(isInsideDir('/d/rapports2/a.md', '/d/rapports')).toBe(false); });
test('runId non numérique refusé', () => expect(validRunId('../1')).toBe(false));
```

- [ ] **Step 2: Lancer** → FAIL ; **Step 3: Implémenter** ; **Step 4: Lancer** → PASS ; `npm test`, `npm run typecheck` et `npm run build` → aucune erreur.
- [ ] **Step 5: Commit** — `"feat: génération automatique des rapports de moulinette"`

---

### Task 4: Interface : tableau de bord et lecteur de rapport

**Files:**
- Create: `src/renderer/src/pages/Dashboard.tsx`, `src/renderer/src/components/ReportView.tsx`, `src/renderer/src/components/ProjectCard.tsx`, `src/renderer/src/dashboard.ts`
- Modify: `src/renderer/src/services.ts` (View `'dashboard'`, vue par défaut), `App.tsx` (vue par défaut et préfixe `project:` dans `onOpen`), `Sidebar.tsx` (entrée en premier), `pages/Project.tsx` (carte « Moulinette »), `pages/Home.tsx` (carte profil), `styles/app.css`
- Test: `tests/renderer/dashboard.test.ts`

**Interfaces:**
- Consumes: `window.epihub.projects()`, `project(key)`, `reports(key)`, `report(runId)`, `openReportFile`, `exportReportPdf`, `snapshot()` ; `ProjectSummary` (avec `lastResult: RunSummary | null`, `projectId`).
- Produces (`dashboard.ts`, pur) :
  - `progressOf(start: string, end: string, now: Date): { ratio: number; label: string }` : `ratio` est borné à [0, 1]. Le libellé vaut `J-<n>` avant la fin, `Aujourd'hui` le jour même, `Terminé` après, `Commence dans <n> j` avant le début.
  - `mainProblem(r: RunSummary): string`. On prend la première règle qui s'applique :
    1. `"Aucun test ne passe"` si le flag `no-test-passed` est présent ;
    2. `"<n> test(s) obligatoire(s) échoué(s)"` d'après la somme des `mandatoryFailed` ;
    3. `"<n> crash(s)"` ;
    4. `"<n> tests échoués"` ;
    5. `"Tous les tests passent"`.
  - `dashboardSummary(projects: ProjectSummary[], now: Date): { inProgress: number; failing: number; average: number | null; next: ProjectSummary | null }`, où `failing` compte les projets dont le dernier passage a le verdict `echoue` (avec `verdictOf(r, null)`, repris dans `src/shared` si besoin, sans dupliquer la logique).
- **Tableau de bord** (contenu de la spec §8) :
  - bandeau de 4 chiffres ;
  - cartes `ProjectCard` : nom, module, barre `progressOf`, score, pastille `Réussi` / `Partiel` / `Échoué` / `Pas encore testé`, flèche Δ (score du premier passage moins celui du second, si les deux existent), `mainProblem`, style « F n · M n », bouton « Voir le rapport » qui fait `openProject(key)` avec l'ancre `rapport` ;
  - tri : en cours par échéance, puis terminés par date du dernier passage ;
  - My Epitech `needs-login` : « Connecte-toi à My Epitech pour voir tes projets » et bouton « Ouvrir My Epitech ».
- **Carte « Moulinette »** de la page projet :
  - courbe existante ;
  - `ReportView` du dernier rapport (`reports(key)[0]` puis `report(runId)`) ;
  - liste « Rapports précédents » (date, score, verdict), où un clic affiche le rapport choisi ;
  - boutons « Ouvrir le fichier » (désactivé si `file` est null) et « Exporter en PDF » (toast avec le chemin) ;
  - aucun rapport : « Pas encore de rapport — il sera généré au prochain passage de la moulinette ».
- **`ReportView`** : sections Résumé, Pourquoi (blockers, tableau des catégories, tests échoués avec commentaire dans un `<pre>` texte), Comment s'améliorer (groupé par priorité, tests cités), Évolution, Ce qui marche. Uniquement du texte React.
- **Carte « Profil Epitech »** de l'accueil : `myepitech.profile` (promo, semestre, GPA, cursus).

- [ ] **Step 1: Tests qui doivent échouer**

```ts
test('progression et libellés', () => { expect(progressOf('2026-10-01', '2026-10-31', new Date('2026-10-16T12:00:00'))).toMatchObject({ label: 'J-15' }); expect(progressOf('2026-10-01', '2026-10-10', now).label).toBe('Terminé'); expect(progressOf('2026-11-01', '2026-11-30', now).label).toBe('Commence dans 7 j'); });
test('ratio borné', () => { expect(progressOf('2026-10-01', '2026-10-10', now).ratio).toBe(1); expect(progressOf('2026-11-01', '2026-11-30', now).ratio).toBe(0); });
test('problème principal par priorité', () => { expect(mainProblem(run({ failureFlags: ['no-test-passed'] }))).toBe('Aucun test ne passe'); expect(mainProblem(run({ categories: { a: { count: 5, passed: 3, crashed: 1, mandatoryFailed: 2 } } }))).toBe('2 tests obligatoires échoués'); expect(mainProblem(run({ categories: { a: { count: 5, passed: 5, crashed: 0, mandatoryFailed: 0 } } }))).toBe('Tous les tests passent'); });
test('bandeau', () => expect(dashboardSummary([enCoursOk, enCoursEchoue, termine], now)).toMatchObject({ inProgress: 2, failing: 1 }));
```

- [ ] **Step 2: Lancer** → FAIL ; **Step 3: Implémenter `dashboard.ts`** ; **Step 4: Lancer** → PASS
- [ ] **Step 5: Implémenter** les pages et les composants.
- [ ] **Step 6: Vérifier** — `npm test`, `npm run typecheck` et `npm run build` → aucune erreur. Lancer `npm run dev` environ 15 s : aucune erreur JS.
- [ ] **Step 7: Commit** — `"feat: tableau de bord et lecteur de rapport de moulinette"`
