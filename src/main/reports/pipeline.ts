import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { MyEpitechData, MyProject, Report, ReportEntry, RunDetail } from '../../shared/types'
import { NeedsLoginError } from '../services/types'
import { buildReport } from './analyze'
import { renderMarkdown, reportPath } from './markdown'
import type { ReportStore } from './store'

export interface PipelineDeps {
  runDetail(id: string): Promise<RunDetail>
  store: ReportStore
  docsDir: string
  writeFile(path: string, data: string): Promise<void>
  mkdir(path: string): Promise<void>
  /**
   * `dedupKey` : id du passage (ou des passages groupés) pour la déduplication.
   * `projectKey` null : notification groupée (ouvre le tableau de bord).
   */
  notify(title: string, body: string, projectKey: string | null, dedupKey: string): void
  projectKeyOf(p: MyProject): string
  now?(): number
}

/** Un passage plus ancien n'est pas notifié (le rapport est quand même généré). */
export const NOTIFY_MAX_AGE_MS = 7 * 864e5
/** Au-delà, une seule notification groupée. */
export const MAX_SINGLE_NOTIFICATIONS = 3

export interface PendingNotification { title: string; projectKey: string; runId: string; date: string }

/** Notifications à envoyer pour un passage du lot : anciennes écartées, regroupées au-delà de 3. */
export function planNotifications(pending: PendingNotification[], now: number): { title: string; body: string; projectKey: string | null; dedupKey: string }[] {
  const fresh = pending.filter((n) => {
    const t = Date.parse(n.date)
    return !Number.isNaN(t) && now - t <= NOTIFY_MAX_AGE_MS
  })
  if (fresh.length > MAX_SINGLE_NOTIFICATIONS) {
    return [{ title: `${fresh.length} nouveaux résultats de moulinette`, body: 'Rapports prêts', projectKey: null, dedupKey: fresh.map((n) => n.runId).join(',') }]
  }
  return fresh.map((n) => ({ title: n.title, body: 'Rapport prêt', projectKey: n.projectKey, dedupKey: n.runId }))
}

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** `file` est strictement à l'intérieur de `dir` (chemins normalisés). */
export function isInsideDir(file: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(file))
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}

export const rapportsDir = (docsDir: string): string => join(docsDir, 'EpiHub', 'rapports')

/** Chemin du PDF : à côté de l'emplacement du .md (même nom, extension .pdf). */
export function pdfPathFor(r: Report, reportsRoot: string): string {
  const { dir, file } = reportPath(r)
  return join(reportsRoot, dir, file.replace(/\.md$/, '.pdf'))
}

export function createReportPipeline(deps: PipelineDeps) {
  const root = rapportsDir(deps.docsDir)

  /** Écrit le .md ; renvoie son chemin, ou null en cas d'échec (message seul journalisé). */
  async function writeMarkdown(r: Report): Promise<string | null> {
    const { dir, file } = reportPath(r)
    try {
      await deps.mkdir(join(root, dir))
      const path = join(root, dir, file)
      await deps.writeFile(path, renderMarkdown(r))
      return path
    } catch (err) {
      console.error('[epihub] rapport (écriture):', errMsg(err))
      return null
    }
  }

  /** Génère et enregistre le rapport ; renvoie la notification à prévoir (ou null). */
  async function generate(p: MyProject, key: string, runs: NonNullable<MyEpitechData['runs'][string]>, notify: boolean): Promise<PendingNotification | null> {
    const [current, previous] = runs
    const detail = await deps.runDetail(current.id)
    const previousDetail = previous ? await deps.runDetail(previous.id).catch(() => null) : null
    const report = buildReport(current, detail, previous ? { summary: previous, detail: previousDetail } : undefined)
    const file = await writeMarkdown(report)
    const entry: ReportEntry = { runId: current.id, projectKey: key, projectId: p.id, file, score: report.score, verdict: report.verdict, date: report.date, generatedAt: Date.now() }
    deps.store.save(entry, report)
    deps.store.clearSilent(current.id)
    if (!notify) return null
    const delta = report.delta === null ? '' : ` (${report.delta >= 0 ? '+' : ''}${report.delta})`
    const score = report.score === null ? 'aucun test' : `${report.score} %`
    return { title: `${report.projectTitle} : ${score}${delta}`, projectKey: key, runId: current.id, date: report.date }
  }

  /** Réécrit le .md d'un rapport dont l'écriture avait échoué. */
  async function retryWrite(entry: ReportEntry): Promise<boolean> {
    const report = deps.store.report(entry.runId)
    if (!report) return false
    const file = await writeMarkdown(report)
    if (!file) return false
    deps.store.save({ ...entry, file }, report)
    return true
  }

  /** Renvoie le nombre de rapports enregistrés (nouveaux ou réécrits). */
  async function run(data: MyEpitechData): Promise<number> {
    let saved = 0
    const pending: PendingNotification[] = []
    const wasInitialized = deps.store.isInitialized()
    let sawRuns = false
    let needsLogin = false
    for (const p of data.projects) {
      const runs = data.runs[p.id]
      if (!runs || runs.length === 0) continue
      sawRuns = true
      const key = deps.projectKeyOf(p)
      try {
        const existing = deps.store.get(runs[0].id)
        if (!existing) {
          const n = await generate(p, key, runs, wasInitialized && !deps.store.isSilent(runs[0].id))
          saved++
          if (n) pending.push(n)
        } else if (existing.file === null && (await retryWrite(existing))) saved++
      } catch (err) {
        // Déconnecté : on arrête le lot ; les projets restants seront traités (sans pause silencieuse) au prochain passage.
        if (err instanceof NeedsLoginError) {
          needsLogin = true
          break
        }
        // Échec pendant le lot initial : ce passage ne sera jamais notifié, même généré plus tard.
        if (!wasInitialized) {
          try { deps.store.markSilent(runs[0].id) } catch { /* index illisible : déjà journalisé ci-dessous */ }
        }
        console.error('[epihub] rapport:', errMsg(err))
      }
    }
    // Lot initial interrompu par la déconnexion : il reprendra (toujours sans notification) au prochain passage.
    if (!wasInitialized && sawRuns && !needsLogin) deps.store.markInitialized()
    for (const n of planNotifications(pending, (deps.now ?? Date.now)())) deps.notify(n.title, n.body, n.projectKey, n.dedupKey)
    return saved
  }

  let lock: Promise<unknown> = Promise.resolve()
  return {
    /** Générations sérialisées : deux appels simultanés ne produisent jamais de doublon. */
    process(data: MyEpitechData): Promise<number> {
      const next = lock.then(() => run(data))
      lock = next.catch(() => undefined)
      return next
    }
  }
}
