import { isTeamsUrl, projectKey, resolveLink } from '../../shared/projects'
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

interface Entry { title: string; moduleCode: string; deadline: DeadlineView | null; lastResult: TestResult | null; aliases: string[] }

function resolveRepo(p: Entry & { key: string }, repos: Repo[], settings: BuildProjectsInput['settings']): Repo | null {
  const byName = (fullName: string | null | undefined): Repo | null => (fullName ? (repos.find((r) => r.fullName === fullName) ?? null) : null)
  const d = p.deadline
  const linked = byName(resolveLink(settings.projectRepoLinks, p, (v) => repos.some((r) => r.fullName === v))) ?? (d ? byName(settings.repoLinks[d.id]) : null)
  if (linked) return linked
  if (d?.repo) return d.repo
  return matchRepo({ id: p.key, moduleCode: p.moduleCode, projectCode: normalize(p.title), title: p.title, end: '', url: '' }, repos, {}).repo
}

/** Clé du résultat My Epitech : celle du slug (repli sur le nom pour un ancien cache sans slug). */
const resultKey = (r: TestResult): string => projectKey(r.module, r.slug || r.project)

/**
 * Fusionne les rendus intranet et les résultats My Epitech. Un résultat rejoint un rendu du même module
 * si le titre intranet compacté vaut son slug ou son nom compacté ; chaque projet garde toutes ses clés en alias.
 */
export function buildProjects({ deadlines, results, repos, settings, now }: BuildProjectsInput): ProjectSummary[] {
  const entries: Entry[] = []
  const index = new Map<string, Entry>()
  const addAlias = (e: Entry, k: string): void => {
    if (!e.aliases.includes(k)) e.aliases.push(k)
    if (!index.has(k)) index.set(k, e)
  }

  for (const d of deadlines) {
    const k = projectKey(d.moduleCode, d.title)
    const known = index.get(k)
    if (known) known.deadline = d
    else {
      const e: Entry = { title: d.title, moduleCode: d.moduleCode, deadline: d, lastResult: null, aliases: [] }
      entries.push(e)
      addAlias(e, k)
    }
  }
  for (const r of results) {
    const slugKey = resultKey(r)
    const nameKey = projectKey(r.module, r.project)
    let e = index.get(slugKey) ?? index.get(nameKey)
    if (!e) {
      e = { title: r.project, moduleCode: r.module, deadline: null, lastResult: null, aliases: [] }
      entries.push(e)
    }
    addAlias(e, slugKey)
    addAlias(e, nameKey)
    if (!e.lastResult || time(r.date) > time(e.lastResult.date)) e.lastResult = r
  }

  const projects: ProjectSummary[] = entries.map((e) => {
    const key = e.lastResult ? resultKey(e.lastResult) : e.aliases[0]
    const p = { ...e, key }
    return {
      key,
      aliases: e.aliases,
      title: e.title,
      moduleCode: e.moduleCode,
      deadline: e.deadline,
      lastResult: e.lastResult,
      repo: resolveRepo(p, repos, settings),
      teamsUrl: resolveLink(settings.projectTeamsLinks, p, isTeamsUrl),
      status: e.deadline && time(e.deadline.end) > now.getTime() ? 'en-cours' : 'termine'
    }
  })
  const resultTime = (p: ProjectSummary): number => (p.lastResult ? time(p.lastResult.date) : -Infinity)
  const active = projects.filter((p) => p.status === 'en-cours').sort((a, b) => time(a.deadline!.end) - time(b.deadline!.end))
  const done = projects.filter((p) => p.status === 'termine').sort((a, b) => resultTime(b) - resultTime(a))
  return [...active, ...done]
}
