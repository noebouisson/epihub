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
  /** `runId` sert de clé de déduplication de la notification. */
  notify(title: string, body: string, projectKey: string, runId: string): void
  projectKeyOf(p: MyProject): string
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

  async function generate(p: MyProject, key: string, runs: NonNullable<MyEpitechData['runs'][string]>, notify: boolean): Promise<void> {
    const [current, previous] = runs
    const detail = await deps.runDetail(current.id)
    const previousDetail = previous ? await deps.runDetail(previous.id).catch(() => null) : null
    const report = buildReport(current, detail, previous ? { summary: previous, detail: previousDetail } : undefined)
    const file = await writeMarkdown(report)
    const entry: ReportEntry = { runId: current.id, projectKey: key, projectId: p.id, file, score: report.score, verdict: report.verdict, date: report.date, generatedAt: Date.now() }
    deps.store.save(entry, report)
    deps.store.clearSilent(current.id)
    if (notify) {
      const delta = report.delta === null ? '' : ` (${report.delta >= 0 ? '+' : ''}${report.delta})`
      const score = report.score === null ? 'aucun test' : `${report.score} %`
      deps.notify(`${report.projectTitle} : ${score}${delta}`, 'Rapport prêt', key, current.id)
    }
  }

  /** Réécrit le .md d'un rapport dont l'écriture avait échoué. */
  async function retryWrite(entry: ReportEntry): Promise<void> {
    const report = deps.store.report(entry.runId)
    if (!report) return
    const file = await writeMarkdown(report)
    if (file) deps.store.save({ ...entry, file }, report)
  }

  async function run(data: MyEpitechData): Promise<void> {
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
        if (!existing) await generate(p, key, runs, wasInitialized && !deps.store.isSilent(runs[0].id))
        else if (existing.file === null) await retryWrite(existing)
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
  }

  let lock: Promise<void> = Promise.resolve()
  return {
    /** Générations sérialisées : deux appels simultanés ne produisent jamais de doublon. */
    process(data: MyEpitechData): Promise<void> {
      const next = lock.then(() => run(data))
      lock = next.catch(() => undefined)
      return next
    }
  }
}
