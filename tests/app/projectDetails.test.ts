import { describe, expect, test, vi } from 'vitest'
import { createProjectDetails } from '../../src/main/app/projectDetails'
import { NeedsLoginError } from '../../src/main/services/types'
import type { DeadlineView, ProjectSummary, Repo, TestResult } from '../../src/shared/types'

const repo: Repo = { fullName: 'octocat/cpoolday01', name: 'cpoolday01', url: 'https://github.com/octocat/cpoolday01', pushedAt: '2026-10-01T00:00:00Z', defaultBranch: 'main' }
const deadline: DeadlineView = { id: 'acti-1', moduleCode: 'G-CPE-100', projectCode: 'cpoolday01', title: 'Day 01', end: '2026-10-30T00:00:00Z', url: 'https://intra.example/p', repo, lastCommit: null, alert: null, manual: false }
const lastResult: TestResult = { id: 'r9', project: 'Day 01', module: 'G-CPE-100', slug: 'cpoolday01', date: '2026-10-20T00:00:00Z', percent: 50, url: 'u' }
const full: ProjectSummary = { key: 'G-CPE-100/day01', title: 'Day 01', moduleCode: 'G-CPE-100', deadline, lastResult, repo, teamsUrl: null, status: 'en-cours' }

const failing = (e: Error) => () => Promise.reject(e)

function make(over: { intra?: any; github?: any; myepitech?: any } = {}, clock = { t: 0 }) {
  const intra = { projectDetails: vi.fn(async () => ({ description: 'Sujet', files: [] })), ...over.intra }
  const github = { recentCommits: vi.fn(async () => []), openPulls: vi.fn(async () => []), ...over.github }
  const myepitech = {
    history: vi.fn(async () => [{ id: 'a', date: '1', percent: 1 }, { id: 'b', date: '2', percent: 2 }, { id: 'c', date: '3', percent: 3 }]),
    runDetails: vi.fn(async () => [{ name: 's', passed: 1, count: 1, tests: [] }]),
    ...over.myepitech
  }
  return { svc: createProjectDetails({ intra, github, myepitech, now: () => clock.t }), intra, github, myepitech, clock }
}
const details = (over: Parameters<typeof make>[0] = {}) => make(over).svc

describe('createProjectDetails', () => {
  test('sections indépendantes : résultats en erreur, les autres ok', async () => {
    const d = await details({ myepitech: { history: failing(new Error('Format My Epitech inattendu')) } }).get(full)
    expect(d.subject.state).toBe('ok')
    expect(d.repo.state).toBe('ok')
    expect(d.results).toMatchObject({ state: 'error', message: 'Format My Epitech inattendu' })
  })
  test('projet passé sans lien intranet → sujet unavailable', async () => {
    expect((await details().get({ ...full, deadline: null })).subject.state).toBe('unavailable')
  })
  test('sans repo → repo unavailable ; sans résultat → résultats unavailable', async () => {
    const d = await details().get({ ...full, repo: null, lastResult: null })
    expect(d.repo.state).toBe('unavailable')
    expect(d.results.state).toBe('unavailable')
  })
  test('NeedsLoginError → needs-login', async () => {
    const d = await details({ intra: { projectDetails: failing(new NeedsLoginError()) } }).get(full)
    expect(d.subject.state).toBe('needs-login')
  })
  test('repo : commits et pulls', async () => {
    const m = make()
    const d = await m.svc.get(full)
    expect(m.github.recentCommits).toHaveBeenCalledWith('octocat/cpoolday01', 'main')
    expect(m.github.openPulls).toHaveBeenCalledWith('octocat/cpoolday01')
    expect(d.repo.data).toEqual({ commits: [], pulls: [] })
  })
  test('sans passage : ok avec runs et latest vides', async () => {
    const d = await details({ myepitech: { history: async () => [] } }).get(full)
    expect(d.results).toEqual({ state: 'ok', data: { runs: [], latest: [] } })
  })
  test('détail du dernier passage seulement', async () => {
    const m = make()
    const d = await m.svc.get(full)
    expect(m.myepitech.history).toHaveBeenCalledWith('G-CPE-100', 'cpoolday01')
    expect(m.myepitech.runDetails).toHaveBeenCalledTimes(1)
    expect(m.myepitech.runDetails).toHaveBeenCalledWith('c')
    expect(d.results.data?.runs).toHaveLength(3)
  })
  test('cache 5 min, force le contourne', async () => {
    const m = make()
    await m.svc.get(full)
    m.clock.t = 4 * 60_000
    await m.svc.get(full)
    expect(m.intra.projectDetails).toHaveBeenCalledTimes(1)
    await m.svc.get(full, true)
    expect(m.intra.projectDetails).toHaveBeenCalledTimes(2)
    m.clock.t = 4 * 60_000 + 5 * 60_000 + 1
    await m.svc.get(full)
    expect(m.intra.projectDetails).toHaveBeenCalledTimes(3)
  })
  test('le summary renvoyé est celui passé, même depuis le cache', async () => {
    const m = make()
    await m.svc.get(full)
    const d = await m.svc.get({ ...full, teamsUrl: 'https://teams.microsoft.com/x' })
    expect(d.summary.teamsUrl).toBe('https://teams.microsoft.com/x')
    expect(m.intra.projectDetails).toHaveBeenCalledTimes(1)
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
    await m.svc.get({ ...full, lastResult: { ...lastResult, id: 'r10' } })
    expect(m.myepitech.history).toHaveBeenCalledTimes(2)
  })
  test('needs-login retenté au get suivant, sections ok depuis le cache', async () => {
    let logged = false
    const m = make({ intra: { projectDetails: async () => { if (!logged) throw new NeedsLoginError(); return { description: 'S', files: [] } } } })
    expect((await m.svc.get(full)).subject.state).toBe('needs-login')
    logged = true
    const d = await m.svc.get(full)
    expect(d.subject.state).toBe('ok')
    expect(m.github.recentCommits).toHaveBeenCalledTimes(1)
    expect(m.myepitech.history).toHaveBeenCalledTimes(1)
  })
})
