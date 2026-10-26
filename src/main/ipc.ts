import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ImportSubjectResult, PlanSummary, PlanView, Report, ReportEntry, ProjectDetail, ProjectSummary, ServiceId, Settings, TeamsNotificationPayload } from '../shared/types'
import { clip, TEAMS_DEDUP_TTL, teamsKey } from './app/effects'
import { buildSearchItems, search } from './links/searchIndex'
import { shareText } from './links/shareText'
import type { PlanAssembler } from './plan/assemble'
import { MAX_PDF_BYTES, extractPdfText } from './plan/pdfText'
import { renderPlanMarkdown } from './plan/markdown'
import { sanitizeKey, validItemId, type PlanStore } from './plan/store'
import { parseSubject } from './plan/subject'
import { isInsideDir, pdfPathFor } from './reports/pipeline'
import { latestReportsFor, reportsForKey } from './reports/query'
import { validRunId, type ReportStore } from './reports/store'
import { refreshArgs } from './ipcArgs'
import { isTrustedSender } from './securityPolicy'
import type { RefreshOptions } from './services/types'
import { sanitizeSettingsPatch } from './store/settings'


export interface IpcDeps {
  registry: { refresh(id?: ServiceId, opts?: RefreshOptions): Promise<void>; snapshot(): Record<ServiceId, { data: unknown }> }
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
  plan: {
    store: PlanStore
    assembler: PlanAssembler
    /** `<Documents>/EpiHub/plans` */
    dir: string
    /** Sélecteur de PDF rattaché à la fenêtre principale ; null si annulé. */
    choosePdf(): Promise<string | null>
    now(): Date
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
  handle('epihub:refresh', (_e, id?: unknown, opts?: unknown) => {
    const a = refreshArgs(id, opts)
    return deps.registry.refresh(a.id, a.opts)
  })
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

  handle('epihub:reports', async (_e, key: unknown): Promise<ReportEntry[]> => {
    if (typeof key !== 'string') return []
    const projects = await deps.projects.list().catch(() => [])
    return reportsForKey(deps.reports.store, projects, key)
  })
  handle('epihub:latestReports', async (): Promise<Record<string, ReportEntry>> =>
    latestReportsFor(deps.reports.store, await deps.projects.list().catch(() => []))
  )
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

  const planErr = (err: unknown): string => {
    // Seuls nos propres messages (PDF illisible, trop gros…) sont montrés ; jamais le contenu du sujet.
    const m = err instanceof Error ? err.message : ''
    return ['PDF illisible', 'PDF trop gros', 'PDF trop long', 'Ce PDF ne contient pas de texte lisible'].includes(m) ? m : 'Import impossible'
  }
  handle('epihub:subject:import', async (_e, key: unknown): Promise<ImportSubjectResult> => {
    const k = await deps.plan.assembler.canonicalKey(key)
    if (!k) return { ok: false, error: 'Projet introuvable' }
    const file = await deps.plan.choosePdf()
    if (!file) return { ok: false, error: 'annulé' }
    try {
      if ((await stat(file)).size > MAX_PDF_BYTES) return { ok: false, error: 'PDF trop gros' }
      const pdf = new Uint8Array(await readFile(file))
      const text = await extractPdfText(pdf)
      deps.plan.store.saveSubject(k, basename(file), pdf, text, parseSubject(text))
      return { ok: true }
    } catch (err) {
      console.error('[epihub] import du sujet:', planErr(err))
      return { ok: false, error: planErr(err) }
    }
  })
  handle('epihub:subject:remove', async (_e, key: unknown): Promise<void> => {
    const k = await deps.plan.assembler.canonicalKey(key)
    if (k) deps.plan.store.removeSubject(k)
  })
  handle('epihub:plan:get', async (_e, key: unknown): Promise<PlanView | null> => (typeof key === 'string' ? deps.plan.assembler.view(key) : null))
  handle('epihub:plan:toggle', async (_e, key: unknown, itemId: unknown, done: unknown): Promise<string[]> => {
    const k = await deps.plan.assembler.canonicalKey(key)
    if (!k || !validItemId(itemId) || typeof done !== 'boolean') return []
    return deps.plan.store.toggle(k, itemId, done)
  })
  handle('epihub:plan:summaries', (): Promise<Record<string, PlanSummary>> => deps.plan.assembler.summaries())
  handle('epihub:plan:export', async (_e, key: unknown): Promise<string | null> => {
    const view = typeof key === 'string' ? await deps.plan.assembler.view(key) : null
    if (!view?.subject) return null
    const out = join(deps.plan.dir, `${sanitizeKey(view.unitCode)}-${sanitizeKey(view.title)}.md`)
    if (!isInsideDir(out, deps.plan.dir)) return null
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, renderPlanMarkdown({ title: view.title, unitCode: view.unitCode, info: view.subject.info, steps: view.steps, done: view.done, improvements: view.improvements, now: deps.plan.now() }), 'utf8')
    deps.reports.showItemInFolder(out)
    return out
  })
}
