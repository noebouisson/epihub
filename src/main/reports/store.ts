import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Report, ReportEntry } from '../../shared/types'

/** Un identifiant de passage ne contient que des chiffres (il sert aussi de nom de fichier). */
export const validRunId = (v: unknown): v is string => typeof v === 'string' && /^\d+$/.test(v)

/** Écriture atomique : fichier temporaire puis renommage. */
export function atomicWrite(file: string, data: string | Uint8Array): void {
  writeFileSync(`${file}.tmp`, data, { mode: 0o600 })
  renameSync(`${file}.tmp`, file)
}

interface Index { initialized: boolean; entries: Record<string, ReportEntry>; /** Passages du lot initial dont la génération a échoué : jamais notifiés. */ silent: string[] }

const isEntry = (e: unknown): e is ReportEntry =>
  !!e && typeof e === 'object' && validRunId((e as ReportEntry).runId) && typeof (e as ReportEntry).projectKey === 'string' && typeof (e as ReportEntry).date === 'string'

export interface ReportStore {
  has(runId: string): boolean
  get(runId: string): ReportEntry | null
  list(projectKey: string): ReportEntry[]
  save(entry: ReportEntry, report: Report): void
  report(runId: string): Report | null
  isInitialized(): boolean
  markInitialized(): void
  isSilent(runId: string): boolean
  markSilent(runId: string): void
  clearSilent(runId: string): void
}

/** Index `<dir>/reports.json` et rapports `<dir>/reports/<runId>.json` (dir = userData). */
export function createReportStore(dir: string): ReportStore {
  const indexPath = join(dir, 'reports.json')
  const reportsDir = join(dir, 'reports')

  const load = (): Index => {
    try {
      const raw = JSON.parse(readFileSync(indexPath, 'utf8')) as Partial<Index>
      const entries: Record<string, ReportEntry> = {}
      for (const [k, e] of Object.entries(raw.entries ?? {})) if (isEntry(e) && e.runId === k) entries[k] = e
      const silent = Array.isArray(raw.silent) ? raw.silent.filter(validRunId) : []
      return { initialized: raw.initialized === true, entries, silent }
    } catch {
      return { initialized: false, entries: {}, silent: [] }
    }
  }
  let index = load()
  /** L'index en mémoire n'est remplacé qu'une fois l'écriture réussie. */
  const commit = (next: Index): void => {
    mkdirSync(dir, { recursive: true })
    atomicWrite(indexPath, JSON.stringify(next))
    index = next
  }

  return {
    has: (runId) => runId in index.entries,
    get: (runId) => index.entries[runId] ?? null,
    list: (projectKey) => Object.values(index.entries).filter((e) => e.projectKey === projectKey).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    save(entry, report) {
      if (!validRunId(entry.runId)) throw new Error('runId invalide')
      mkdirSync(reportsDir, { recursive: true })
      atomicWrite(join(reportsDir, `${entry.runId}.json`), JSON.stringify(report))
      commit({ ...index, entries: { ...index.entries, [entry.runId]: entry } })
    },
    report(runId) {
      if (!validRunId(runId)) return null
      try {
        return JSON.parse(readFileSync(join(reportsDir, `${runId}.json`), 'utf8')) as Report
      } catch {
        return null
      }
    },
    isInitialized: () => index.initialized,
    markInitialized() {
      commit({ ...index, initialized: true })
    },
    isSilent: (runId) => index.silent.includes(runId),
    markSilent(runId) {
      if (validRunId(runId) && !index.silent.includes(runId)) commit({ ...index, silent: [...index.silent, runId] })
    },
    clearSilent(runId) {
      if (index.silent.includes(runId)) commit({ ...index, silent: index.silent.filter((r) => r !== runId) })
    }
  }
}
