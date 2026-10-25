import { expect, test } from 'vitest'
import { buildProjects } from '../../src/main/links/projects'
import { projectKey } from '../../src/shared/projects'
import type { DeadlineView, Repo, TestResult } from '../../src/shared/types'

const now = new Date('2026-10-25T12:00:00Z')
const day = 86400000
const iso = (ms: number): string => new Date(ms).toISOString()
const dv = (o: Partial<DeadlineView> = {}): DeadlineView => ({
  id: 'acti-1', moduleCode: 'G-CPE-100', projectCode: 'cpoolday01', title: 'C Pool Day 01',
  end: iso(now.getTime() + day), url: 'https://intra.example/p', repo: null, lastCommit: null, alert: null, manual: false, ...o
})
const res = (o: Partial<TestResult> = {}): TestResult => ({
  id: '1', project: 'C Pool Day 01', module: 'G-CPE-100', slug: 'cpoolday01', date: '2026-10-20T10:00:00Z', percent: 50, url: 'https://my.example/1', ...o
})
const repo = (fullName: string, o: Partial<Repo> = {}): Repo => ({
  fullName, name: fullName.split('/')[1], url: `https://github.com/${fullName}`, pushedAt: '2026-10-01T00:00:00Z', defaultBranch: 'main', ...o
})
const empty = { repoLinks: {}, projectRepoLinks: {}, projectTeamsLinks: {} }
const base = { deadlines: [dv()], results: [] as TestResult[], repos: [] as Repo[], settings: empty, now }
const key = projectKey('G-CPE-100', 'C Pool Day 01')

const dvA = dv({ id: 'a', title: 'A', projectCode: 'a', end: iso(now.getTime() + 2 * day) })
const dvB = dv({ id: 'b', title: 'B', projectCode: 'b', end: iso(now.getTime() + day) })
const resC = res({ id: 'c', project: 'C', slug: 'c', date: '2026-10-20T00:00:00Z' })
const resD = res({ id: 'd', project: 'D', slug: 'd', date: '2026-10-22T00:00:00Z' })

test('fusionne intranet et My Epitech (formes réelles : titre intranet ≠ nom My Epitech)', () => {
  const p = buildProjects({ deadlines: [dv({ moduleCode: 'G-CPE-100', title: 'C Pool Day 01' })], results: [res({ module: 'G-CPE-100', project: 'Day 01', slug: 'cpoolday01', date: '2026-10-20T10:00:00Z' })], repos: [], settings: empty, now })
  expect(p).toHaveLength(1)
  expect(p[0]).toMatchObject({ key: 'G-CPE-100/cpoolday01', title: 'C Pool Day 01', status: 'en-cours' })
  expect(p[0].deadline?.id).toBe('acti-1')
  expect(p[0].lastResult?.date).toBe('2026-10-20T10:00:00Z')
  expect(p[0].aliases).toEqual(['G-CPE-100/cpoolday01', 'G-CPE-100/day01'])
})
test('repli : titre intranet identique au nom My Epitech, slug différent', () => {
  const p = buildProjects({ deadlines: [dv({ title: 'Day 01' })], results: [res({ project: 'Day 01', slug: 'cpool-d01' })], repos: [], settings: empty, now })
  expect(p).toHaveLength(1)
  expect(p[0].key).toBe('G-CPE-100/cpoold01')
  expect(p[0].aliases).toEqual(['G-CPE-100/day01', 'G-CPE-100/cpoold01'])
})
test('pas de fusion entre modules différents', () =>
  expect(buildProjects({ deadlines: [dv()], results: [res({ module: 'G-CPE-200', project: 'Day 01' })], repos: [], settings: empty, now })).toHaveLength(2))
test('slug vide (ancien cache) → clé du nom', () =>
  expect(buildProjects({ deadlines: [], results: [res({ project: 'Day 01', slug: '' })], repos: [], settings: empty, now })[0].key).toBe('G-CPE-100/day01'))
test('lien enregistré sous la clé intranet retrouvé quand le rendu a quitté le tableau', () => {
  const settings = { ...empty, projectRepoLinks: { [key]: 'me/proj' }, projectTeamsLinks: { [key]: 'https://teams.microsoft.com/l/chat/x' } }
  const p = buildProjects({ deadlines: [], results: [res({ project: 'Day 01', slug: 'cpoolday01' })], repos: [repo('me/proj')], settings, now })
  expect(p).toHaveLength(1)
  expect(p[0].repo?.fullName).toBe('me/proj')
  expect(p[0].teamsUrl).toBe('https://teams.microsoft.com/l/chat/x')
})
test('lien sous un alias (nom My Epitech) lu après la clé canonique', () => {
  const repos = [repo('me/a'), repo('me/b')]
  const run = (links: Record<string, string>): string | undefined =>
    buildProjects({ deadlines: [dv()], results: [res({ project: 'Day 01' })], repos, settings: { ...empty, projectRepoLinks: links }, now })[0].repo?.fullName
  expect(run({ 'G-CPE-100/day01': 'me/b' })).toBe('me/b')
  expect(run({ 'G-CPE-100/day01': 'me/b', [key]: 'me/a' })).toBe('me/a')
})
test('projet seulement My Epitech → terminé, sans deadline', () =>
  expect(buildProjects({ deadlines: [], results: [res({})], repos: [], settings: empty, now })[0]).toMatchObject({ status: 'termine', deadline: null }))
test('garde le résultat le plus récent', () =>
  expect(buildProjects({ ...base, results: [res({ date: '2026-10-01T00:00:00Z' }), res({ date: '2026-10-22T00:00:00Z' })] })[0].lastResult?.date).toBe('2026-10-22T00:00:00Z'))
test('tri : en cours par échéance, puis terminés par date de résultat', () => {
  expect(buildProjects({ deadlines: [dvA, dvB], results: [resC, resD], repos: [], settings: empty, now }).map((p) => p.title)).toEqual(['B', 'A', 'D', 'C'])
})
test('terminé sans résultat en dernier', () => {
  const past = dv({ id: 'p', title: 'P', projectCode: 'p', end: iso(now.getTime() - day) })
  expect(buildProjects({ deadlines: [past], results: [resC], repos: [], settings: empty, now }).map((p) => p.title)).toEqual(['C', 'P'])
})
test('priorité du repo : projet > ancien lien > automatique', () => {
  const repos = [repo('me/proj'), repo('me/old'), repo('me/cpoolday01'), repo('me/fromdl')]
  const d = dv({ repo: repos[3] })
  const run = (settings: typeof empty, deadline = d): string | undefined =>
    buildProjects({ deadlines: [deadline], results: [], repos, settings, now })[0].repo?.fullName
  expect(run({ ...empty, projectRepoLinks: { [key]: 'me/proj' }, repoLinks: { 'acti-1': 'me/old' } })).toBe('me/proj')
  expect(run({ ...empty, repoLinks: { 'acti-1': 'me/old' } })).toBe('me/old')
  expect(run(empty)).toBe('me/fromdl')
  expect(run(empty, dv({ repo: null }))).toBe('me/cpoolday01')
})
test('lien projet vers repo supprimé → lien suivant', () => {
  const repos = [repo('me/old'), repo('me/cpoolday01')]
  const get = (repoLinks: Record<string, string>): string | undefined =>
    buildProjects({ ...base, repos, settings: { ...empty, projectRepoLinks: { [key]: 'me/gone' }, repoLinks } })[0].repo?.fullName
  expect(get({ 'acti-1': 'me/old' })).toBe('me/old')
  expect(get({})).toBe('me/cpoolday01')
})
test('lien Teams valide conservé', () => {
  const u = 'https://teams.microsoft.com/l/chat/x'
  expect(buildProjects({ ...base, settings: { ...empty, projectTeamsLinks: { [key]: u } } })[0].teamsUrl).toBe(u)
})
test('lien Teams invalide ignoré', () =>
  expect(buildProjects({ ...base, settings: { ...empty, projectTeamsLinks: { [key]: 'https://evil.com' } } })[0].teamsUrl).toBeNull())
