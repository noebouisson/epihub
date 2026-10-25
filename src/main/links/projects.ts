import { isTeamsUrl, projectKey, resolveLink } from '../../shared/projects'
import type { DeadlineView, MyProject, ProjectSummary, Repo, RunSummary, Settings } from '../../shared/types'
import { matchRepo, normalize } from './repoMatcher'

export interface BuildProjectsInput {
  /** Vues de rendu (`effects.deadlines`), id `mye-<projectId>`. */
  deadlines: DeadlineView[]
  projects: MyProject[]
  /** Passages par id de projet, du plus récent au plus ancien. */
  runs: Record<string, RunSummary[]>
  repos: Repo[]
  settings: Pick<Settings, 'repoLinks' | 'projectRepoLinks' | 'projectTeamsLinks'>
  now: Date
}

const time = (iso: string): number => Date.parse(iso)

interface Entry { project: MyProject; deadline: DeadlineView | null; lastResult: RunSummary | null; aliases: string[] }

function resolveRepo(p: ProjectSummary, repos: Repo[], settings: BuildProjectsInput['settings']): Repo | null {
  const byName = (fullName: string | null | undefined): Repo | null => (fullName ? (repos.find((r) => r.fullName === fullName) ?? null) : null)
  const d = p.deadline
  const linked = byName(resolveLink(settings.projectRepoLinks, p, (v) => repos.some((r) => r.fullName === v))) ?? (d ? byName(settings.repoLinks[d.id]) : null)
  if (linked) return linked
  if (d?.repo) return d.repo
  return matchRepo({ id: p.key, moduleCode: p.moduleCode, projectCode: normalize(p.title), title: p.title, end: '', url: '' }, repos, {}).repo
}

/**
 * Projets My Epitech inscrits. Clé canonique `projectKey(unitCode, nom)` ; les codes projet des passages
 * donnent des alias (association repo, anciens liens). Deux projets de même clé : celui qui finit le plus
 * tard l'emporte, les alias sont réunis.
 */
export function buildProjects({ deadlines, projects, runs, repos, settings, now }: BuildProjectsInput): ProjectSummary[] {
  const byDeadlineId = new Map(deadlines.map((d) => [d.id, d]))
  const entries = new Map<string, Entry>()

  for (const project of projects) {
    const key = projectKey(project.unitCode, project.name)
    const list = runs[project.id] ?? []
    const aliases = [key]
    for (const r of list) {
      const k = projectKey(r.unitCode, r.projectCode)
      if (!aliases.includes(k)) aliases.push(k)
    }
    const d = byDeadlineId.get(`mye-${project.id}`)
    const entry: Entry = { project, deadline: d && time(project.end) > now.getTime() ? d : null, lastResult: list[0] ?? null, aliases }
    const known = entries.get(key)
    if (!known) entries.set(key, entry)
    else {
      const winner = time(project.end) > time(known.project.end) ? entry : known
      const loser = winner === entry ? known : entry
      for (const k of loser.aliases) if (!winner.aliases.includes(k)) winner.aliases.push(k)
      entries.set(key, winner)
    }
  }

  const out: ProjectSummary[] = [...entries.entries()].map(([key, e]) => {
    const summary: ProjectSummary = {
      key,
      aliases: e.aliases,
      projectId: e.project.id,
      title: e.project.name,
      moduleCode: e.project.unitCode,
      deadline: e.deadline,
      lastResult: e.lastResult,
      repo: null,
      teamsUrl: null,
      status: e.deadline ? 'en-cours' : 'termine'
    }
    summary.repo = resolveRepo(summary, repos, settings)
    summary.teamsUrl = resolveLink(settings.projectTeamsLinks, summary, isTeamsUrl)
    return summary
  })
  const endOf = new Map([...entries.entries()].map(([k, e]) => [k, time(e.project.end) || -Infinity]))
  const resultTime = (p: ProjectSummary): number => (p.lastResult ? time(p.lastResult.date) : -Infinity)
  const active = out.filter((p) => p.status === 'en-cours').sort((a, b) => time(a.deadline!.end) - time(b.deadline!.end))
  const done = out.filter((p) => p.status === 'termine').sort((a, b) => resultTime(b) - resultTime(a) || endOf.get(b.key)! - endOf.get(a.key)!)
  return [...active, ...done]
}
