import { findProject, type ProjectKeys } from '../../shared/projects'
import type { ReportEntry } from '../../shared/types'
import type { ReportStore } from './store'

/** Rapports d'un projet ouvert par sa clé canonique ou un alias (les rapports sont indexés sous la clé canonique). */
export function reportsForKey(store: Pick<ReportStore, 'list'>, projects: ProjectKeys[], key: string): ReportEntry[] {
  const p = findProject(projects, key)
  return store.list(p ? p.key : key)
}
