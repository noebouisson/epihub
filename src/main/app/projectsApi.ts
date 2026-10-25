import { buildProjects } from '../links/projects'
import { findProject } from '../../shared/projects'
import type { DeadlineView, ProjectDetail, ProjectSummary, ServiceId, Settings } from '../../shared/types'

export interface ProjectsApiDeps {
  snapshot(): Record<ServiceId, { data: any }>
  deadlines(data: Record<string, unknown>): Promise<DeadlineView[]>
  settings(): Settings
  details: { get(summary: ProjectSummary, force?: boolean): Promise<ProjectDetail> }
  now(): number
}

/** Liste et détail des projets, calculés à la demande à partir du dernier instantané des services. */
const MEMO_TTL = 3000

export interface ProjectsApi {
  list(): Promise<ProjectSummary[]>
  detail(key: unknown, force: unknown): Promise<ProjectDetail | null>
  /** Oublie la liste mémorisée (instantané ou réglages modifiés). */
  invalidate(): void
}

export function createProjectsApi(deps: ProjectsApiDeps): ProjectsApi {
  let memo: { at: number; promise: Promise<ProjectSummary[]> } | null = null

  async function compute(): Promise<ProjectSummary[]> {
    const s = deps.snapshot()
    const data = { github: s.github.data, intra: s.intra.data, myepitech: s.myepitech.data, teams: s.teams.data }
    return buildProjects({
      deadlines: await deps.deadlines(data),
      results: s.myepitech.data?.results ?? [],
      repos: s.github.data?.repos ?? [],
      settings: deps.settings(),
      now: new Date(deps.now())
    })
  }
  function list(): Promise<ProjectSummary[]> {
    if (memo && deps.now() - memo.at < MEMO_TTL) return memo.promise
    const entry = { at: deps.now(), promise: compute() }
    memo = entry
    // Une erreur n'est pas mémorisée.
    entry.promise.catch(() => {
      if (memo === entry) memo = null
    })
    return entry.promise
  }
  return {
    list,
    invalidate: () => {
      memo = null
    },
    async detail(key, force) {
      if (typeof key !== 'string') return null
      // Une clé intranet (accueil) ou un ancien alias ouvre le projet fusionné.
      const summary = findProject(await list(), key)
      return summary ? deps.details.get(summary, !!force) : null
    }
  }
}
