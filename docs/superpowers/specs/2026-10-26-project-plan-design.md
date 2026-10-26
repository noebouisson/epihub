# EpiHub — marche à suivre et pistes d'amélioration par projet

Date : 2026-10-26
Statut : design validé en conversation ; l'utilisateur a demandé d'enchaîner spec → plan → implémentation → merge, push, installation

## 1. Contexte

My Epitech ne fournit pas le texte des sujets (description vide pour my_ls, my_sudo, Student Engagement ; pas de lien vers le PDF) et les projets en cours n'ont pas encore de passage de moulinette. Pour écrire une marche à suivre, EpiHub a besoin du sujet : l'utilisateur importe le PDF, EpiHub l'analyse **localement** (aucune IA, rien n'est envoyé).

## 2. Objectifs

Pour chaque projet **en cours** (fin dans le futur) :
1. Importer le sujet PDF, en extraire les exigences et les afficher (« Ce que le sujet demande »).
2. Générer une **marche à suivre** par étapes, avec des cases à cocher et une **date cible** par étape calée sur le rendu.
3. Lister des **pistes d'amélioration** tirées des résultats moulinette, du repo GitHub lié et du temps restant.
4. Montrer l'étape en cours et un retard éventuel sur le tableau de bord.

### Critères de réussite
- Sur un sujet Epitech standard (format « Binary name / Language / Compilation / Authorized functions », options, exemples, bonus), le résumé contient le binaire, la compilation et ses règles, les fonctions autorisées, les options, l'exigence « 84 » et la partie bonus.
- Les cases cochées sont conservées au redémarrage.
- Les pistes se mettent à jour à chaque rafraîchissement (moulinette, repo) sans action de l'utilisateur.

### Hors périmètre
IA ; OCR des PDF scannés (un PDF sans texte → message « Ce PDF ne contient pas de texte lisible ») ; projets terminés ; modification du repo.

## 3. Import et stockage du sujet

- Bouton « Ajouter le sujet (PDF) » (page projet, projets en cours) → boîte de dialogue système (filtre PDF) ouverte par le processus principal.
- Limites : 20 Mo, 80 pages ; au-delà ou en cas d'erreur → message clair, rien n'est stocké.
- Extraction du texte avec `pdfjs-dist` **4.10.38** exactement (dépendance de production, externalisée du bundle main ; la 5.x exige `DOMMatrix`, la 6.x fait planter Electron 33), dans un worker_thread du processus principal avec délai maximal, sans exécuter de script du PDF (`isEvalSupported: false`). Les lignes sont reconstruites dans l'ordre de lecture (regroupement par position verticale) ; une ligne vide marque un écart vertical > 1,5 × l'écart médian de la page (à défaut 1,5 × la hauteur de police) et sépare les pages ; les numéros de page seuls sont retirés. `npm run smoke:pdf` vérifie l'extraction dans le vrai Electron (dev et asar).
- Stockage : `userData/subjects/<clé nettoyée>.pdf` (copie), `userData/subjects/<clé nettoyée>.json` = `{ projectKey, fileName, importedAt, text, info }` et la fiche légère `<clé nettoyée>.info.json` = `{ projectKey, fileName, importedAt, info, textHash }` (lue par la vue et le tableau de bord, sans le texte). « Remplacer » réimporte (un texte différent efface les cases cochées du projet), « Retirer le sujet » supprime les fichiers et les cases cochées.

## 4. Analyse du sujet (`parseSubject(text) → SubjectInfo`, pur)

```ts
interface SubjectInfo {
  binaryName: string | null; language: string | null; repoName: string | null;
  compilation: string | null; makefileRules: string[];     // ex. ['re','clean','fclean']
  authorizedFunctions: string[]; forbidden: string[];
  options: { flag: string; description: string }[];         // ex. { flag: '-l', description: 'use a long listing format' }
  requirements: string[];                                   // phrases « must / should / have to / doit / doivent / il faut »
  errorCode84: boolean; unitTests: boolean;
  examples: string[];                                       // blocs d'exemple (lignes commençant par un prompt `>`, `$` ou `∼/`)
  bonus: string[];                                          // lignes de la section Bonus
  missing: string[];                                        // ce qui n'a pas été trouvé (« Nom du binaire non trouvé », …)
}
```

Règles (insensibles à la casse, anglais et français) :
- Champs « clé : valeur » : `Binary name|Nom du binaire`, `Language|Langage`, `Repository name|Nom du dépôt`, `Compilation`, `Authorized functions|Fonctions autorisées` (valeur sur la ligne et les lignes suivantes tant qu'elles ne contiennent que des identifiants séparés par des virgules — arrêt à une ligne vide, un nouveau champ, un titre ou une phrase ; séparateurs `,` `;` espaces ; noms `[A-Za-z_][A-Za-z0-9_]*` sans parenthèses ; `libc`, `all` gardés tels quels).
- `makefileRules` : mots `re`, `clean`, `fclean`, `all`, `tests_run` cités dans la ligne Compilation.
- `forbidden` : fonctions citées dans les phrases contenant `forbidden|interdit`.
- `options` : lignes qui commencent par un drapeau `-x` / `-xy` / `--long` suivi d'une description ; dédupliquées dans l'ordre.
- Blocs d'exemple : de l'invite jusqu'à la prochaine invite, un titre de section ou une phrase (point final, ≥ 5 mots, pas de drapeau en tête), lignes vides comprises ; un écran d'aide (première ligne de sortie en MAJUSCULES, ex. `USAGE`) garde ses titres internes. Les drapeaux d'un exemple ne sont jamais des options.
- Lignes composées uniquement de chiffres (numéros de page) ignorées ; puces `✓` `✔` `•` retirées en début de ligne.
- `errorCode84` : présence de `84` dans une phrase contenant `exit|return|code|retour|erreur|error`.
- `unitTests` : `unit test|tests unitaires|criterion|tests_run`.
- `bonus` : lignes après un titre `Bonus` (jusqu'au titre suivant ou la fin), limitées à 30.
- Le texte n'est jamais interprété ; tout reste du texte brut.

## 5. Marche à suivre (`buildPlan(info, { start, end, now }) → PlanStep[]`, pur)

```ts
interface PlanItem { id: string; text: string }
interface PlanStep { id: string; title: string; details: string; items: PlanItem[]; target: string | null /* YYYY-MM-DD */ }
```

Étapes, dans l'ordre (une étape vide est omise) :
1. `setup` « Mise en place » : dépôt `<repoName>` ; Makefile avec les règles `<makefileRules>` ; binaire nommé exactement `<binaryName>` ; `.gitignore` (binaires, `*.o`, `vgcore.*`).
2. `base` « Cas de base » : faire fonctionner le premier exemple ; respecter les fonctions autorisées (liste).
3. Une étape par option : `option:<flag>` « Option <flag> » (description du sujet) ; si aucune option : une étape `features` « Fonctionnalités demandées » avec les exigences (max 12 items), hors consignes communes Epitech (« totality of your source files », « bonus files », « Error messages have to be written », « must be compiled using »), qui restent dans `requirements`.
4. `errors` « Gestion des erreurs » : code de retour 84 si `errorCode84` ; messages sur la sortie d'erreur ; « Gérer les cas limites (par ex. fichier inexistant, arguments invalides) ».
5. `tests` « Tests » : reproduire chaque exemple ; tests unitaires Criterion + règle `tests_run` si `unitTests`.
6. `finish` « Finition » : coding style ; `make re` sur un clone propre ; vérifier qu'aucun binaire/`.o` n'est poussé.
7. `bonus` « Bonus » (si `bonus` non vide) : items = lignes bonus (max 10), avec la mention « Seulement quand tout le reste est fait ».

Identifiants stables : `step.id` comme ci-dessus ; `item.id = <step.id>#<index>`.

Dates cibles : poids `setup 1`, `base 2`, chaque option `1.5`, `features 3`, `errors 1`, `tests 1.5`, `finish 0.5`, `bonus 1`. Le temps disponible va de `max(start, now)` à `end − 1 jour` ; chaque étape reçoit une date de fin proportionnelle au cumul des poids, arrondie au jour (heure locale). Si `end` est passé ou absent → `target: null` partout. Le plan est figé à l'import : `now` = `importedAt` du sujet (`start: null`), les dates ne glissent donc pas d'un jour à l'autre ; un réimport replanifie. `planStatus` et les pistes utilisent l'heure réelle.

## 6. Avancement (`planStatus(steps, done, now)`, pur)

- `progress` = items cochés / items totaux (%, arrondi).
- `current` = première étape non terminée (un item non coché) ; `null` si tout est fait.
- `late` = étapes non terminées dont `target` < aujourd'hui.

Cases cochées : `userData/plans.json` = `{ [projectKey]: { done: string[] } }` (écriture atomique). Un item disparu après réimport est ignoré.

## 7. Pistes d'amélioration (`improvements(input) → Improvement[]`, pur)

```ts
interface Improvement { source: 'moulinette' | 'repo' | 'temps'; priority: 1 | 2 | 3; text: string }
```

- **moulinette** (dernier rapport du projet s'il existe) : chaque conseil du rapport → une piste (priorité du conseil, texte = titre + tests cités).
- **repo** (si un repo est lié et un token GitHub configuré ; sinon une piste P3 « Lie le repo GitHub du projet pour des conseils sur ton code ») :
  - dernier push il y a ≥ 3 jours et rendu dans ≤ 14 jours → P2 « Rien n'a été poussé depuis N jours » ;
  - pas de `Makefile` à la racine → P1 ;
  - fichiers interdits à la racine : `*.o`, `*.a`, `a.out`, `vgcore.*`, fichier nommé `<binaryName>` → P1 (liste) ;
  - sujet `unitTests` et pas de dossier `tests` à la racine → P2.
- **temps** :
  - chaque étape en retard → P2 « Étape « X » en retard (prévue le JJ/MM) » ; plus de 3 étapes en retard → une seule P2 « N étapes en retard : A, B, C… » ;
  - étape bonus commencée alors qu'une étape précédente n'est pas finie → P3 « Termine la partie obligatoire avant le bonus » ;
  - aucun sujet importé → P1 « Ajoute le sujet (PDF) pour obtenir la marche à suivre ».
- Tri par priorité puis source (`moulinette`, `repo`, `temps`).

Contrôle du repo : `GET /repos/{fullName}/contents` (liste de la racine : noms et types) + `pushedAt` déjà connu ; best-effort, en cache 10 min par repo ; dépôt vide (409, ou 404 « This repository is empty ») → racine vide ; autre erreur → pas de piste repo.

## 8. Interface

- **Page projet** (projets en cours), carte « Marche à suivre » en premier :
  - pas de sujet : explication + bouton « Ajouter le sujet (PDF) » ;
  - avec sujet : « Ce que le sujet demande » (binaire, langage, compilation et règles, fonctions autorisées, options, 84, tests unitaires, bonus ; « Non trouvé dans le sujet : … » pour `missing`), boutons « Remplacer » / « Retirer le sujet » ;
  - barre d'avancement + étapes (titre, date cible, « En retard », cases à cocher) ;
  - « Pistes d'amélioration » groupées par priorité, avec la source ;
  - bouton « Exporter » → `~/Documents/EpiHub/plans/<UNIT>-<projet>.md`, puis affichage dans le dossier.
- **Tableau de bord** : sur la carte d'un projet en cours, « Étape : <titre> · JJ/MM » ou « Ajoute le sujet » ; pastille « En retard » si `late` non vide.
- Tout est rendu en texte React (aucun HTML venant du PDF).

## 9. Architecture

- `src/main/plan/subject.ts` (`parseSubject`), `src/main/plan/plan.ts` (`buildPlan`, `planStatus`), `src/main/plan/improvements.ts` (`improvements`, `evaluateRepo`), `src/main/plan/markdown.ts` (`renderPlanMarkdown`) — purs.
- `src/main/plan/pdfText.ts` (extraction pdfjs), `src/main/plan/store.ts` (sujets + avancement), `src/main/plan/assemble.ts` (vue complète d'un projet).
- `github.ts` : `rootContents(fullName)`.
- IPC : `epihub:subject:import(key)`, `epihub:subject:remove(key)`, `epihub:plan:get(key)`, `epihub:plan:toggle(key, itemId, done)`, `epihub:plan:export(key)`, `epihub:plan:summaries()` ; preload + `EpihubApi`.
- Renderer : `components/PlanCard.tsx`, intégration `Project.tsx`, `ProjectCard.tsx`.

## 10. Sécurité et erreurs

- PDF traité dans le processus principal, sans évaluation de code ; taille et pages bornées ; texte affiché comme texte.
- Arguments IPC validés (`projectKey` chaîne connue d'un projet en cours ; `itemId` correspondant à `^[a-z:#0-9_-]+$`).
- Chemins de stockage et d'export construits à partir de clés nettoyées `[A-Za-z0-9_-]`, vérifiés dans leur dossier.
- Aucune donnée du sujet dans les logs.

## 11. Tests

- `parseSubject` sur un sujet d'exemple de type my_ls (anglais) et un extrait en français ; champs manquants → `missing`.
- `buildPlan` : étapes, identifiants, dates (poids, `end − 1 jour`, fin passée → null), étape `features` sans options, bonus.
- `planStatus` : progression, étape courante, retards.
- `improvements` / `evaluateRepo` : chaque règle, tri.
- `renderPlanMarkdown` : sections, texte brut.
- Extraction PDF sur un petit PDF de test généré (texte connu), PDF sans texte, limites.
- Stores : avancement persistant, écriture atomique, suppression du sujet.
