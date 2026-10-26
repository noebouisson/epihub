export type ServiceId = 'github' | 'intra' | 'myepitech' | 'teams';
export type ServiceState = 'loading' | 'ok' | 'needs-login' | 'error';
export interface ServiceStatus { state: ServiceState; message?: string; updatedAt?: number }

export interface Repo { fullName: string; name: string; url: string; pushedAt: string; defaultBranch: string }
export interface Commit { sha: string; message: string; author: string; date: string; url: string }
export interface GhNotification { id: string; title: string; repo: string; type: string; url: string; updatedAt: string }
export interface GhItem { id: number; title: string; repo: string; url: string; updatedAt: string; kind: 'pr' | 'issue' }
export interface GithubData { login: string; notifications: GhNotification[]; reviewRequests: GhItem[]; assignedIssues: GhItem[]; repos: Repo[] }

export interface Deadline { id: string; moduleCode: string; projectCode: string; title: string; end: string /* ISO */; url: string }

/** Projet My Epitech auquel l'étudiant est inscrit. */
export interface MyProject { id: string; name: string; unitCode: string; unitName: string; description: string; start: string; end: string; url: string }
export interface MyProfile { login: string; name: string; promotion: number | null; semester: number | null; gpa: string | null; cursus: string | null }
/** `runs` : passages par id de projet, du plus récent au plus ancien. */
export interface MyEpitechData { profile: MyProfile; projects: MyProject[]; runs: Record<string, RunSummary[]> }
export interface TeamsData { unread: number }

/** `intra` reste un onglet mais ne fournit plus aucune donnée. */
export interface ServiceDataMap { github: GithubData; intra: null; myepitech: MyEpitechData; teams: TeamsData }
export interface ServiceSnapshot<K extends ServiceId = ServiceId> { status: ServiceStatus; data: ServiceDataMap[K] | null }

export type AlertLevel = 'warning' | 'urgent';
export interface DeadlineView extends Deadline { repo: Repo | null; lastCommit: Commit | null; alert: AlertLevel | null; manual: boolean }

export interface SearchItem { id: string; kind: 'repo' | 'pr' | 'issue' | 'deadline' | 'page' | 'project'; title: string; subtitle?: string; service: ServiceId | 'app'; url: string; date?: string }

export interface Settings { repoLinks: Record<string /* deadline id */, string /* repo fullName */>; projectRepoLinks: Record<string /* projectKey */, string /* repo fullName */>; projectTeamsLinks: Record<string /* projectKey */, string /* URL Teams */>; notify: Record<ServiceId, boolean>; theme: 'dark' | 'light' }

export interface ProjectSummary {
  /** Clé canonique `projectKey(unitCode, nom)` ; `aliases` : toutes les clés du projet (dont celles des codes projet des passages). */
  key: string; aliases: string[]; projectId: string | null; title: string; moduleCode: string
  deadline: DeadlineView | null; lastResult: RunSummary | null
  repo: Repo | null; teamsUrl: string | null; status: 'en-cours' | 'termine'
}
export type SectionState = 'loading' | 'ok' | 'needs-login' | 'error' | 'unavailable'
export interface Section<T> { state: SectionState; data: T | null; message?: string }
export interface SubjectData { description: string; files: { title: string; url: string }[] }
export interface PullSummary { number: number; title: string; url: string; author: string; updatedAt: string }
export interface RepoActivity { commits: Commit[]; pulls: PullSummary[] }
export interface TestRun { id: string; date: string; percent: number }
export interface TestCase { name: string; passed: boolean; crashed: boolean }
export interface SkillReport { name: string; passed: number; count: number; tests: TestCase[] }
/** `latestError` : le détail du dernier passage n'a pas pu être chargé (l'historique reste affiché). */
export interface ResultsData { runs: TestRun[]; latest: SkillReport[]; latestError?: string }
export interface ProjectDetail { summary: ProjectSummary; subject: Section<SubjectData>; repo: Section<RepoActivity>; results: Section<ResultsData> }

export type SetTokenResult = { ok: true } | { ok: false; error: 'ENCRYPTION_UNAVAILABLE' }
export interface OpenTarget { service: ServiceId | 'app'; url?: string }
export interface TeamsNotificationPayload { title: string; body: string; tag: string }

/** API exposée au renderer par le preload sous `window.epihub`. */
export interface EpihubApi {
  snapshot(): Promise<{ [K in ServiceId]: ServiceSnapshot<K> }>
  /** `{ force: true }` : action de l'utilisateur, My Epitech ignore alors sa pause de reconnexion. */
  refresh(id?: ServiceId, opts?: { force?: boolean }): Promise<void>
  deadlines(): Promise<DeadlineView[]>
  projects(): Promise<ProjectSummary[]>
  project(key: string, force?: boolean): Promise<ProjectDetail | null>
  search(query: string): Promise<SearchItem[]>
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  setGithubToken(token: string): Promise<SetTokenResult>
  clearGithubToken(): Promise<void>
  share(item: { title: string; url: string; context?: string }): Promise<string>
  /** URL file: canonique du preload Teams. */
  teamsPreloadPath(): Promise<string>
  teamsTitle(title: string): Promise<void>
  teamsNavigate(url: string): Promise<void>
  teamsNotification(n: TeamsNotificationPayload): Promise<void>
  onChanged(cb: (snapshot: { [K in ServiceId]: ServiceSnapshot<K> }) => void): () => void
  onPalette(cb: () => void): () => void
  onOpen(cb: (target: OpenTarget) => void): () => void
  /** Un rapport a été enregistré (nouveau passage ou fichier réécrit) : les pages rechargent leurs rapports. */
  onReportsChanged(cb: () => void): () => void
  /** Clé canonique du projet → entrée de rapport de son dernier passage. */
  latestReports(): Promise<Record<string, ReportEntry>>
  reports(projectKey: string): Promise<ReportEntry[]>
  report(runId: string): Promise<Report | null>
  openReportFile(runId: string): Promise<boolean>
  exportReportPdf(runId: string): Promise<string | null>
  /** Ouvre le sélecteur de PDF, analyse et stocke le sujet du projet en cours. */
  importSubject(projectKey: string): Promise<ImportSubjectResult>
  removeSubject(projectKey: string): Promise<void>
  plan(projectKey: string): Promise<PlanView | null>
  /** Coche ou décoche un item ; renvoie les items cochés. */
  togglePlanItem(projectKey: string, itemId: string, done: boolean): Promise<string[]>
  /** Écrit la marche à suivre en Markdown ; renvoie le chemin, ou null. */
  exportPlan(projectKey: string): Promise<string | null>
  planSummaries(): Promise<Record<string, PlanSummary>>
}

/* ---- Rapports de moulinette ---- */
export type Verdict = 'reussi' | 'partiel' | 'echoue'
export interface SkillBreakdown { count: number; passed: number; crashed: number; mandatoryFailed: number }
export interface RunStyle { fatal: number; major: number; minor: number; info: number; penalty: number | null }
export interface RunSummary {
  id: string; unitCode: string; projectCode: string; title: string; year: number
  date: string; commit: string; members: string[]; failureFlags: string[]
  style: RunStyle; coverage: { lines: number | null; branches: number | null }
  categories: Record<string, SkillBreakdown>; repoLink: string | null
}
export interface RunTest { name: string; passed: boolean; crashed: boolean; skipped: boolean; mandatory: boolean; comment: string }
export interface RunDetail {
  categories: { name: string; tests: RunTest[] }[]
  deliveryError: string | null; makeError: string | null; bannedFunctions: string[]
  coverage: { lines: number | null; branches: number | null }
}
export interface ReportAdvice { priority: 1 | 2 | 3; title: string; text: string; tests: string[] }
export interface Report {
  runId: string; projectTitle: string; unitCode: string; projectCode: string
  date: string; commit: string; members: string[]
  score: number | null; verdict: Verdict; delta: number | null; summary: string
  blockers: string[]
  categories: { name: string; passed: number; count: number; crashed: number; mandatoryFailed: number }[]
  failedTests: { category: string; name: string; mandatory: boolean; crashed: boolean; comment: string }[]
  style: RunStyle; coverage: { lines: number | null; branches: number | null }
  advice: ReportAdvice[]
  evolution: { fixed: string[]; broken: string[]; byCategory: boolean } | null
  working: string[]
}

/** Entrée de l'index des rapports (`file` : chemin du .md, ou null si l'écriture a échoué). */
export interface ReportEntry { runId: string; projectKey: string; projectId: string; file: string | null; score: number | null; verdict: Verdict; date: string; generatedAt: number }

/* ---- Marche à suivre ---- */
export interface SubjectInfo {
  binaryName: string | null; language: string | null; repoName: string | null
  compilation: string | null; makefileRules: string[]
  authorizedFunctions: string[]; forbidden: string[]
  options: { flag: string; description: string }[]
  requirements: string[]
  errorCode84: boolean; unitTests: boolean
  examples: string[]
  bonus: string[]
  missing: string[]
}
export interface PlanItem { id: string; text: string }
/** `target` : date cible locale `YYYY-MM-DD`, ou null (fin passée ou absente). */
export interface PlanStep { id: string; title: string; details: string; items: PlanItem[]; target: string | null }
export interface PlanStatus { progress: number; current: PlanStep | null; late: PlanStep[] }
export interface Improvement { source: 'moulinette' | 'repo' | 'temps'; priority: 1 | 2 | 3; text: string }
export interface RepoCheck { lastPush: string | null; hasMakefile: boolean; forbiddenFiles: string[]; hasTests: boolean }

export interface PlanView {
  projectKey: string; title: string; unitCode: string; end: string | null
  subject: { fileName: string; importedAt: number; info: SubjectInfo } | null
  steps: PlanStep[]; done: string[]; status: PlanStatus; improvements: Improvement[]
}
export interface PlanSummary { hasSubject: boolean; current: { title: string; target: string | null } | null; late: boolean; progress: number }
export type ImportSubjectResult = { ok: true } | { ok: false; error: string }
