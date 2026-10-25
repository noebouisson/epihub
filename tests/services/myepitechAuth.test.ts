import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMyEpitechAuth, isExpiredJwt } from '../../src/main/services/myepitechAuth'

const NOW = Date.parse('2026-10-25T12:00:00Z')
const API = 'https://my.epitech.eu/api/students/profile'
const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url')
/** JWT factice expirant dans `sec` secondes (négatif : déjà expiré). */
const jwt = (sec: number): string => `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(NOW / 1000) + sec, n: sec })}.sig`
const bearer = (t: string): Record<string, string> => ({ Authorization: `Bearer ${t}` })

let listener: (url: string, headers: Record<string, string>) => void
let close: ReturnType<typeof vi.fn>
let openHidden: ReturnType<typeof vi.fn>
let auth: ReturnType<typeof createMyEpitechAuth>
let clock: { t: number }
const emit = (url: string, headers: Record<string, string>): void => listener(url, headers)

beforeEach(() => {
  close = vi.fn()
  openHidden = vi.fn(async () => close)
  clock = { t: NOW }
  auth = createMyEpitechAuth({
    onRequestHeaders: (l) => { listener = l },
    openHiddenPage: openHidden as unknown as () => Promise<() => void>,
    now: () => clock.t,
    waitMs: 20
  })
})
afterEach(() => vi.useRealTimers())

describe('createMyEpitechAuth', () => {
  test('mémorise le jeton des requêtes API seulement', async () => {
    emit(API, bearer(jwt(3600)))
    emit('https://evil.com/api', bearer('other'))
    emit('https://my.epitech.eu/assets/app.js', bearer('other2'))
    expect(await auth.getToken()).toBe(jwt(3600))
    expect(openHidden).not.toHaveBeenCalled()
  })

  test('en-tête en minuscules accepté, autre schéma ignoré', async () => {
    emit(API, { authorization: `bearer ${jwt(3600)}` })
    emit(API, { Authorization: 'Basic abc' })
    expect(await auth.getToken()).toBe(jwt(3600))
  })

  test('jeton expiré → renouvellement par page cachée', async () => {
    emit(API, bearer(jwt(-10)))
    openHidden.mockImplementation(async () => { emit(API, bearer(jwt(3600))); return close })
    expect(await auth.getToken()).toBe(jwt(3600))
    expect(openHidden).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalled()
  })

  test('jeton capturé pendant l’attente', async () => {
    openHidden.mockImplementation(async () => { setTimeout(() => emit(API, bearer(jwt(60))), 10); return close })
    expect(await auth.getToken()).toBe(jwt(60))
    expect(close).toHaveBeenCalled()
  })

  test('aucun jeton après 15 s → null', async () => {
    vi.useFakeTimers()
    auth = createMyEpitechAuth({ onRequestHeaders: (l) => { listener = l }, openHiddenPage: openHidden as unknown as () => Promise<() => void>, now: () => clock.t })
    const p = auth.getToken()
    await vi.advanceTimersByTimeAsync(14_999)
    let done = false
    void p.then(() => { done = true })
    await Promise.resolve()
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await p).toBeNull()
    expect(close).toHaveBeenCalled()
  })

  test('page cachée impossible à ouvrir → null', async () => {
    openHidden.mockRejectedValue(new Error('load failed'))
    expect(await auth.getToken()).toBeNull()
  })

  test('appels concurrents → un seul renouvellement', async () => {
    openHidden.mockImplementation(async () => { setTimeout(() => emit(API, bearer(jwt(3600))), 5); return close })
    const [a, b] = await Promise.all([auth.getToken(), auth.getToken()])
    expect(a).toBe(jwt(3600))
    expect(b).toBe(jwt(3600))
    expect(openHidden).toHaveBeenCalledTimes(1)
  })

  test('invalidate oublie le jeton', async () => {
    emit(API, bearer(jwt(3600)))
    auth.invalidate()
    openHidden.mockImplementation(async () => { emit(API, bearer(jwt(7200))); return close })
    expect(await auth.getToken()).toBe(jwt(7200))
    expect(openHidden).toHaveBeenCalledTimes(1)
  })

  test('jeton non JWT conservé tel quel', async () => {
    emit(API, bearer('opaque-token'))
    expect(await auth.getToken()).toBe('opaque-token')
  })

  test('JWT considéré expiré 30 s avant son exp', () => {
    expect(isExpiredJwt(jwt(20), NOW)).toBe(true)
    expect(isExpiredJwt(jwt(31), NOW)).toBe(false)
  })

  describe('pause après un renouvellement raté', () => {
    test('10 min sans nouvelle fenêtre cachée, puis nouvel essai', async () => {
      expect(await auth.getToken()).toBeNull()
      expect(openHidden).toHaveBeenCalledTimes(1)
      clock.t += 9 * 60_000
      expect(await auth.getToken()).toBeNull()
      expect(openHidden).toHaveBeenCalledTimes(1)
      clock.t += 60_000
      expect(await auth.getToken()).toBeNull()
      expect(openHidden).toHaveBeenCalledTimes(2)
    })

    test('force contourne la pause', async () => {
      expect(await auth.getToken()).toBeNull()
      openHidden.mockImplementation(async () => { emit(API, bearer(jwt(3600))); return close })
      expect(await auth.getToken({ force: true })).toBe(jwt(3600))
      expect(openHidden).toHaveBeenCalledTimes(2)
    })

    test('un jeton capturé dans l’onglet lève la pause', async () => {
      expect(await auth.getToken()).toBeNull()
      emit(API, bearer(jwt(-60))) // jeton déjà expiré : la pause est quand même levée
      openHidden.mockImplementation(async () => { emit(API, bearer(jwt(3600))); return close })
      expect(await auth.getToken()).toBe(jwt(3600))
      expect(openHidden).toHaveBeenCalledTimes(2)
    })

    test('page cachée impossible à ouvrir → pause aussi', async () => {
      openHidden.mockRejectedValue(new Error('load failed'))
      expect(await auth.getToken()).toBeNull()
      expect(await auth.getToken()).toBeNull()
      expect(openHidden).toHaveBeenCalledTimes(1)
    })
  })
})
