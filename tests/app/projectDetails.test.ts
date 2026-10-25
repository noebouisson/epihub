import { describe, expect, test, vi } from 'vitest'
import { createProjectDetails } from '../../src/main/app/projectDetails'
import { NeedsLoginError } from '../../src/main/services/types'
import type { DeadlineView, MyEpitechData, MyProject, ProjectSummary, Repo, RunDetail, RunSummary } from '../../src/shared/types'

const repo: Repo = { fullName: 'octocat/myprintf', name: 'myprintf', url: 'https://github.com/octocat/myprintf', pushedAt: '2026-10-01T00:00:00Z', defaultBranch: 'main' }
const project: MyProject = { id: '101', name: 'My printf', unitCode: 'G-CPE-101', unitName: 'Unit', description: 'Recode printf.', start: '2026-10-01T00:00:00Z', end: '2026-10-30T00:00:00Z', url: 'https://my.epitech.eu/' }
const deadline: DeadlineView = { id: 'mye-101', moduleCode: 'G-CPE-101', projectCode: 'myprintf', title: 'My printf', end: project.end, url: project.url, repo, lastCommit: null, alert: null, manual: false }
const run = (id: string, date: string, passed: number): RunSummary => ({
  id, unitCode: 'G-CPE-101', projectCode: 'myprintf', title: 'My printf', year: 2026, date, commit: 'c', members: [], failureFlags: [],
  style: { fatal: 0, major: 0, minor: 0, info: 0, penalty: null }, coverage: { lines: null, branches: null },
  categories: { base: { count: 4, passed, crashed: 0, mandatoryFailed: 0 } }, repoLink: null
})
// Du plus récent au plus ancien, comme dans MyEpitechData.
const runs = [run('c', '2026-10-22T00:00:00Z', 4), run('b', '2026-10-21T00:00:00Z', 2), run('a', '2026-10-20T00:00:00Z', 1)]
const detail: RunDetail = {
  categories: [{ name: 'base', tests: [{ name: 't1', passed: true, crashed: false, skipped: false, mandatory: true, comment: '' }, { name: 't2', passed: false, crashed: true, skipped: false, mandatory: false, comment: 'segv' }] }],
  deliveryError: null, makeError: null, bannedFunctions: [], coverage: { lines: null, branches: null }
}
const data: MyEpitechData = { profile: { login: 'jane.doe@epitech.eu', name: 'Jane Doe', promotion: 2030, semester: 1, gpa: null, cursus: null }, projects: [project], runs: { '101': runs } }
const full: ProjectSummary = { key: 'G-CPE-101/myprintf', aliases: ['G-CPE-101/myprintf'], projectId: '101', title: 'My printf', moduleCode: 'G-CPE-101', deadline, lastResult: runs[0], repo, teamsUrl: null, status: 'en-cours' }

const failing = (e: Error) => () => Promise.reject(e)

function make(over: { github?: any; runDetail?: any; data?: MyEpitechData | null } = {}, clock = { t: 0 }) {
  const github = { recentCommits: vi.fn(async () => []), openPulls: vi.fn(async () => []), ...over.github }
  const current = 'data' in over ? over.data : data
  const myepitech = { data: vi.fn(() => current ?? null), runDetail: vi.fn(over.runDetail ?? (async () => detail)) }
  return { svc: createProjectDetails({ github, myepitech, now: () => clock.t }), github, myepitech, clock }
}
const details = (over: Parameters<typeof make>[0] = {}) => make(over).svc

describe('createProjectDetails', () => {
  test('projectDetails : sujet = description, sans réseau', async () => {
    const m = make()
    const d = await m.svc.get(full)
    expect(d.subject).toEqual({ state: 'ok', data: { description: 'Recode printf.', files: [] } })
  })
  test('description vide ou projet inconnu → sujet unavailable', async () => {
    expect((await details({ data: { ...data, projects: [{ ...project, description: '  ' }] } }).get(full)).subject.state).toBe('unavailable')
    expect((await details().get({ ...full, projectId: null })).subject.state).toBe('unavailable')
    expect((await details({ data: null }).get(full)).subject.state).toBe('unavailable')
  })
  test('résultats : passages convertis (score) et triés par date croissante, détail du plus récent', async () => {
    const m = make()
    const d = await m.svc.get(full)
    expect(d.results.state).toBe('ok')
    expect(d.results.data?.runs).toEqual([{ id: 'a', date: '2026-10-20T00:00:00Z', percent: 25 }, { id: 'b', date: '2026-10-21T00:00:00Z', percent: 50 }, { id: 'c', date: '2026-10-22T00:00:00Z', percent: 100 }])
    expect(m.myepitech.runDetail).toHaveBeenCalledTimes(1)
    expect(m.myepitech.runDetail).toHaveBeenCalledWith('c')
    expect(d.results.data?.latest).toEqual([{ name: 'base', passed: 1, count: 2, tests: [{ name: 't1', passed: true, crashed: false }, { name: 't2', passed: false, crashed: true }] }])
  })
  test('passage sans test → percent 0', async () => {
    const empty = { ...runs[0], categories: {} }
    const d = await details({ data: { ...data, runs: { '101': [empty] } } }).get({ ...full, lastResult: empty })
    expect(d.results.data?.runs[0].percent).toBe(0)
  })
  test('sans repo → repo unavailable ; sans résultat → résultats unavailable', async () => {
    const d = await details().get({ ...full, repo: null, lastResult: null })
    expect(d.repo.state).toBe('unavailable')
    expect(d.results.state).toBe('unavailable')
  })
  test('repo : commits et pulls', async () => {
    const m = make()
    const d = await m.svc.get(full)
    expect(m.github.recentCommits).toHaveBeenCalledWith('octocat/myprintf', 'main')
    expect(m.github.openPulls).toHaveBeenCalledWith('octocat/myprintf')
    expect(d.repo.data).toEqual({ commits: [], pulls: [] })
  })
  test('repo NeedsLoginError → needs-login, autres sections ok', async () => {
    const d = await details({ github: { recentCommits: failing(new NeedsLoginError()) } }).get(full)
    expect(d.repo.state).toBe('needs-login')
    expect(d.subject.state).toBe('ok')
    expect(d.results.state).toBe('ok')
  })
  test('runDetail en échec : historique gardé, détail signalé, section ok', async () => {
    const d = await details({ runDetail: failing(new Error('Format My Epitech inattendu')) }).get(full)
    expect(d.results.state).toBe('ok')
    expect(d.results.data?.runs).toHaveLength(3)
    expect(d.results.data).toMatchObject({ latest: [], latestError: 'Format My Epitech inattendu' })
  })
  test('cache 5 min, force le contourne', async () => {
    const m = make()
    await m.svc.get(full)
    m.clock.t = 4 * 60_000
    await m.svc.get(full)
    expect(m.myepitech.runDetail).toHaveBeenCalledTimes(1)
    await m.svc.get(full, true)
    expect(m.myepitech.runDetail).toHaveBeenCalledTimes(2)
    m.clock.t = 4 * 60_000 + 5 * 60_000 + 1
    await m.svc.get(full)
    expect(m.myepitech.runDetail).toHaveBeenCalledTimes(3)
  })
  test('le summary renvoyé est celui passé, même depuis le cache', async () => {
    const m = make()
    await m.svc.get(full)
    const d = await m.svc.get({ ...full, teamsUrl: 'https://teams.microsoft.com/x' })
    expect(d.summary.teamsUrl).toBe('https://teams.microsoft.com/x')
    expect(m.myepitech.runDetail).toHaveBeenCalledTimes(1)
  })
  test('lier un repo (même clé) recharge la section repo sans force', async () => {
    const m = make()
    await m.svc.get({ ...full, repo: null })
    const d = await m.svc.get(full)
    expect(d.repo.state).toBe('ok')
    expect(m.github.recentCommits).toHaveBeenCalledTimes(1)
  })
  test('nouveau passage My Epitech → résultats rechargés', async () => {
    const m = make()
    await m.svc.get(full)
    await m.svc.get({ ...full, lastResult: { ...runs[0], id: 'd' } })
    expect(m.myepitech.runDetail).toHaveBeenCalledTimes(2)
  })
})
