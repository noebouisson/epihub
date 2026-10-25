# EpiHub — nouveau My Epitech, tableau de bord et rapports de moulinette

Date : 2026-10-25
Statut : design validé en conversation ; l'utilisateur a demandé d'enchaîner spec → plan → implémentation
Base : specs EpiHub (2026-10-24) et page Projet (2026-10-25)

## 1. Contexte : pourquoi EpiHub n'affiche rien

Diagnostic du 2026-10-25 (session réelle de l'utilisateur, structures seulement) :

- **My Epitech a été refait.** Connexion par MSAL (Microsoft) — la clé `argos-api.oidc-token` n'existe plus — et nouvelle API `https://my.epitech.eu/api/…` avec un jeton `Bearer`. L'ancienne API `api.epitest.eu` n'est plus appelée par le site. EpiHub ne trouve donc jamais de jeton → « Reconnecte-toi » permanent.
- **L'ancien intranet ne sert plus de source.** `intra.epitech.eu/user/?format=json` répond 403 (`{message, office_auth_uri}`) et la page d'accueil JSON ne contient plus de projets. Les projets, événements et le profil sont dans le nouveau My Epitech.

## 2. Objectifs

1. EpiHub récupère à nouveau les données Epitech, via le nouveau My Epitech uniquement.
2. Une page **Tableau de bord** montre l'avancée de chaque projet et le dernier passage de moulinette (réussi / échoué, score, tendance).
3. À chaque **nouveau passage de moulinette**, EpiHub génère localement un **rapport** qui explique pourquoi les tests ont échoué ou réussi et comment s'améliorer. Il est affiché dans l'app et enregistré en Markdown, exportable en PDF.

### Critères de réussite

1. Connecté à My Epitech (onglet), le tableau de bord liste les projets auxquels l'utilisateur est inscrit, avec leurs dates et le dernier résultat.
2. Un nouveau passage déclenche, dans le cycle de 5 min, un rapport + une notification « <projet> : N % (±Δ) — rapport prêt ».
3. Le rapport cite chaque test échoué avec le commentaire de la moulinette, les crashs, les tests obligatoires ratés, les erreurs de compilation / livraison, les fonctions interdites, le style et la couverture, et donne des conseils classés par priorité.
4. Rien n'est envoyé hors de la machine pour générer le rapport.

### Hors périmètre

- Analyse par IA, lecture du code du repo.
- Lecture des données de l'ancien intranet (l'onglet reste pour naviguer).
- Écriture vers My Epitech (inscriptions, etc.).

## 3. Nouvelle API My Epitech (observée)

Base : `https://my.epitech.eu/api`. En-tête `Authorization: Bearer <jeton>`.

| Appel | Réponse (champs utilisés) |
|---|---|
| `GET /students/profile` | `login, firstname, lastname, promotion, semester, gpa, cursus{code,name}, campus{name}` |
| `GET /units/instances/projects?page=N` | `{ data: Project[], meta: { page, pages, total } }` ; `Project = { id, name, fullName, description, startDate, endDate, isUserRegistered, unitInstance: { code, unitCode, name } }` |
| `GET /units/instances/projects/{id}/test-results` | `{ results: RunSummary[] }` ; 400 « Project slug not found » si le projet n'a pas de moulinette |
| `GET /students/test-results/{runId}` | `RunDetail` (ci-dessous) |
| `GET /students/test-results/history/{year}/{unitCode}/{projectCode}` | `{ results: RunSummary[] }` |

`RunSummary = { id, context: { unitCode, projectCode, title, year }, properties: { date, commit, group: { members: string[] } }, failureFlags: string[], prerequisitesMark, codingStyle: { penalty, value: { fatal, major, minor, info } }, coverage: { Default: { linePercentage, branchPercentage } }, skillBreakdowns: { [catégorie]: { count, passed, crashed, mandatoryFailed } }, repoLink, achievementSummary: { passed, total } }`

`RunDetail = { context, properties, failureFlags, codingStyle, coverage: { Default: { coveredLines, totalLines, coveredBranches, totalBranches } }, deliveryError, makeError, bannedFunctions, skills: [{ FullSkillReport: { name, tests: [{ name, passed, crashed, skipped, mandatory, comment }] } }], achievements: [{ title, testCategoryName, unlocked }] }`

`deliveryError`, `makeError`, `bannedFunctions` : `null` ou objet (contenu inconnu → afficher en texte brut s'il existe).

## 4. Authentification

- Le jeton n'est **jamais lu dans le stockage du site** (MSAL peut le chiffrer). EpiHub l'intercepte : `session.fromPartition('persist:myepitech').webRequest.onBeforeSendHeaders` sur `https://my.epitech.eu/api/*` mémorise le dernier `Authorization: Bearer …` envoyé par la page (onglet ou fenêtre cachée).
- Le jeton reste **en mémoire uniquement** (jamais écrit sur disque, jamais loggé).
- Besoin d'un jeton et aucun jeton valide (absent ou `exp` du JWT dépassé) : EpiHub charge `https://my.epitech.eu/` dans une fenêtre cachée de la partition et attend jusqu'à 15 s une requête API portant un jeton. Sinon → `needs-login`.
- Réponse 401 d'un appel : jeton oublié, une seule nouvelle tentative après renouvellement ; sinon `needs-login`.
- L'écouteur `onBeforeSendHeaders` doit être compatible avec les écouteurs déjà posés sur cette session (une seule fonction par session dans Electron : regrouper si nécessaire).

## 5. Données et rafraîchissement

`MyEpitechData` devient :

```ts
interface MyEpitechData {
  profile: { login: string; name: string; promotion: number | null; semester: number | null; gpa: string | null; cursus: string | null };
  projects: MyProject[];               // seulement isUserRegistered
  runs: Record<string /* projectId */, RunSummary[]>; // du plus récent au plus ancien
}
interface MyProject { id: string; name: string; unitCode: string; unitName: string; description: string; start: string; end: string; url: string }
```

- `url` du projet : page My Epitech du projet si elle peut être construite, sinon `https://my.epitech.eu/`.
- Les passages sont rafraîchis à chaque cycle de 5 min pour les projets « actifs » (fin dans le futur ou depuis moins de 14 jours), et au plus toutes les 6 h pour les autres. Concurrence max 4 requêtes.
- 400 sur `test-results` → `[]` (pas de moulinette), pas une erreur.
- **Ancien intranet** : le service `intra` ne lit plus rien. `intra` reste un `ServiceId` (onglet, barre latérale) ; son état dans le registre est `ok` avec `data: null`.
- **Tout ce qui lisait les données intranet** passe sur My Epitech : rendus et alertes (projets inscrits dont la fin est dans le futur → `Deadline`, id `mye-<projectId>`, `moduleCode = unitCode`, `title = name`, `url = project.url`), carte profil (promo, semestre, GPA), recherche, liste et page Projets (le sujet = `description` du projet ; pas de fichiers), notifications intranet supprimées.
- Clé de projet inchangée (`projectKey(unitCode, name)`), alias supplémentaire `projectKey(unitCode, context.projectCode)` des passages pour l'association repo.

## 6. Score et verdict

- Score d'un passage = Σ`passed` / Σ`count` des `skillBreakdowns`, en %, arrondi. 0 test → `null`.
- Verdict : `reussi` si 100 % et aucun `failureFlags` ; `partiel` si ≥ 50 % ; `echoue` sinon ou si `deliveryError` / `makeError` non nul ou si `failureFlags` contient `no-test-passed`.
- Tendance : différence de score avec le passage précédent du même projet.

## 7. Rapport

### 7.1 Contenu (`Report`, calcul pur)

1. **En-tête** : projet, module, date et commit du passage, groupe, score, verdict, Δ.
2. **Résumé** en une ou deux phrases (ex. « 18 tests sur 29 passent. 3 tests obligatoires échouent et 2 crashent : c'est la priorité. »).
3. **Pourquoi** :
   - erreur de livraison / compilation (`deliveryError`, `makeError`) — en premier, avec le texte fourni ;
   - fonctions interdites (`bannedFunctions`) ;
   - `failureFlags` traduits (`no-test-passed` → « Aucun test ne passe : le binaire ne compile pas, ne s'appelle pas comme attendu ou ne produit aucune sortie ») ; flag inconnu → affiché tel quel ;
   - par catégorie : passés / total, crashs, obligatoires ratés ;
   - chaque test échoué : nom, obligatoire ?, crash ?, commentaire de la moulinette (texte brut).
   - style : fatal / major / minor / info, pénalité ;
   - couverture : lignes et branches (%).
4. **Comment s'améliorer** — conseils triés par priorité :
   - P1 : compilation / livraison, fonctions interdites, tests obligatoires, crashs (conseil : valgrind, `-g3 -fsanitize=address`, vérifier NULL et les dépassements de tableau) ;
   - P2 : catégories de base / faciles incomplètes avant medium / hard ; catégories « format » → sortie exacte (espaces, retours à la ligne, sortie d'erreur, code de retour) ;
   - P3 : style (fatal et major d'abord), couverture < 50 % (ajouter des tests unitaires Criterion).
   - Chaque conseil cite les tests concernés.
5. **Évolution** depuis le passage précédent : tests qui passent maintenant, tests qui ne passent plus (si les deux détails sont disponibles ; sinon par catégorie).
6. **Ce qui marche** : catégories complètes.

### 7.2 Génération

- À chaque rafraîchissement, pour chaque projet, si le passage le plus récent n'a pas encore de rapport : récupérer `RunDetail` (et celui du passage précédent pour l'évolution), calculer le `Report`, écrire le fichier, indexer, notifier.
- **Premier lancement** de la fonctionnalité : un rapport pour le dernier passage de chaque projet seulement, **sans notification** pour ceux-là.
- Échec de récupération du détail : nouvel essai au cycle suivant (pas de rapport partiel indexé).
- Index : `userData/reports.json` = `{ [runId]: { projectKey, file, score, verdict, date, generatedAt } }`.

### 7.3 Fichiers

- `~/Documents/EpiHub/rapports/<UNIT>-<projectCode>/<YYYY-MM-DD_HH-mm>-<runId>.md` (dossier « Documents » du système via `app.getPath('documents')`).
- Noms de dossier et de fichier nettoyés (lettres, chiffres, `-`, `_` seulement).
- Markdown généré à partir du `Report` ; les commentaires de la moulinette sont placés dans des blocs de code (aucune interprétation).
- Export PDF : rendu HTML du `Report` (texte échappé, aucun HTML venant des données) dans une fenêtre cachée sans accès Node, `printToPDF`, enregistrement à côté du `.md`, puis ouverture du dossier.

## 8. Interface

- **Barre latérale** : « Tableau de bord » en premier.
- **Tableau de bord** :
  - bandeau : projets en cours, projets en échec, moyenne des derniers scores, prochain rendu ;
  - une carte par projet inscrit (en cours d'abord par échéance, puis terminés par date du dernier passage) : nom, module, barre d'avancement temporelle (début → fin, « J-3 »), dernier passage (score, pastille Réussi / Partiel / Échoué / Pas encore testé, flèche ±Δ), problème principal en une ligne, style (fatal/major), bouton « Voir le rapport » (ouvre la page projet sur le rapport) ;
  - si My Epitech n'est pas connecté : message et bouton « Ouvrir My Epitech ».
- **Page projet** : la carte « My Epitech » devient « Moulinette » (courbe des scores existante + dernier rapport affiché + liste des rapports précédents + « Ouvrir le fichier » + « Exporter en PDF »). La carte « Sujet » affiche la description du projet.
- **Accueil** : la carte « Profil Epitech » lit le profil My Epitech ; les rendus viennent de My Epitech.
- Rendu du rapport dans l'app à partir du `Report` structuré (composants React, texte uniquement — jamais de HTML brut).

## 9. Architecture

- `src/main/services/myepitechAuth.ts` : capture du jeton, renouvellement par fenêtre cachée, `getToken()` / `invalidate()`.
- `src/main/services/myepitech.ts` : réécrit — client de la nouvelle API, décodage, `refresh()` → `MyEpitechData`, `runDetail(id)`, `history(...)`.
- `src/main/services/intra.ts` : réduit à un service « onglet seulement ».
- `src/main/reports/analyze.ts` (pur) : `scoreOf`, `verdictOf`, `buildReport(detail, summary, previousDetail?)`.
- `src/main/reports/markdown.ts` (pur) : `renderMarkdown(report)`. `src/main/reports/html.ts` (pur) : `renderHtml(report)`.
- `src/main/reports/pipeline.ts` : détection des nouveaux passages, génération, fichiers, index, notifications (dépendances injectées, testé).
- Adaptations : `effects.ts` (rendus depuis My Epitech), `links/projects.ts`, `app/projectDetails.ts`, `links/searchIndex.ts`, `ipc.ts` / preload (`reports(projectKey)`, `report(runId)`, `openReportFile(runId)`, `exportReportPdf(runId)`), renderer (`pages/Dashboard.tsx`, composants du rapport).
- Suppression : lecture `argos-api.oidc-token`, `api.epitest.eu`, `myepitechToken.ts`, lecture de données intranet.

## 10. Erreurs et sécurité

- Jeton en mémoire seulement ; aucun jeton, cookie ni commentaire de moulinette dans les logs.
- IPC : identifiants validés (chaînes, `runId` numérique), fichiers ouverts seulement s'ils sont dans le dossier des rapports.
- Une erreur sur un projet n'empêche pas les autres ; une erreur d'écriture de fichier laisse le rapport visible dans l'app et sera réessayée.
- PDF : fenêtre cachée `sandbox`, sans preload, contenu `data:` généré par EpiHub.

## 11. Tests

- Décodage de chaque réponse avec des exemples ayant la structure observée (§3), pagination, 400 → `[]`, 401 → renouvellement puis `needs-login`.
- Capture du jeton (simulée) : mémorisation, expiration JWT, `invalidate`.
- `analyze` : score, verdict (tous les cas), chaque cause, priorité des conseils, évolution, flags inconnus.
- `markdown` / `html` : contenu attendu, échappement (un commentaire contenant `<script>` reste du texte), noms de fichiers nettoyés.
- `pipeline` : nouveau passage → rapport + notification ; premier lancement sans notification ; détail en échec → réessai ; pas de doublon.
- Adaptations : rendus et alertes depuis My Epitech, projets, recherche.
- Interface : typecheck, build, lancement.
