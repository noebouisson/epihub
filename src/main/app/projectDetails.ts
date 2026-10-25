import { NeedsLoginError } from '../services/types'
import { scoreOf } from '../../shared/score'
import type { Commit, MyEpitechData, ProjectDetail, ProjectSummary, PullSummary, RepoActivity, ResultsData, RunDetail, Section, SkillReport, SubjectData, TestRun } from '../../shared/types'

const TTL = 5 * 60_000

export interface ProjectDetailsDeps {
  github: { recentCommits(fullName: string, branch: string): Promise<Commit[]>; openPulls(fullName: string): Promise<PullSummary[]> }
  /** `data()` : dernières données My Epitech (projets et passages) ; `runDetail` : détail d'un passage. */
  myepitech: { data(): MyEpitechData | null; runDetail(runId: string): Promise<RunDetail> }
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

/** Détail d'un passage → compétences affichées par la page projet. */
export function skillReports(detail: RunDetail): SkillReport[] {
  return detail.categories.map((c) => ({
    name: c.name,
    passed: c.tests.filter((t) => t.passed).length,
    count: c.tests.length,
    tests: c.tests.map((t) => ({ name: t.name, passed: t.passed, crashed: t.crashed }))
  }))
}

const signature = (s: ProjectSummary): string =>
  [s.key, s.deadline?.url ?? '', s.repo ? `${s.repo.fullName}@${s.repo.defaultBranch}` : '', s.lastResult?.id ?? ''].join('|')

/** Seules les sections ok ou unavailable sont mémorisées : needs-login et error sont retentées. */
const cacheable = (sec: Section<unknown>): boolean => sec.state === 'ok' || sec.state === 'unavailable'

export function createProjectDetails(deps: ProjectDetailsDeps): { get(summary: ProjectSummary, force?: boolean): Promise<ProjectDetail> } {
  // Ne stocke que des résultats de sections (jamais de jeton), par clé de projet et signature de ses entrées.
  const cache = new Map<string, { sig: string; at: number; sections: Partial<Sections> }>()

  const loaders = (s: ProjectSummary): { [K in keyof Sections]: () => Promise<Sections[K]> } => {
    const { repo, lastResult, projectId } = s
    return {
      // Sujet = description du projet My Epitech (déjà chargée) : aucun appel réseau, pas de fichiers.
      subject: async () => {
        const project = projectId ? deps.myepitech.data()?.projects.find((p) => p.id === projectId) : undefined
        return project?.description.trim() ? { state: 'ok', data: { description: project.description, files: [] } } : unavailable<SubjectData>()
      },
      repo: async () =>
        repo
          ? section<RepoActivity>(async () => {
              const [commits, pulls] = await Promise.all([deps.github.recentCommits(repo.fullName, repo.defaultBranch), deps.github.openPulls(repo.fullName)])
              return { commits, pulls }
            })
          : unavailable<RepoActivity>(),
      results: async () =>
        lastResult && projectId
          ? section<ResultsData>(async () => {
              const list = deps.myepitech.data()?.runs[projectId] ?? [lastResult]
              const runs: TestRun[] = list
                .map((r) => ({ id: r.id, date: r.date, percent: scoreOf(r.categories) ?? 0 }))
                .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
              const last = runs[runs.length - 1]
              if (!last) return { runs, latest: [] }
              // L'historique est la donnée de la section ; le détail du dernier passage est au mieux.
              try {
                return { runs, latest: skillReports(await deps.myepitech.runDetail(last.id)) }
              } catch (err) {
                return { runs, latest: [], latestError: err instanceof Error ? err.message : String(err) }
              }
            })
          : unavailable<ResultsData>()
    }
  }

  return {
    async get(summary, force = false) {
      const sig = signature(summary)
      let entry = cache.get(summary.key)
      if (force || !entry || entry.sig !== sig || deps.now() - entry.at >= TTL) {
        entry = { sig, at: deps.now(), sections: {} }
        cache.set(summary.key, entry)
      }
      const held = entry.sections
      const l = loaders(summary)
      const [subject, repo, results] = await Promise.all([held.subject ?? l.subject(), held.repo ?? l.repo(), held.results ?? l.results()])
      const sections: Sections = { subject, repo, results }
      if (cache.get(summary.key) === entry) {
        if (cacheable(subject)) entry.sections.subject = subject
        if (cacheable(repo)) entry.sections.repo = repo
        if (cacheable(results)) entry.sections.results = results
      }
      return { summary, ...sections }
    }
  }
}
