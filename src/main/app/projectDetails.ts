import { NeedsLoginError } from '../services/types'
import type { Commit, ProjectDetail, ProjectSummary, PullSummary, RepoActivity, ResultsData, Section, SkillReport, SubjectData, TestRun } from '../../shared/types'

const TTL = 5 * 60_000

export interface ProjectDetailsDeps {
  intra: { projectDetails(url: string): Promise<SubjectData> }
  github: { recentCommits(fullName: string, branch: string): Promise<Commit[]>; openPulls(fullName: string): Promise<PullSummary[]> }
  myepitech: { history(module: string, slug: string): Promise<TestRun[]>; runDetails(testRunId: string): Promise<SkillReport[]> }
  now(): number
}

type Sections = Omit<ProjectDetail, 'summary'>

const unavailable = <T>(): Section<T> => ({ state: 'unavailable', data: null })

/** Convertit un appel en section : une erreur n'affecte que sa section. */
async function section<T>(run: () => Promise<T>): Promise<Section<T>> {
  try {
    return { state: 'ok', data: await run() }
  } catch (err) {
    if (err instanceof NeedsLoginError) return { state: 'needs-login', data: null }
    return { state: 'error', data: null, message: err instanceof Error ? err.message : String(err) }
  }
}

export function createProjectDetails(deps: ProjectDetailsDeps): { get(summary: ProjectSummary, force?: boolean): Promise<ProjectDetail> } {
  // Ne stocke que les résultats de sections (jamais de jeton).
  const cache = new Map<string, { at: number; sections: Sections }>()

  async function load(s: ProjectSummary): Promise<Sections> {
    const { deadline, repo, lastResult } = s
    const [subject, repoSection, results] = await Promise.all([
      deadline ? section<SubjectData>(() => deps.intra.projectDetails(deadline.url)) : unavailable<SubjectData>(),
      repo
        ? section<RepoActivity>(async () => {
            const [commits, pulls] = await Promise.all([deps.github.recentCommits(repo.fullName, repo.defaultBranch), deps.github.openPulls(repo.fullName)])
            return { commits, pulls }
          })
        : unavailable<RepoActivity>(),
      lastResult
        ? section<ResultsData>(async () => {
            const runs = await deps.myepitech.history(lastResult.module, lastResult.slug)
            const last = runs[runs.length - 1]
            return { runs, latest: last ? await deps.myepitech.runDetails(last.id) : [] }
          })
        : unavailable<ResultsData>()
    ])
    return { subject, repo: repoSection, results }
  }

  return {
    async get(summary, force = false) {
      const hit = cache.get(summary.key)
      if (!force && hit && deps.now() - hit.at < TTL) return { summary, ...hit.sections }
      const sections = await load(summary)
      cache.set(summary.key, { at: deps.now(), sections })
      return { summary, ...sections }
    }
  }
}
