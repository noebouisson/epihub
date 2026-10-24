import { isTeamsUrl, projectKey } from '../../shared/projects'
import type { DeadlineView, ProjectSummary, Repo, Settings, TestResult } from '../../shared/types'
import { matchRepo, normalize } from './repoMatcher'

export interface BuildProjectsInput {
  deadlines: DeadlineView[]
  results: TestResult[]
  repos: Repo[]
  settings: Pick<Settings, 'repoLinks' | 'projectRepoLinks' | 'projectTeamsLinks'>
  now: Date
}

const time = (iso: string): number => Date.parse(iso)

function resolveRepo(key: string, d: DeadlineView | null, title: string, moduleCode: string, repos: Repo[], settings: BuildProjectsInput['settings']): Repo | null {
  const byName = (fullName: string | undefined): Repo | null => (fullName ? (repos.find((r) => r.fullName === fullName) ?? null) : null)
  const linked = byName(settings.projectRepoLinks[key]) ?? (d ? byName(settings.repoLinks[d.id]) : null)
  if (linked) return linked
  if (d?.repo) return d.repo
  return matchRepo({ id: key, moduleCode, projectCode: normalize(title), title, end: '', url: '' }, repos, {}).repo
}

export function buildProjects({ deadlines, results, repos, settings, now }: BuildProjectsInput): ProjectSummary[] {
  const byKey = new Map<string, { title: string; moduleCode: string; deadline: DeadlineView | null; lastResult: TestResult | null }>()

  for (const d of deadlines) {
    const key = projectKey(d.moduleCode, d.title)
    byKey.set(key, { title: d.title, moduleCode: d.moduleCode, deadline: d, lastResult: byKey.get(key)?.lastResult ?? null })
  }
  for (const r of results) {
    const key = projectKey(r.module, r.project)
    const entry = byKey.get(key) ?? { title: r.project, moduleCode: r.module, deadline: null, lastResult: null }
    if (!entry.lastResult || time(r.date) > time(entry.lastResult.date)) entry.lastResult = r
    byKey.set(key, entry)
  }

  const projects: ProjectSummary[] = [...byKey].map(([key, e]) => {
    const teams = settings.projectTeamsLinks[key]
    return {
      key,
      title: e.title,
      moduleCode: e.moduleCode,
      deadline: e.deadline,
      lastResult: e.lastResult,
      repo: resolveRepo(key, e.deadline, e.title, e.moduleCode, repos, settings),
      teamsUrl: teams && isTeamsUrl(teams) ? teams : null,
      status: e.deadline && time(e.deadline.end) > now.getTime() ? 'en-cours' : 'termine'
    }
  })

  const resultTime = (p: ProjectSummary): number => (p.lastResult ? time(p.lastResult.date) : -Infinity)
  const active = projects.filter((p) => p.status === 'en-cours').sort((a, b) => time(a.deadline!.end) - time(b.deadline!.end))
  const done = projects.filter((p) => p.status === 'termine').sort((a, b) => resultTime(b) - resultTime(a))
  return [...active, ...done]
}
