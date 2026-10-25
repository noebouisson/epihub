import { expect, test } from 'vitest'
import { buildProjects, type BuildProjectsInput } from '../../src/main/links/projects'
import { projectKey } from '../../src/shared/projects'
import type { DeadlineView, MyProject, Repo, RunSummary } from '../../src/shared/types'

const now = new Date('2026-10-25T12:00:00Z')
const day = 86400000
const iso = (ms: number): string => new Date(ms).toISOString()
const proj = (o: Partial<MyProject> = {}): MyProject => ({
  id: '101', name: 'My printf', unitCode: 'G-CPE-101', unitName: 'Unit', description: 'Recode printf', start: iso(now.getTime() - 10 * day),
  end: iso(now.getTime() + day), url: 'https://my.epitech.eu/', ...o
})
/** Vue de rendu telle que la produit `effects.deadlines` pour un projet à venir. */
const dv = (p: MyProject, o: Partial<DeadlineView> = {}): DeadlineView => ({
  id: `mye-${p.id}`, moduleCode: p.unitCode, projectCode: 'myprintf', title: p.name, end: p.end, url: p.url, repo: null, lastCommit: null, alert: null, manual: false, ...o
})
const run = (o: Partial<RunSummary> = {}): RunSummary => ({
  id: '9001', unitCode: 'G-CPE-101', projectCode: 'myprintf', title: 'My printf', year: 2026, date: '2026-10-20T10:00:00Z', commit: 'c', members: [],
  failureFlags: [], style: { fatal: 0, major: 0, minor: 0, info: 0, penalty: null }, coverage: { lines: null, branches: null },
  categories: { base: { count: 2, passed: 1, crashed: 0, mandatoryFailed: 0 } }, repoLink: null, ...o
})
const repo = (fullName: string, o: Partial<Repo> = {}): Repo => ({
  fullName, name: fullName.split('/')[1], url: `https://github.com/${fullName}`, pushedAt: '2026-10-01T00:00:00Z', defaultBranch: 'main', ...o
})
const empty = { repoLinks: {}, projectRepoLinks: {}, projectTeamsLinks: {} }
const p101 = proj()
const base: BuildProjectsInput = { deadlines: [dv(p101)], projects: [p101], runs: {}, repos: [], settings: empty, now }
const key = projectKey('G-CPE-101', 'My printf')

test('buildProjects depuis My Epitech, alias projectCode', () => {
  const r = run()
  const p = buildProjects({ ...base, runs: { '101': [r, run({ id: '9000', date: '2026-10-18T00:00:00Z' })] } })
  expect(p).toHaveLength(1)
  expect(p[0]).toMatchObject({ key, projectId: '101', title: 'My printf', moduleCode: 'G-CPE-101', status: 'en-cours' })
  expect(p[0].deadline?.id).toBe('mye-101')
  expect(p[0].lastResult).toBe(r)
  expect(p[0].aliases).toContain('G-CPE-101/myprintf')
})

test('alias du projectCode différent du nom', () => {
  const p = buildProjects({ ...base, runs: { '101': [run({ projectCode: 'printf-lab' })] } })
  expect(p[0].aliases).toEqual([key, 'G-CPE-101/printflab'])
})

test('projet terminé : sans deadline, statut terminé', () => {
  const past = proj({ end: iso(now.getTime() - day) })
  const p = buildProjects({ ...base, deadlines: [], projects: [past] })
  expect(p[0]).toMatchObject({ status: 'termine', deadline: null, lastResult: null })
})

test('deadline ignorée si la fin est passée, même fournie', () => {
  const past = proj({ end: iso(now.getTime() - day) })
  expect(buildProjects({ ...base, deadlines: [dv(past)], projects: [past] })[0].deadline).toBeNull()
})

test('passages sans projet inscrit ignorés', () => {
  const p = buildProjects({ ...base, runs: { '101': [], '999': [run({ id: 'x', projectCode: 'ghost' })] } })
  expect(p).toHaveLength(1)
  expect(p[0].lastResult).toBeNull()
})

test('tri : en cours par échéance, puis terminés par date de passage', () => {
  const a = proj({ id: 'a', name: 'A', end: iso(now.getTime() + 2 * day) })
  const b = proj({ id: 'b', name: 'B', end: iso(now.getTime() + day) })
  const c = proj({ id: 'c', name: 'C', end: iso(now.getTime() - 3 * day) })
  const d = proj({ id: 'd', name: 'D', end: iso(now.getTime() - 5 * day) })
  const e = proj({ id: 'e', name: 'E', end: iso(now.getTime() - 4 * day) })
  const out = buildProjects({
    ...base, deadlines: [dv(a), dv(b)], projects: [a, b, c, d, e],
    runs: { c: [run({ id: 'c1', date: '2026-10-20T00:00:00Z' })], d: [run({ id: 'd1', date: '2026-10-22T00:00:00Z' })] }
  })
  expect(out.map((p) => p.title)).toEqual(['B', 'A', 'D', 'C', 'E'])
})

test('deux projets de même clé : le plus récent (fin) l’emporte, les alias sont réunis', () => {
  const old = proj({ id: '50', end: iso(now.getTime() - 300 * day) })
  const out = buildProjects({ ...base, projects: [old, p101], runs: { '50': [run({ id: 'o', projectCode: 'oldprintf' })], '101': [run({ id: 'n' })] } })
  expect(out).toHaveLength(1)
  expect(out[0]).toMatchObject({ projectId: '101', status: 'en-cours' })
  expect(out[0].lastResult?.id).toBe('n')
  expect(out[0].aliases).toEqual(expect.arrayContaining([key, 'G-CPE-101/oldprintf']))
})

test('priorité du repo : projet > ancien lien > automatique', () => {
  const repos = [repo('me/proj'), repo('me/old'), repo('me/myprintf'), repo('me/fromdl')]
  const go = (settings: typeof empty, deadline = dv(p101, { repo: repos[3] })): string | undefined =>
    buildProjects({ ...base, deadlines: [deadline], repos, settings })[0].repo?.fullName
  expect(go({ ...empty, projectRepoLinks: { [key]: 'me/proj' }, repoLinks: { 'mye-101': 'me/old' } })).toBe('me/proj')
  expect(go({ ...empty, repoLinks: { 'mye-101': 'me/old' } })).toBe('me/old')
  expect(go(empty)).toBe('me/fromdl')
  expect(go(empty, dv(p101))).toBe('me/myprintf')
})

test('lien sous un alias (projectCode) retrouvé', () => {
  const settings = { ...empty, projectRepoLinks: { 'G-CPE-101/printflab': 'me/proj' }, projectTeamsLinks: { 'G-CPE-101/printflab': 'https://teams.microsoft.com/l/chat/x' } }
  const p = buildProjects({ ...base, runs: { '101': [run({ projectCode: 'printf-lab' })] }, repos: [repo('me/proj')], settings })
  expect(p[0].repo?.fullName).toBe('me/proj')
  expect(p[0].teamsUrl).toBe('https://teams.microsoft.com/l/chat/x')
})

test('lien Teams invalide ignoré', () =>
  expect(buildProjects({ ...base, settings: { ...empty, projectTeamsLinks: { [key]: 'https://evil.com' } } })[0].teamsUrl).toBeNull())
