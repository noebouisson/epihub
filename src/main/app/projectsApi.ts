import { buildProjects } from '../links/projects'
import type { DeadlineView, ProjectDetail, ProjectSummary, ServiceId, Settings } from '../../shared/types'

export interface ProjectsApiDeps {
  snapshot(): Record<ServiceId, { data: any }>
  deadlines(data: Record<string, unknown>): Promise<DeadlineView[]>
  settings(): Settings
  details: { get(summary: ProjectSummary, force?: boolean): Promise<ProjectDetail> }
  now(): number
}

/** Liste et détail des projets, calculés à la demande à partir du dernier instantané des services. */
export function createProjectsApi(deps: ProjectsApiDeps): { list(): Promise<ProjectSummary[]>; detail(key: unknown, force: unknown): Promise<ProjectDetail | null> } {
  async function list(): Promise<ProjectSummary[]> {
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
  return {
    list,
    async detail(key, force) {
      if (typeof key !== 'string') return null
      const summary = (await list()).find((p) => p.key === key)
      return summary ? deps.details.get(summary, !!force) : null
    }
  }
}
