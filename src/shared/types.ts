export type ServiceId = 'github' | 'intra' | 'myepitech' | 'teams';
export type ServiceState = 'loading' | 'ok' | 'needs-login' | 'error';
export interface ServiceStatus { state: ServiceState; message?: string; updatedAt?: number }

export interface Repo { fullName: string; name: string; url: string; pushedAt: string; defaultBranch: string }
export interface Commit { sha: string; message: string; author: string; date: string; url: string }
export interface GhNotification { id: string; title: string; repo: string; type: string; url: string; updatedAt: string }
export interface GhItem { id: number; title: string; repo: string; url: string; updatedAt: string; kind: 'pr' | 'issue' }
export interface GithubData { login: string; notifications: GhNotification[]; reviewRequests: GhItem[]; assignedIssues: GhItem[]; repos: Repo[] }

export interface Deadline { id: string; moduleCode: string; projectCode: string; title: string; end: string /* ISO */; url: string }
export interface IntraEvent { id: string; title: string; start: string; end: string; url: string }
export interface IntraNotification { id: string; title: string; date: string }
export interface IntraData { login: string; promo: number; credits: number; gpa: string; deadlines: Deadline[]; events: IntraEvent[]; notifications: IntraNotification[] }

export interface TestResult { id: string; project: string; module: string; slug: string; date: string; percent: number; url: string }
export interface MyEpitechData { results: TestResult[] }
export interface TeamsData { unread: number }

export interface ServiceDataMap { github: GithubData; intra: IntraData; myepitech: MyEpitechData; teams: TeamsData }
export interface ServiceSnapshot<K extends ServiceId = ServiceId> { status: ServiceStatus; data: ServiceDataMap[K] | null }

export type AlertLevel = 'warning' | 'urgent';
export interface DeadlineView extends Deadline { repo: Repo | null; lastCommit: Commit | null; alert: AlertLevel | null; manual: boolean }

export interface SearchItem { id: string; kind: 'repo' | 'pr' | 'issue' | 'deadline' | 'page' | 'project'; title: string; subtitle?: string; service: ServiceId | 'app'; url: string; date?: string }

export interface Settings { repoLinks: Record<string /* deadline id */, string /* repo fullName */>; projectRepoLinks: Record<string /* projectKey */, string /* repo fullName */>; projectTeamsLinks: Record<string /* projectKey */, string /* URL Teams */>; notify: Record<ServiceId, boolean>; theme: 'dark' | 'light' }

export interface ProjectSummary {
  /** Clé canonique (clé du slug My Epitech s'il y a un résultat, sinon clé intranet) ; `aliases` : toutes les clés du projet. */
  key: string; aliases: string[]; title: string; moduleCode: string
  deadline: DeadlineView | null; lastResult: TestResult | null
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
  refresh(id?: ServiceId): Promise<void>
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
}
