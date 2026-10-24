import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { createMyEpitechService, isExpiredJwt, scholarYear, tokenFromStorage, usableToken } from '../../src/main/services/myepitech'
import { NeedsLoginError, type FetchLike } from '../../src/main/services/types'

const me = readFileSync('tests/fixtures/myepitech/me.json', 'utf8')
const mk = (body: string, status = 200, calls: { url: string; headers?: Record<string, string> }[] = []): FetchLike =>
  async (url, init) => {
    calls.push({ url, headers: init?.headers })
    return { status, ok: status < 400, headers: { get: () => null }, text: async () => body }
  }
const now = () => new Date(2026, 9, 24)

describe('my epitech', () => {
  test('scholarYear', () => {
    expect(scholarYear(new Date('2026-10-24'))).toBe(2026)
    expect(scholarYear(new Date('2027-03-01'))).toBe(2026)
  })
  test('calcule le pourcentage, trié par date décroissante', async () => {
    const calls: { url: string; headers?: Record<string, string> }[] = []
    const svc = createMyEpitechService(mk(me, 200, calls), async () => 'tok', now)
    const r = (await svc.refresh()).results
    expect(r[0]).toMatchObject({
      id: '1002',
      project: 'Day 01',
      module: 'G-CPE-100',
      slug: 'cpoolday01',
      percent: 75,
      url: 'https://my.epitech.eu/index.html#d/2026/G-CPE-100/cpoolday01/1002'
    })
    expect(r[1].id).toBe('1001')
    expect(calls[0].url).toBe('https://api.epitest.eu/me/2026')
    expect(calls[0].headers?.Authorization).toBe('Bearer tok')
  })
  test('sans token → NeedsLoginError', async () => {
    await expect(createMyEpitechService(mk(me), async () => null).refresh()).rejects.toBeInstanceOf(NeedsLoginError)
  })
  test('401 → NeedsLoginError', async () => {
    await expect(createMyEpitechService(mk('{}', 401), async () => 't', now).refresh()).rejects.toBeInstanceOf(NeedsLoginError)
  })
  test('skills vides → 0 %', async () => {
    const empty = JSON.stringify([{ id: 'x', date: '2026-10-24T10:00:00Z', project: { name: 'P', slug: 'p', module: { code: 'M' } }, results: { skills: {} } }])
    const svc = createMyEpitechService(mk(empty), async () => 't', now)
    expect((await svc.refresh()).results[0].percent).toBe(0)
  })
  test('sans testRunId → id de l’entrée', async () => {
    const svc = createMyEpitechService(mk(JSON.stringify([{ id: 'x9', date: '2026-10-24T10:00:00Z', project: { name: 'P', slug: 'p', module: { code: 'M' } }, results: {} }])), async () => 't', now)
    const r = (await svc.refresh()).results[0]
    expect(r.id).toBe('x9')
    expect(r.url.endsWith('/p/x9')).toBe(true)
  })
})

const jwt = (payload: object): string => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`
describe('token My Epitech', () => {
  const NOW = Date.parse('2026-10-24T12:00:00Z')
  test('valeur du localStorage entre guillemets', () => {
    expect(tokenFromStorage('"abc"')).toBe('abc')
    expect(tokenFromStorage(null)).toBeNull()
    expect(tokenFromStorage('""')).toBeNull()
  })
  test('JWT expiré détecté', () => {
    expect(isExpiredJwt(jwt({ exp: NOW / 1000 - 60 }), NOW)).toBe(true)
    expect(isExpiredJwt(jwt({ exp: NOW / 1000 + 3600 }), NOW)).toBe(false)
    expect(isExpiredJwt(jwt({}), NOW)).toBe(false)
    expect(isExpiredJwt('opaque-token', NOW)).toBe(false)
    expect(isExpiredJwt('a.%%%.c', NOW)).toBe(false)
  })
  test('usableToken : un JWT expiré est traité comme absent', () => {
    const live = jwt({ exp: NOW / 1000 + 3600 })
    expect(usableToken(JSON.stringify(live), NOW)).toBe(live)
    expect(usableToken(JSON.stringify(jwt({ exp: 1 })), NOW)).toBeNull()
  })
})

describe('my epitech à la demande', () => {
  const history = readFileSync('tests/fixtures/myepitech/history.json', 'utf8')
  const details = readFileSync('tests/fixtures/myepitech/details.json', 'utf8')
  test('history : trié, pourcentages', async () => {
    const calls: { url: string; headers?: Record<string, string> }[] = []
    const myepi = createMyEpitechService(mk(history, 200, calls), async () => 'tok', now)
    const runs = await myepi.history('G-CPE-100', 'cpoolday01')
    expect(runs.map((r) => r.percent)).toEqual([25, 50, 75])
    expect(runs.map((r) => r.id)).toEqual(['3001', '3002', '3003'])
    expect(calls[0].url).toBe('https://api.epitest.eu/me/2026/G-CPE-100/cpoolday01')
    expect(calls[0].headers?.Authorization).toBe('Bearer tok')
  })
  test('history : composants encodés', async () => {
    const calls: { url: string }[] = []
    await createMyEpitechService(mk(history, 200, calls), async () => 't', now).history('G CPE', 'a/b')
    expect(calls[0].url).toBe('https://api.epitest.eu/me/2026/G%20CPE/a%2Fb')
  })
  test('runDetails : compte réussis / total et crash', async () => {
    const calls: { url: string }[] = []
    const d = await createMyEpitechService(mk(details, 200, calls), async () => 't', now).runDetails('42')
    expect(d[0]).toMatchObject({ name: 'basics', passed: 1, count: 2 })
    expect(d[1].tests.some((t) => t.crashed)).toBe(true)
    expect(calls[0].url).toBe('https://api.epitest.eu/me/details/42')
  })
  test('history : format inattendu → erreur claire', async () => {
    await expect(createMyEpitechService(mk('{"a":1}'), async () => 't', now).history('G-CPE-100', 'x')).rejects.toThrow('Format My Epitech inattendu')
  })
  test('history : champ manquant → erreur claire', async () => {
    await expect(createMyEpitechService(mk('[{"id":"x"}]'), async () => 't', now).history('M', 'x')).rejects.toThrow('Format My Epitech inattendu')
  })
  test('runDetails : format inattendu → erreur claire', async () => {
    await expect(createMyEpitechService(mk('{"results":{}}'), async () => 't', now).runDetails('42')).rejects.toThrow('Format My Epitech inattendu')
  })
  test('runDetails : skills en objet indexé par nom', async () => {
    const obj = readFileSync('tests/fixtures/myepitech/details-object.json', 'utf8')
    const d = await createMyEpitechService(mk(obj), async () => 't', now).runDetails('43')
    expect(d).toMatchObject([{ name: 'basics', passed: 2, count: 2 }, { name: 'edge cases', passed: 0, count: 1 }])
    expect(d[1].tests[0].crashed).toBe(true)
  })
  test('runDetails : test sans nom → erreur claire', async () => {
    const bad = '{"results":{"skills":[{"FullSkillReport":{"name":"a","tests":[{"passed":true}]}}]}}'
    await expect(createMyEpitechService(mk(bad), async () => 't', now).runDetails('1')).rejects.toThrow('Format My Epitech inattendu')
  })
  test('history : sans id ni testRunId, ou date illisible → erreur claire', async () => {
    for (const body of ['[{"date":"2026-10-24T10:00:00Z","results":{}}]', '[{"id":"x","date":"hier","results":{}}]']) {
      await expect(createMyEpitechService(mk(body), async () => 't', now).history('M', 'x')).rejects.toThrow('Format My Epitech inattendu')
    }
  })
  test('runDetails : 401 → NeedsLoginError', async () => {
    await expect(createMyEpitechService(mk('{}', 401), async () => 't', now).runDetails('42')).rejects.toBeInstanceOf(NeedsLoginError)
  })
  test('history / runDetails sans token → NeedsLoginError', async () => {
    const svc = createMyEpitechService(mk(history), async () => null, now)
    await expect(svc.history('M', 'x')).rejects.toBeInstanceOf(NeedsLoginError)
    await expect(svc.runDetails('1')).rejects.toBeInstanceOf(NeedsLoginError)
  })
  test('les résultats exposent le slug', async () => {
    expect((await createMyEpitechService(mk(me), async () => 't', now).refresh()).results[0].slug).toBe('cpoolday01')
  })
})
