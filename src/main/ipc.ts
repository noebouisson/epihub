import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { Report, ReportEntry, ProjectDetail, ProjectSummary, ServiceId, Settings, TeamsNotificationPayload } from '../shared/types'
import { clip, TEAMS_DEDUP_TTL, teamsKey } from './app/effects'
import { buildSearchItems, search } from './links/searchIndex'
import { shareText } from './links/shareText'
import { isInsideDir, pdfPathFor } from './reports/pipeline'
import { validRunId, type ReportStore } from './reports/store'
import { isTrustedSender } from './securityPolicy'
import { sanitizeSettingsPatch } from './store/settings'

const SERVICE_IDS: readonly ServiceId[] = ['github', 'intra', 'myepitech', 'teams']
const isServiceId = (v: unknown): v is ServiceId => SERVICE_IDS.includes(v as ServiceId)

export interface IpcDeps {
  registry: { refresh(id?: ServiceId): Promise<void>; snapshot(): Record<ServiceId, { data: unknown }> }
  effects: { deadlines(data: Record<string, unknown>): Promise<unknown> }
  projects: { invalidate(): void; list(): Promise<ProjectSummary[]>; detail(key: unknown, force: unknown): Promise<ProjectDetail | null> }
  settings: { get(): Settings; update(patch: Partial<Settings>): Settings }
  secrets: { setGithubToken(t: string): void; clearGithubToken(): void }
  hub: { push(key: string, service: ServiceId, title: string, body: string, url?: string, ttlMs?: number): boolean }
  teams: { onTitle(t: string): boolean; onNavigate(u: string): boolean }
  reports: {
    store: ReportStore
    /** `<Documents>/EpiHub/rapports` */
    dir: string
    openPath(path: string): Promise<string>
    showItemInFolder(path: string): void
    exportPdf(report: Report, outFile: string): Promise<void>
  }
  writeClipboard(text: string): void
  refreshTeams(): void
  teamsPreloadPath: string
  /** id du webContents de la fenêtre principale (seul expéditeur accepté). */
  mainWebContentsId(): number | undefined
}

const dataOf = (deps: IpcDeps): Record<ServiceId, any> => {
  const s = deps.registry.snapshot()
  return { github: s.github.data, intra: s.intra.data, myepitech: s.myepitech.data, teams: s.teams.data }
}

export function registerIpc(deps: IpcDeps): void {
  /** ipcMain.handle avec vérification de l'expéditeur : cadre principal de la fenêtre principale. */
  const handle = (channel: string, fn: (e: IpcMainInvokeEvent, ...args: any[]) => unknown): void => {
    ipcMain.handle(channel, (e, ...args) => {
      const top = !!e.senderFrame && e.senderFrame === e.sender.mainFrame
      if (!isTrustedSender(e.sender.id, deps.mainWebContentsId(), top)) throw new Error('Expéditeur IPC refusé')
      return fn(e, ...args)
    })
  }

  handle('epihub:snapshot', () => deps.registry.snapshot())
  handle('epihub:refresh', (_e, id?: unknown) => deps.registry.refresh(isServiceId(id) ? id : undefined))
  handle('epihub:deadlines', () => deps.effects.deadlines(dataOf(deps)))
  handle('epihub:projects', () => deps.projects.list())
  handle('epihub:project', (_e, key: unknown, force: unknown) => deps.projects.detail(key, force))
  handle('epihub:search', async (_e, query: unknown) =>
    search(buildSearchItems(dataOf(deps), await deps.projects.list().catch((err: unknown) => {
        console.error('[epihub] projects:', err instanceof Error ? err.message : String(err))
        return []
      })), typeof query === 'string' ? query : '')
  )
  handle('epihub:teamsPreloadPath', () => deps.teamsPreloadPath)
  handle('epihub:settings:get', () => deps.settings.get())
  handle('epihub:settings:update', (_e, patch: unknown) => {
    const next = deps.settings.update(sanitizeSettingsPatch(patch))
    deps.projects.invalidate()
    return next
  })

  handle('epihub:github:setToken', (_e, token: unknown) => {
    if (typeof token !== 'string' || !token.trim()) return { ok: false, error: 'ENCRYPTION_UNAVAILABLE' as const }
    try {
      deps.secrets.setGithubToken(token.trim())
    } catch {
      return { ok: false, error: 'ENCRYPTION_UNAVAILABLE' as const }
    }
    void deps.registry.refresh('github')
    return { ok: true as const }
  })
  handle('epihub:github:clearToken', () => {
    deps.secrets.clearGithubToken()
    void deps.registry.refresh('github')
  })

  handle('epihub:share', (_e, item: { title: string; url: string; context?: string }) => {
    const text = shareText({ title: String(item?.title ?? ''), url: String(item?.url ?? ''), context: item?.context === undefined ? undefined : String(item.context) })
    deps.writeClipboard(text)
    return text
  })

  // Rafraîchissement Teams seulement si le nombre de non-lus ou l'état de connexion change.
  handle('epihub:teams:title', (_e, title: unknown) => {
    if (typeof title === 'string' && deps.teams.onTitle(title)) deps.refreshTeams()
  })
  handle('epihub:teams:navigate', (_e, url: unknown) => {
    if (typeof url === 'string' && deps.teams.onNavigate(url)) deps.refreshTeams()
  })
  // Charge utile issue de la page Teams (non fiable) : types vérifiés et longueurs plafonnées.
  handle('epihub:teams:notification', (_e, n: Partial<TeamsNotificationPayload>) => {
    const title = clip(n?.title)
    const body = clip(n?.body)
    const tag = clip(n?.tag)
    deps.hub.push(teamsKey(title, body, tag), 'teams', title, body, undefined, TEAMS_DEDUP_TTL)
  })

  handle('epihub:reports', (_e, key: unknown): ReportEntry[] => (typeof key === 'string' ? deps.reports.store.list(key) : []))
  handle('epihub:report', (_e, runId: unknown): Report | null => (validRunId(runId) ? deps.reports.store.report(runId) : null))
  handle('epihub:openReportFile', async (_e, runId: unknown): Promise<boolean> => {
    if (!validRunId(runId)) return false
    const file = deps.reports.store.get(runId)?.file
    if (!file || !isInsideDir(file, deps.reports.dir)) return false
    return (await deps.reports.openPath(file)) === ''
  })
  handle('epihub:exportReportPdf', async (_e, runId: unknown): Promise<string | null> => {
    if (!validRunId(runId)) return null
    const report = deps.reports.store.report(runId)
    if (!report) return null
    const out = pdfPathFor(report, deps.reports.dir)
    if (!isInsideDir(out, deps.reports.dir)) return null
    await mkdir(dirname(out), { recursive: true })
    await deps.reports.exportPdf(report, out)
    deps.reports.showItemInFolder(out)
    return out
  })
}
