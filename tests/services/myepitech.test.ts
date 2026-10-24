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
