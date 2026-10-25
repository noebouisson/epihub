import { findProject, type ProjectKeys } from '../../shared/projects'
import type { ReportEntry, RunSummary } from '../../shared/types'
import type { ReportStore } from './store'

/** Rapports d'un projet ouvert par sa clé canonique ou un alias (les rapports sont indexés sous la clé canonique). */
export function reportsForKey(store: Pick<ReportStore, 'list'>, projects: ProjectKeys[], key: string): ReportEntry[] {
  const p = findProject(projects, key)
  return store.list(p ? p.key : key)
}

/** Entrée de rapport du dernier passage de chaque projet (clé canonique → entrée), pour afficher le même verdict que le rapport. */
export function latestReportsFor(store: Pick<ReportStore, 'get'>, projects: (ProjectKeys & { lastResult: Pick<RunSummary, 'id'> | null })[]): Record<string, ReportEntry> {
  const out: Record<string, ReportEntry> = {}
  for (const p of projects) {
    const e = p.lastResult ? store.get(p.lastResult.id) : null
    if (e) out[p.key] = e
  }
  return out
}
