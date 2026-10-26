import { findProject } from '../../shared/projects'
import type { PlanStep, PlanSummary, PlanView, ProjectSummary, Report, RepoCheck, SubjectInfo } from '../../shared/types'
import { evaluateRepo, improvements } from './improvements'
import { buildPlan, planStatus } from './plan'
import type { PlanStore } from './store'

const REPO_TTL = 10 * 60_000

export interface PlanAssemblerDeps {
  store: Pick<PlanStore, 'getSubject' | 'done'>
  projects(): Promise<ProjectSummary[]>
  latestReport(key: string): Report | null
  rootContents?(fullName: string): Promise<{ name: string; type: 'file' | 'dir' }[]>
  hasGithubToken(): boolean
  now(): Date
}

export interface PlanAssembler {
  /** Projet en cours désigné par sa clé canonique ou un alias ; sinon null. */
  project(key: unknown): Promise<ProjectSummary | null>
  /** Clé canonique d'un projet en cours (sous laquelle tout est stocké), ou null. */
  canonicalKey(key: unknown): Promise<string | null>
  view(key: string): Promise<PlanView | null>
  summaries(): Promise<Record<string, PlanSummary>>
}

export function createPlanAssembler(deps: PlanAssemblerDeps): PlanAssembler {
  /** Racine des dépôts, en cache 10 min ; un échec n'est pas mémorisé. */
  const entriesCache = new Map<string, { at: number; entries: { name: string; type: 'file' | 'dir' }[] }>()

  async function repoEntries(fullName: string): Promise<{ name: string; type: 'file' | 'dir' }[] | null> {
    const hit = entriesCache.get(fullName)
    if (hit && deps.now().getTime() - hit.at < REPO_TTL) return hit.entries
    if (!deps.rootContents) return null
    try {
      const entries = await deps.rootContents(fullName)
      entriesCache.set(fullName, { at: deps.now().getTime(), entries })
      return entries
    } catch {
      return null
    }
  }

  async function project(key: unknown): Promise<ProjectSummary | null> {
    if (typeof key !== 'string') return null
    const p = findProject(await deps.projects(), key)
    return p && p.status === 'en-cours' ? p : null
  }

  function stepsFor(p: ProjectSummary, info: SubjectInfo | null): PlanStep[] {
    return info ? buildPlan(info, { start: null, end: p.deadline?.end ?? null, now: deps.now() }) : []
  }

  return {
    project,
    async canonicalKey(key) {
      return (await project(key))?.key ?? null
    },
    async view(key) {
      const p = await project(key)
      if (!p) return null
      const stored = deps.store.getSubject(p.key)
      const info = stored?.info ?? null
      const steps = stepsFor(p, info)
      const ids = new Set(steps.flatMap((s) => s.items.map((i) => i.id)))
      // Après un réimport, les items disparus du plan sont ignorés.
      const done = deps.store.done(p.key).filter((id) => ids.has(id))
      const now = deps.now()

      let repo: RepoCheck | null | 'not-linked' = 'not-linked'
      if (p.repo && deps.hasGithubToken()) {
        const entries = await repoEntries(p.repo.fullName)
        repo = entries ? evaluateRepo(entries, p.repo.pushedAt, info?.binaryName ?? null) : null
      }
      return {
        projectKey: p.key,
        title: p.title,
        unitCode: p.moduleCode,
        end: p.deadline?.end ?? null,
        subject: stored ? { fileName: stored.fileName, importedAt: stored.importedAt, info: stored.info } : null,
        steps,
        done,
        status: planStatus(steps, done, now),
        improvements: improvements({ info, steps, done, report: deps.latestReport(p.key), repo, end: p.deadline?.end ?? null, now })
      }
    },
    async summaries() {
      const out: Record<string, PlanSummary> = {}
      const now = deps.now()
      for (const p of await deps.projects()) {
        if (p.status !== 'en-cours') continue
        const stored = deps.store.getSubject(p.key)
        if (!stored) {
          out[p.key] = { hasSubject: false, current: null, late: false, progress: 0 }
          continue
        }
        const steps = stepsFor(p, stored.info)
        const st = planStatus(steps, deps.store.done(p.key), now)
        out[p.key] = { hasSubject: true, current: st.current ? { title: st.current.title, target: st.current.target } : null, late: st.late.length > 0, progress: st.progress }
      }
      return out
    }
  }
}
