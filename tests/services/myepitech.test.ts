import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import {
  createMyEpitechService,
  decodeProfile,
  decodeProject,
  decodeRunDetail,
  decodeRunSummary
} from '../../src/main/services/myepitech'
import { NeedsLoginError } from '../../src/main/services/types'

const fx = (name: string): string => readFileSync(join(__dirname, '../fixtures/myepitech2', name), 'utf8')
const json = (name: string): any => JSON.parse(fx(name))
const BASE = 'https://my.epitech.eu/api'
const HOUR = 3600e3

type Reply = { status: number; body: string }
const ok = (body: string): Reply => ({ status: 200, body })
const routes = (): Record<string, Reply> => ({
  '/students/profile': ok(fx('profile.json')),
  '/units/instances/projects?page=1': ok(fx('projects-p1.json')),
  '/units/instances/projects?page=2': ok(fx('projects-p2.json')),
  '/units/instances/projects/101/test-results': ok(fx('test-results.json')),
  '/units/instances/projects/205/test-results': { status: 400, body: '{"message":"Project slug not found"}' },
  '/students/test-results/9001': ok(fx('run-detail.json')),
  '/students/test-results/history/2026/G-CPE-101/myprintf': ok(fx('history.json'))
})

function setup(table: Record<string, Reply> = routes(), start = Date.parse('2026-10-25T12:00:00Z')) {
  const clock = { t: start }
  const calls: string[] = []
  const auths: (string | undefined)[] = []
  const fetch = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
    const path = url.slice(BASE.length)
    calls.push(path)
    auths.push(init?.headers?.Authorization)
    const r = table[path] ?? { status: 404, body: '{"message":"Not found"}' }
    return { status: r.status, ok: r.status >= 200 && r.status < 300, headers: { get: () => null }, text: async () => r.body }
  })
  const auth = { getToken: vi.fn(async (_opts?: { force?: boolean }): Promise<string | null> => 'tok'), invalidate: vi.fn() }
  const svc = createMyEpitechService({ fetch, auth, now: () => clock.t })
  return { svc, fetch, auth, calls, auths, clock, table }
}

describe('décodage', () => {
  test('profil', () => {
    expect(decodeProfile(json('profile.json'))).toEqual({ login: 'jane.doe@epitech.eu', name: 'Jane Doe', promotion: 2030, semester: 1, gpa: null, cursus: 'Programme Grande École' })
    expect(decodeProfile({ ...json('profile.json'), gpa: 3.25 }).gpa).toBe('3.25')
    expect(decodeProfile({ ...json('profile.json'), gpa: { value: 2.5 } }).gpa).toBe('2.5')
    expect(decodeProfile({ ...json('profile.json'), gpa: {}, promotion: null, semester: undefined, cursus: null })).toMatchObject({ gpa: null, promotion: null, semester: null, cursus: null })
  })
  test('projet', () => {
    expect(decodeProject(json('projects-p1.json').data[0])).toEqual({
      id: '101', name: 'My printf', unitCode: 'G-CPE-101', unitName: 'Unix & C Lab Seminar',
      description: 'Recode la fonction printf de la libC.', start: '2026-10-13T08:00:00Z', end: '2026-11-15T22:00:00Z', url: 'https://my.epitech.eu/'
    })
  })
  test('passage', () => {
    const r = decodeRunSummary(json('test-results.json').results[1])
    expect(r).toEqual({
      id: '9001', unitCode: 'G-CPE-101', projectCode: 'myprintf', title: 'My printf', year: 2026,
      date: '2026-10-20T10:00:00Z', commit: '2222222', members: ['jane.doe@epitech.eu', 'octocat@epitech.eu'], failureFlags: ['no-test-passed'],
      style: { fatal: 0, major: 1, minor: 3, info: 0, penalty: 2 }, coverage: { lines: 40, branches: 25 },
      categories: { '01 - base tests': { count: 4, passed: 0, crashed: 1, mandatoryFailed: 1 } },
      repoLink: 'https://github.com/octocat/G-CPE-101-myprintf'
    })
    expect(decodeRunSummary(json('history.json').results[0]).style.penalty).toBeNull()
  })
  test('détail : erreurs et fonctions interdites', () => {
    const raw = json('run-detail.json')
    expect(decodeRunDetail(raw)).toMatchObject({ deliveryError: null, makeError: null, bannedFunctions: [], coverage: { lines: 40, branches: 25 } })
    const d = decodeRunDetail({ ...raw, deliveryError: 'Dépôt vide', makeError: { output: 'gcc: error' }, bannedFunctions: { printf: ['main.c'], puts: [] } })
    expect(d).toMatchObject({ deliveryError: 'Dépôt vide', makeError: '{"output":"gcc: error"}', bannedFunctions: ['printf', 'puts'] })
    expect(decodeRunDetail({ ...raw, bannedFunctions: ['system'] }).bannedFunctions).toEqual(['system'])
    expect(decodeRunDetail({ ...raw, coverage: { Default: { coveredLines: 0, totalLines: 0 } } }).coverage).toEqual({ lines: null, branches: null })
  })
  test('format inattendu → erreur claire', () => {
    for (const bad of [null, 'x', [], { context: {} }]) expect(() => decodeRunSummary(bad)).toThrow('Format My Epitech inattendu')
    expect(() => decodeProject({ id: 1 })).toThrow('Format My Epitech inattendu')
    expect(() => decodeProfile({})).toThrow('Format My Epitech inattendu')
    expect(() => decodeRunDetail({ skills: 'nope' })).toThrow('Format My Epitech inattendu')
  })
})

describe('createMyEpitechService', () => {
  test('profil, projets paginés, seulement inscrits', async () => {
    const { svc, auths } = setup()
    const d = await svc.refresh()
    expect(d.projects.map((p) => p.id)).toEqual(['101', '205'])
    expect(d.profile).toMatchObject({ login: 'jane.doe@epitech.eu', promotion: 2030 })
    expect(auths.every((a) => a === 'Bearer tok')).toBe(true)
  })

  test('passages décodés et triés, 400 → []', async () => {
    const d = await setup().svc.refresh()
    expect(d.runs['101'].map((r) => r.id)).toEqual(['9001', '9000'])
    expect(d.runs['101'][0]).toMatchObject({ id: '9001', unitCode: 'G-CPE-101', projectCode: 'myprintf', failureFlags: ['no-test-passed'] })
    expect(d.runs['205']).toEqual([])
  })

  test('401 → invalidate, une nouvelle tentative, puis NeedsLoginError', async () => {
    const always401 = { status: 401, body: '{"message":"Unauthorized"}' }
    const s = setup(new Proxy({}, { get: () => always401 }))
    await expect(s.svc.refresh()).rejects.toBeInstanceOf(NeedsLoginError)
    expect(s.auth.invalidate).toHaveBeenCalledTimes(1)
    expect(s.auth.getToken).toHaveBeenCalledTimes(2)
    expect(s.calls).toEqual(['/students/profile', '/students/profile'])
  })

  test('401 puis succès après renouvellement', async () => {
    const s = setup()
    let first = true
    const real = s.table['/students/profile']
    Object.defineProperty(s.table, '/students/profile', { get: () => { if (first) { first = false; return { status: 401, body: '' } } return real } })
    s.auth.getToken.mockResolvedValueOnce('old').mockResolvedValue('new')
    const d = await s.svc.refresh()
    expect(d.profile.login).toBe('jane.doe@epitech.eu')
    expect(s.auths.slice(0, 2)).toEqual(['Bearer old', 'Bearer new'])
  })

  test('pas de jeton → NeedsLoginError', async () => {
    const { svc, auth, fetch } = setup()
    auth.getToken.mockResolvedValue(null)
    await expect(svc.refresh()).rejects.toBeInstanceOf(NeedsLoginError)
    expect(fetch).not.toHaveBeenCalled()
  })

  test('erreur HTTP autre → message sans jeton', async () => {
    const t = routes()
    t['/students/profile'] = { status: 500, body: 'oops' }
    await expect(setup(t).svc.refresh()).rejects.toThrow('My Epitech HTTP 500')
  })

  test('projets inactifs : passages refaits au plus toutes les 6 h ; actifs à chaque cycle', async () => {
    const { svc, calls, clock } = setup()
    const count = (id: string): number => calls.filter((c) => c === `/units/instances/projects/${id}/test-results`).length
    await svc.refresh()
    clock.t += HOUR
    await svc.refresh()
    expect(count('205')).toBe(1)
    expect(count('101')).toBe(2)
    clock.t += 5 * HOUR
    const d = await svc.refresh()
    expect(count('205')).toBe(2)
    expect(d.runs['205']).toEqual([])
  })

  test('projet terminé depuis moins de 14 jours : actif', async () => {
    const { svc, calls, clock } = setup(routes(), Date.parse('2026-10-05T12:00:00Z'))
    await svc.refresh()
    clock.t += HOUR
    await svc.refresh()
    expect(calls.filter((c) => c.endsWith('/205/test-results'))).toHaveLength(2)
  })

  test('passages d’un projet en échec réseau : derniers connus conservés', async () => {
    const s = setup()
    const first = await s.svc.refresh()
    s.table['/units/instances/projects/101/test-results'] = { status: 503, body: '' }
    s.clock.t += HOUR
    const d = await s.svc.refresh()
    expect(d.runs['101']).toEqual(first.runs['101'])
  })

  test('concurrence max 4 pour les passages', async () => {
    const t = routes()
    const many = Array.from({ length: 10 }, (_, i) => ({ ...json('projects-p1.json').data[0], id: 500 + i, name: `P${i}` }))
    t['/units/instances/projects?page=1'] = ok(JSON.stringify({ data: many, meta: { page: 1, limit: 10, total: 10, pages: 1, hasNext: false, hasPrev: false } }))
    let live = 0
    let peak = 0
    const s = setup(t)
    const inner = s.fetch.getMockImplementation()!
    s.fetch.mockImplementation(async (url, init) => {
      if (!url.includes('test-results')) return inner(url, init)
      live++
      peak = Math.max(peak, live)
      await new Promise((r) => setTimeout(r, 2))
      live--
      return { status: 400, ok: false, headers: { get: () => null }, text: async () => '{}' }
    })
    const d = await s.svc.refresh()
    expect(Object.keys(d.runs)).toHaveLength(10)
    expect(peak).toBeLessThanOrEqual(4)
    expect(peak).toBeGreaterThan(1)
  })

  test('jeton perdu pendant les passages : aucun nouveau projet démarré', async () => {
    const t = routes()
    const many = Array.from({ length: 12 }, (_, i) => ({ ...json('projects-p1.json').data[0], id: 500 + i, name: `P${i}` }))
    t['/units/instances/projects?page=1'] = ok(JSON.stringify({ data: many, meta: { pages: 1, hasNext: false } }))
    const s = setup(t)
    let n = 0
    s.auth.getToken.mockImplementation(async () => (++n <= 3 ? 'tok' : null))
    await expect(s.svc.refresh()).rejects.toBeInstanceOf(NeedsLoginError)
    // profil + projets + 1 passage avec jeton ; les 3 autres workers échouent, aucun autre ne démarre
    expect(s.auth.getToken.mock.calls.length).toBeLessThanOrEqual(2 + 4)
  })

  test('force transmis au premier appel de jeton seulement', async () => {
    const s = setup()
    await s.svc.refresh({ force: true })
    expect(s.auth.getToken.mock.calls[0][0]).toEqual({ force: true })
    expect(s.auth.getToken.mock.calls.slice(1).every((c) => !c[0]?.force)).toBe(true)
    await s.svc.refresh()
    expect(s.auth.getToken.mock.calls.every((c, i) => i === 0 || !c[0]?.force)).toBe(true)
  })

  test('runDetail décodé', async () => {
    const d = await setup().svc.runDetail('9001')
    expect(d.categories[0].tests.some((t) => t.crashed)).toBe(true)
    expect(d.categories[0].tests.some((t) => t.mandatory)).toBe(true)
    expect(d.categories.map((c) => c.name)).toEqual(['01 - base tests', '02 - flags'])
    expect(d.coverage.lines).toBe(40)
  })

  test('history décodé et trié', async () => {
    const runs = await setup().svc.history(2026, 'G-CPE-101', 'myprintf')
    expect(runs.map((r) => r.id)).toEqual(['9000'])
  })

  test('format inattendu → erreur claire', async () => {
    const t = routes()
    t['/students/test-results/1'] = ok('<html>maintenance</html>')
    t['/students/test-results/2'] = ok('{"skills": 3}')
    const { svc } = setup(t)
    await expect(svc.runDetail('1')).rejects.toThrow('Format My Epitech inattendu')
    await expect(svc.runDetail('2')).rejects.toThrow('Format My Epitech inattendu')
  })
})
