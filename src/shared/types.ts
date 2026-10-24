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

export interface TestResult { id: string; project: string; module: string; date: string; percent: number; url: string }
export interface MyEpitechData { results: TestResult[] }
export interface TeamsData { unread: number }

export interface ServiceDataMap { github: GithubData; intra: IntraData; myepitech: MyEpitechData; teams: TeamsData }
export interface ServiceSnapshot<K extends ServiceId = ServiceId> { status: ServiceStatus; data: ServiceDataMap[K] | null }

export type AlertLevel = 'warning' | 'urgent';
export interface DeadlineView extends Deadline { repo: Repo | null; lastCommit: Commit | null; alert: AlertLevel | null; manual: boolean }

export interface SearchItem { id: string; kind: 'repo' | 'pr' | 'issue' | 'deadline' | 'page'; title: string; subtitle?: string; service: ServiceId | 'app'; url: string; date?: string }

export interface Settings { repoLinks: Record<string /* deadline id */, string /* repo fullName */>; notify: Record<ServiceId, boolean>; theme: 'dark' | 'light' }

export type SetTokenResult = { ok: true } | { ok: false; error: 'ENCRYPTION_UNAVAILABLE' }
export interface OpenTarget { service: ServiceId | 'app'; url?: string }
export interface TeamsNotificationPayload { title: string; body: string; tag: string }

/** API exposée au renderer par le preload sous `window.epihub`. */
export interface EpihubApi {
  snapshot(): Promise<{ [K in ServiceId]: ServiceSnapshot<K> }>
  refresh(id?: ServiceId): Promise<void>
  deadlines(): Promise<DeadlineView[]>
  search(query: string): Promise<SearchItem[]>
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  setGithubToken(token: string): Promise<SetTokenResult>
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
