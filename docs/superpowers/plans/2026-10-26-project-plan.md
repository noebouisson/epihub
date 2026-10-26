# Marche à suivre et pistes d'amélioration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pour chaque projet en cours, importer le sujet PDF, en tirer une marche à suivre datée avec des cases à cocher, et afficher des pistes d'amélioration (moulinette, repo, temps).

**Architecture:** Des modules purs (analyse du sujet, plan, avancement, pistes, Markdown) portent toute la logique. Le processus principal extrait le texte du PDF avec pdfjs, stocke sujets et avancement, contrôle le repo via l'API GitHub et expose l'IPC. Le renderer ajoute une carte « Marche à suivre » et l'étape en cours sur le tableau de bord.

**Tech Stack:** l'existant, plus `pdfjs-dist` (dépendance de production externalisée du bundle main).

**Spec:** `docs/superpowers/specs/2026-10-26-project-plan-design.md`. Les §4 à §7 donnent les règles exactes : y renvoyer, ne pas les réinventer.

## Global Constraints

- Analyse 100 % locale, sans IA. Le texte du PDF n'est jamais interprété comme du HTML ou du code, et n'apparaît jamais dans les logs.
- Projets concernés : en cours, c'est-à-dire avec une fin dans le futur.
- Limites PDF : 20 Mo et 80 pages ; `isEvalSupported: false`.
- Stockage :
  - `userData/subjects/<clé nettoyée>.{pdf,json}` ;
  - `userData/plans.json`, écrit de façon atomique (tmp + rename) ;
  - export dans `<Documents>/EpiHub/plans/<UNIT>-<projet>.md`.
  - Les clés sont nettoyées en `[A-Za-z0-9_-]`, et chaque chemin est vérifié comme étant bien dans son dossier.
- Identifiants d'étape et d'item stables (spec §5). Regex de validation d'un `itemId` : `^[a-z:#0-9_-]+$`.
- Poids des dates (spec §5) : `setup 1`, `base 2`, option `1.5`, `features 3`, `errors 1`, `tests 1.5`, `finish 0.5`, `bonus 1`. La fenêtre va de `max(start, now)` à `end − 1 jour`, en jours locaux.
- Seuils des pistes (spec §7) : aucun push depuis ≥ 3 jours avec un rendu dans ≤ 14 jours ; cache repo de 10 min.
- Interface en français, rendue en texte React uniquement.

## Review Focus

1. **PDF sans texte, ou PDF chiffré ou corrompu** : on affiche un message clair (« Ce PDF ne contient pas de texte lisible » ou « PDF illisible »), rien n'est stocké et l'app ne plante pas (test en tâche 3).
2. **Sujet atypique** (aucun des champs attendus) : le plan reste utilisable (étapes génériques plus `features`), et `missing` liste ce qui manque (tests en tâches 1 et 2).
3. **Rendu dans moins d'un jour, ou date déjà passée** : `target: null` ou des dates cohérentes, sans dates inversées ni `NaN` (test en tâche 2).
4. **Réimport d'un sujet différent** : les cases cochées dont l'item n'existe plus sont ignorées, sans plantage (test en tâche 3).
5. **Clé de projet ou `itemId` forgés via l'IPC** (`../`, clé d'un projet terminé ou inconnu) : refusés (test en tâche 3).

---

### Task 1: Analyse du sujet (`parseSubject`)

**Files:**
- Create: `src/main/plan/subject.ts`, `tests/plan/subject.test.ts`, `tests/fixtures/subjects/my_ls_en.txt`, `tests/fixtures/subjects/extrait_fr.txt`
- Modify: `src/shared/types.ts` (ajout de `SubjectInfo`)

**Interfaces:**
- Produces : `SubjectInfo` (spec §4, à l'identique) ; `parseSubject(text: string): SubjectInfo`.

Fixtures : textes d'exemple rédigés dans le style Epitech, qui ne reprennent aucun sujet réel.
- `my_ls_en.txt` contient :
  - « Binary name: my_ls » ;
  - « Repository name: B-PSU-100-my_ls » ;
  - « Language: C » ;
  - « Compilation: via Makefile, including re, clean and fclean rules » ;
  - « Authorized functions: opendir, readdir, closedir, stat, lstat, write, malloc, free, getpwuid, getgrgid, time, ctime, readlink, perror, strerror, exit » ;
  - des lignes d'options `-a`, `-l`, `-R`, `-d`, `-r`, `-t` avec leur description ;
  - « Your program must ... », « If an error occurs, the program must exit with 84 » ;
  - « You may use unit tests (criterion) with a tests_run rule » ;
  - une phrase « printf is forbidden » ;
  - 2 blocs d'exemple avec un prompt `∼/B-PSU-100> ./my_ls -l` ;
  - une section « Bonus » de 3 lignes.
- `extrait_fr.txt` contient « Nom du binaire : my_sudo », « Langage : C », « Fonctions autorisées : ... », une phrase « doit retourner 84 » et aucune option.

- [ ] **Step 1: Tests qui doivent échouer**

```ts
const en = parseSubject(read('my_ls_en.txt'));
test('champs clé', () => expect(en).toMatchObject({ binaryName: 'my_ls', language: 'C', repoName: 'B-PSU-100-my_ls' }));
test('règles Makefile', () => expect(en.makefileRules).toEqual(['re', 'clean', 'fclean']));
test('fonctions autorisées sur plusieurs lignes', () => { expect(en.authorizedFunctions).toContain('opendir'); expect(en.authorizedFunctions).toContain('exit'); expect(en.authorizedFunctions).toHaveLength(16); });
test('fonctions interdites', () => expect(en.forbidden).toEqual(['printf']));
test('options dans l’ordre, avec description', () => { expect(en.options.map((o) => o.flag)).toEqual(['-a', '-l', '-R', '-d', '-r', '-t']); expect(en.options[1].description.length).toBeGreaterThan(5); });
test('84, tests unitaires, exemples, bonus', () => { expect(en.errorCode84).toBe(true); expect(en.unitTests).toBe(true); expect(en.examples).toHaveLength(2); expect(en.bonus).toHaveLength(3); });
test('exigences « must »', () => expect(en.requirements.some((r) => /must/i.test(r))).toBe(true));
test('français', () => { const fr = parseSubject(read('extrait_fr.txt')); expect(fr).toMatchObject({ binaryName: 'my_sudo', language: 'C', errorCode84: true }); expect(fr.options).toEqual([]); expect(fr.missing).toContain('Nom du dépôt non trouvé'); });
test('texte vide → tout manquant, sans plantage', () => { const e = parseSubject(''); expect(e.binaryName).toBeNull(); expect(e.missing.length).toBeGreaterThanOrEqual(4); });
test('le texte reste brut', () => expect(parseSubject('Binary name: <script>x</script>').binaryName).toBe('<script>x</script>'));
```

- [ ] **Step 2: Lancer** → FAIL ; **Step 3: Implémenter** (règles de la spec §4) ; **Step 4: Lancer** → PASS ; `npm test` et `npm run typecheck` → aucune erreur.
- [ ] **Step 5: Commit** — `"feat: analyse locale des sujets Epitech"`

---

### Task 2: Marche à suivre, avancement, pistes, Markdown

**Files:**
- Create: `src/main/plan/plan.ts`, `src/main/plan/improvements.ts`, `src/main/plan/markdown.ts`, `tests/plan/{plan,improvements,markdown}.test.ts`
- Modify: `src/shared/types.ts` (ajout de `PlanItem`, `PlanStep`, `PlanStatus`, `Improvement`, `RepoCheck`)

**Interfaces:**
- Consumes : `SubjectInfo` (tâche 1) ; `Report` et `ReportAdvice` (existants).
- Produces :
  - `buildPlan(info: SubjectInfo, w: { start: string | null; end: string | null; now: Date }): PlanStep[]` (spec §5) ;
  - `planStatus(steps: PlanStep[], done: string[], now: Date): { progress: number; current: PlanStep | null; late: PlanStep[] }` (spec §6) ;
  - `RepoCheck = { lastPush: string | null; hasMakefile: boolean; forbiddenFiles: string[]; hasTests: boolean }` ;
  - `evaluateRepo(entries: { name: string; type: 'file' | 'dir' }[], pushedAt: string | null, binaryName: string | null): RepoCheck` ;
  - `improvements(i: { info: SubjectInfo | null; steps: PlanStep[]; done: string[]; report: Report | null; repo: RepoCheck | null | 'not-linked'; end: string | null; now: Date }): Improvement[]` (spec §7, ordre et textes exacts) ;
  - `renderPlanMarkdown(v: { title: string; unitCode: string; info: SubjectInfo; steps: PlanStep[]; done: string[]; improvements: Improvement[]; now: Date }): string`, avec un titre et les sections « Ce que le sujet demande », « Marche à suivre » (cases `- [x]` / `- [ ]`) et « Pistes d'amélioration ». Le texte du sujet est échappé comme dans `src/main/reports/markdown.ts` : réutiliser son helper d'échappement, en l'exportant si besoin.

- [ ] **Step 1: Tests qui doivent échouer**

```ts
const now = new Date('2026-10-26T10:00:00');
test('étapes du sujet my_ls dans l’ordre', () => expect(buildPlan(en, { start: '2026-10-20', end: '2026-11-06T18:42:00Z', now }).map((s) => s.id)).toEqual(['setup', 'base', 'option:-a', 'option:-l', 'option:-R', 'option:-d', 'option:-r', 'option:-t', 'errors', 'tests', 'finish', 'bonus']));
test('ids d’items stables', () => expect(buildPlan(en, w).find((s) => s.id === 'setup')!.items[0].id).toBe('setup#0'));
test('dates : croissantes, dernière = fin − 1 jour', () => { const t = buildPlan(en, w).map((s) => s.target!); expect([...t].sort()).toEqual(t); expect(t[t.length - 1]).toBe('2026-11-05'); });
test('fin passée ou absente → dates nulles', () => { expect(buildPlan(en, { start: null, end: '2026-10-01', now }).every((s) => s.target === null)).toBe(true); expect(buildPlan(en, { start: null, end: null, now }).every((s) => s.target === null)).toBe(true); });
test('rendu dans moins d’un jour → pas de NaN, dates ≤ fin', () => { const t = buildPlan(en, { start: null, end: '2026-10-26T20:00:00', now }).map((s) => s.target); expect(t.every((x) => x === null || /^\d{4}-\d{2}-\d{2}$/.test(x))).toBe(true); });
test('sans options → étape features', () => expect(buildPlan(fr, w).map((s) => s.id)).toContain('features'));
test('sujet vide → plan générique utilisable', () => expect(buildPlan(parseSubject(''), w).map((s) => s.id)).toEqual(['setup', 'base', 'features', 'errors', 'tests', 'finish']));
test('avancement', () => { const s = buildPlan(en, w); const all = s.flatMap((x) => x.items.map((i) => i.id)); const st = planStatus(s, s[0].items.map((i) => i.id), now); expect(st.current!.id).toBe('base'); expect(st.progress).toBe(Math.round((s[0].items.length / all.length) * 100)); });
test('retards', () => { /* now après la date de 'base' non finie → late contient base */ });
test('evaluateRepo', () => expect(evaluateRepo([{ name: 'Makefile', type: 'file' }, { name: 'main.o', type: 'file' }, { name: 'my_ls', type: 'file' }, { name: 'src', type: 'dir' }], '2026-10-20T00:00:00Z', 'my_ls')).toEqual({ lastPush: '2026-10-20T00:00:00Z', hasMakefile: true, forbiddenFiles: ['main.o', 'my_ls'], hasTests: false }));
test('pistes : chaque règle et tri', () => { /* repo sans Makefile → P1 repo ; .o → P1 ; push il y a 6 j avec rendu dans 11 j → P2 ; unitTests sans tests → P2 ; étape en retard → P2 temps ; bonus commencé avant fin → P3 ; rapport avec conseil P1 → P1 moulinette ; ordre: P1 moulinette, P1 repo…, P2…, P3 */ });
test('pas de sujet → P1 « Ajoute le sujet (PDF) pour obtenir la marche à suivre »', () => expect(improvements({ ...base, info: null }).at(0)).toMatchObject({ priority: 1, source: 'temps', text: 'Ajoute le sujet (PDF) pour obtenir la marche à suivre' }));
test('repo non lié → P3', () => expect(improvements({ ...base, repo: 'not-linked' }).some((i) => i.source === 'repo' && i.priority === 3)).toBe(true));
test('markdown : cases et texte échappé', () => { const md = renderPlanMarkdown(v); expect(md).toContain('- [x]'); expect(md).toContain('## Marche à suivre'); });
```

- [ ] **Step 2: Lancer** → FAIL ; **Step 3: Implémenter** ; **Step 4: Lancer** → PASS ; `npm test` et `npm run typecheck` → aucune erreur.
- [ ] **Step 5: Commit** — `"feat: marche à suivre datée et pistes d'amélioration"`

---

### Task 3: Import PDF, stockage, contrôle du repo, IPC

**Files:**
- Create: `src/main/plan/pdfText.ts`, `src/main/plan/store.ts`, `src/main/plan/assemble.ts`, `tests/plan/{pdfText,store,assemble}.test.ts`, `tests/fixtures/subjects/sample.pdf` (petit PDF texte généré par le test ou commité), `tests/fixtures/subjects/blank.pdf`
- Modify: `package.json` (`pdfjs-dist` en `dependencies`, version exacte publiée depuis au moins deux semaines), `electron.vite.config.ts` si nécessaire (pdfjs externalisé et non bundlé), `src/main/services/github.ts` (`rootContents`), `src/main/ipc.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/shared/types.ts` (`EpihubApi`, `PlanView`, `PlanSummary`)

**Interfaces:**
- Produces :
  - `extractPdfText(buffer: Uint8Array): Promise<string>`. Lève `Error('PDF illisible')`, `Error('Ce PDF ne contient pas de texte lisible')` (moins de 20 caractères utiles), `Error('PDF trop gros')` (> 20 Mo) ou `Error('PDF trop long')` (> 80 pages). Lignes reconstruites par position verticale, avec `isEvalSupported: false`.
  - `createPlanStore(userData: string)` renvoie :
    - `getSubject(key)` : `{ projectKey, fileName, importedAt, text, info } | null` ;
    - `saveSubject(key, fileName, pdf: Uint8Array, text, info)` ;
    - `removeSubject(key)` ;
    - `done(key): string[]` ;
    - `toggle(key, itemId, on: boolean): string[]`.
    - Écritures atomiques ; clé nettoyée ; JSON corrompu → vide.
  - `github.rootContents(fullName: string): Promise<{ name: string; type: 'file' | 'dir' }[]>` (`GET /repos/{fullName}/contents`), avec un cache de 10 min dans `assemble`.
  - `createPlanAssembler(deps: { store; projects(): Promise<ProjectSummary[]>; latestReport(key: string): Report | null; rootContents?(fullName: string): Promise<…>; hasGithubToken(): boolean; now(): Date })` renvoie :
    - `view(key): Promise<PlanView | null>` (null si la clé n'est pas celle d'un projet en cours), avec `PlanView = { projectKey; title; unitCode; end: string | null; subject: { fileName; importedAt; info } | null; steps; done; status; improvements }` ;
    - `summaries(): Promise<Record<string, PlanSummary>>`, avec `PlanSummary = { hasSubject: boolean; current: { title: string; target: string | null } | null; late: boolean; progress: number }`.
  - IPC (via `handle()`, arguments validés : clé = projet en cours connu, `itemId` conforme à la regex) :
    - `epihub:subject:import(key)` : `dialog.showOpenDialog` (filtre PDF, un seul fichier), lecture, `extractPdfText`, `parseSubject`, `saveSubject`. Renvoie `{ ok: true } | { ok: false; error: string }` (annulation : `{ ok: false, error: 'annulé' }`).
    - `epihub:subject:remove(key)` ; `epihub:plan:get(key)` → `PlanView | null` ; `epihub:plan:toggle(key, itemId, done: boolean)` → `string[]` ; `epihub:plan:summaries()`.
    - `epihub:plan:export(key)` : écrit `renderPlanMarkdown` dans `<Documents>/EpiHub/plans/<UNIT>-<projet>.md` (chemin vérifié), puis `shell.showItemInFolder`, et renvoie le chemin.
  - Preload / `EpihubApi` : `importSubject`, `removeSubject`, `plan`, `togglePlanItem`, `exportPlan`, `planSummaries`.

- [ ] **Step 1: Tests qui doivent échouer**

```ts
test('extrait le texte d’un PDF', async () => expect(await extractPdfText(read('sample.pdf'))).toContain('Binary name: my_ls'));
test('PDF sans texte → erreur claire', async () => { await expect(extractPdfText(read('blank.pdf'))).rejects.toThrow('Ce PDF ne contient pas de texte lisible'); });
test('PDF corrompu → PDF illisible', async () => { await expect(extractPdfText(new TextEncoder().encode('pas un pdf'))).rejects.toThrow('PDF illisible'); });
test('trop gros', async () => { await expect(extractPdfText(new Uint8Array(20 * 1024 * 1024 + 1))).rejects.toThrow('PDF trop gros'); });
test('store : sujet puis suppression', () => { s.saveSubject('G-PSU-100/myls', 'my_ls.pdf', pdf, 'txt', info); expect(s.getSubject('G-PSU-100/myls')!.fileName).toBe('my_ls.pdf'); s.removeSubject('G-PSU-100/myls'); expect(s.getSubject('G-PSU-100/myls')).toBeNull(); });
test('store : avancement persistant', () => { s.toggle('k', 'setup#0', true); expect(createPlanStore(dir).done('k')).toEqual(['setup#0']); });
test('clé forgée nettoyée, reste dans le dossier', () => { s.saveSubject('../../x', 'a.pdf', pdf, 't', info); expect(readdirSync(join(dir, 'subjects')).every((f) => !f.includes('..'))).toBe(true); });
test('assemble : réimport → items disparus ignorés', async () => { /* done contient 'option:-z#0' absent du plan → progress calculé sans lui */ });
test('assemble : clé inconnue ou projet terminé → null', async () => { expect(await a.view('X/inconnu')).toBeNull(); expect(await a.view(termineKey)).toBeNull(); });
test('assemble : repo non lié → piste P3 ; erreur GitHub → aucune piste repo', async () => { /* ... */ });
test('itemId invalide refusé', () => { expect(validItemId('setup#0')).toBe(true); expect(validItemId('../x')).toBe(false); });
```

- [ ] **Step 2: Lancer** → FAIL ; **Step 3: Implémenter** ; **Step 4: Lancer** → PASS ; `npm test`, `npm run typecheck` et `npm run build` → aucune erreur. Vérifier que `out/main` ne contient pas pdfjs bundlé et que `npm run dist` l'embarque, sinon ajuster.
- [ ] **Step 5: Commit** — `"feat: import des sujets PDF et marche à suivre côté app"`

---

### Task 4: Interface : carte « Marche à suivre » et tableau de bord

**Files:**
- Create: `src/renderer/src/components/PlanCard.tsx`
- Modify: `src/renderer/src/pages/Project.tsx` (carte en premier pour les projets en cours), `src/renderer/src/components/ProjectCard.tsx` et `src/renderer/src/pages/Dashboard.tsx` (étape en cours et pastille de retard), `src/renderer/src/styles/app.css`
- Test: `tests/renderer/planView.test.ts` (helpers purs : `formatTarget`, `groupByPriority`)

**Interfaces:**
- Consumes : `window.epihub.plan(key)`, `importSubject`, `removeSubject`, `togglePlanItem`, `exportPlan`, `planSummaries`, `onChanged`, `onReportsChanged`.
- Produces (spec §8) :
  - **`PlanCard`** :
    - Sans sujet : « La marche à suivre se construit à partir du sujet. Ajoute le PDF du sujet (téléchargé depuis l'intranet ou My Epitech). » et un bouton « Ajouter le sujet (PDF) ». Pendant l'import : « Lecture du sujet… ». En cas d'erreur : message d'erreur dans un toast.
    - Avec sujet :
      - bloc « Ce que le sujet demande » (Binaire, Langage, Compilation et règles, Fonctions autorisées, Interdit, Options, Code d'erreur 84, Tests unitaires, Bonus ; « Non trouvé dans le sujet : … ») ;
      - boutons « Remplacer » et « Retirer le sujet » (confirmation `window.confirm`) ;
      - barre d'avancement « N % » ;
      - étapes : titre, « avant le JJ/MM », pastille « En retard », cases à cocher (toggle optimiste, rechargement de la vue) ;
      - étape courante ouverte, les autres repliées (`<details>`) ;
      - « Pistes d'amélioration » groupées « Priorité haute / moyenne / basse », avec la source affichée (Moulinette, Repo, Temps) ;
      - bouton « Exporter » (toast « Exporté : <chemin> »).
    - Rechargement sur `onChanged` (débouncé à 1 s) et sur `onReportsChanged`.
  - Dans `Project.tsx`, la carte n'apparaît que si le projet est en cours (`summary.deadline` non nul), au-dessus des autres cartes.
  - **Carte du tableau de bord** pour un projet en cours : « Étape : <titre> · JJ/MM », ou « Ajoute le sujet » si `!hasSubject`. Pastille « En retard » si `late`. Les données viennent de `planSummaries()`, chargées avec les projets.
  - `formatTarget('2026-11-05') === '05/11'` ; `groupByPriority(improvements)` renvoie `[[1, [...]], [2, [...]], [3, [...]]]` sans les groupes vides.

- [ ] **Step 1: Tests qui doivent échouer** (helpers) ; **Step 2: lancer** → FAIL ; **Step 3: implémenter** ; **Step 4: lancer** → PASS
- [ ] **Step 5: Implémenter** les composants.
- [ ] **Step 6: Vérifier** — `npm test`, `npm run typecheck` et `npm run build` → aucune erreur. Lancer `npm run dev` avec `--user-data-dir` temporaire environ 15 s (ne pas toucher à l'app installée) : aucune erreur JS.
- [ ] **Step 7: Commit** — `"feat: carte Marche à suivre et étape en cours sur le tableau de bord"`
