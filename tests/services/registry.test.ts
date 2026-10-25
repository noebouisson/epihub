import { afterEach, describe, expect, test, vi } from 'vitest'
import { createRegistry } from '../../src/main/services/registry'
import { NeedsLoginError, NotReadyError, type Service } from '../../src/main/services/types'
import type { ServiceDataMap, ServiceId } from '../../src/shared/types'

const ghEmpty = { login: '', notifications: [], reviewRequests: [], assignedIssues: [], repos: [] }
const myeEmpty = { profile: { login: '', name: '', promotion: null, semester: null, gpa: null, cursus: null }, projects: [], runs: {} }

function ok<K extends ServiceId>(id: K, data: ServiceDataMap[K]): Service<K> {
  return { id, refresh: async () => data }
}
function failing<K extends ServiceId>(id: K, err: Error): Service<K> {
  return { id, refresh: async () => { throw err } }
}
function toggling(data: ServiceDataMap['teams']) {
  const svc = { id: 'teams' as const, fail: false, refresh: async () => { if (svc.fail) throw new Error('down'); return data } }
  return svc
}
const all = () => ({
  github: ok('github', ghEmpty),
  intra: ok('intra', null),
  myepitech: ok('myepitech', myeEmpty),
  teams: ok('teams', { unread: 0 })
})

afterEach(() => vi.useRealTimers())

describe('registre des services', () => {
  test('un service en erreur ne bloque pas les autres', async () => {
    const onChange = vi.fn()
    const reg = createRegistry(
      { github: ok('github', { ...ghEmpty, login: 'n' }), intra: failing('intra', new Error('boom')), myepitech: failing('myepitech', new NeedsLoginError()), teams: ok('teams', { unread: 1 }) },
      { now: () => 1000, onChange }
    )
    await reg.refresh()
    const s = reg.snapshot()
    expect(s.github.status).toEqual({ state: 'ok', updatedAt: 1000 })
    expect(s.intra.status).toMatchObject({ state: 'error', message: 'boom' })
    expect(s.myepitech.status.state).toBe('needs-login')
    expect(s.teams.data).toEqual({ unread: 1 })
  })

  test('les données en cache restent après une erreur', async () => {
    const svc = toggling({ unread: 4 })
    const reg = createRegistry({ ...all(), teams: svc }, { now: () => 1, onChange: vi.fn() })
    await reg.refresh('teams')
    svc.fail = true
    await reg.refresh('teams')
    expect(reg.snapshot().teams).toMatchObject({ status: { state: 'error' }, data: { unread: 4 } })
  })

  test('onChange est appelé pour chaque service rafraîchi', async () => {
    const onChange = vi.fn()
    const reg = createRegistry(all(), { now: () => 1, onChange })
    await reg.refresh()
    expect(onChange).toHaveBeenCalledTimes(4)
  })

  test('état initial loading sans données', () => {
    const reg = createRegistry(all(), { now: () => 1, onChange: vi.fn() })
    expect(reg.snapshot().github).toEqual({ status: { state: 'loading' }, data: null })
  })

  test('start rafraîchit à intervalle et renvoie un stop', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn(async () => ({ unread: 0 }))
    const reg = createRegistry({ ...all(), teams: { id: 'teams', refresh } }, { now: () => 1, onChange: vi.fn() })
    const stop = reg.start(300_000)
    await vi.advanceTimersByTimeAsync(600_000)
    stop()
    await vi.advanceTimersByTimeAsync(600_000)
    expect(refresh).toHaveBeenCalledTimes(3) // démarrage + 2
  })

  test('NotReadyError → état loading, pas erreur', async () => {
    const reg = createRegistry({ ...all(), teams: failing('teams', new NotReadyError('Teams pas encore ouvert')) }, { now: () => 1, onChange: vi.fn() })
    await reg.refresh('teams')
    expect(reg.snapshot().teams.status.state).toBe('loading')
  })

  test('amorcé depuis le cache : loading avec données et ancienne date', async () => {
    const reg = createRegistry(all(), { now: () => 50, onChange: vi.fn(), initial: { teams: { data: { unread: 7 }, updatedAt: 10 } } })
    expect(reg.snapshot().teams).toEqual({ status: { state: 'loading', updatedAt: 10 }, data: { unread: 7 } })
    expect(reg.snapshot().github).toEqual({ status: { state: 'loading' }, data: null })
    await reg.refresh('teams')
    expect(reg.snapshot().teams).toEqual({ status: { state: 'ok', updatedAt: 50 }, data: { unread: 0 } })
  })

  test('une erreur garde la date des données conservées', async () => {
    const svc = toggling({ unread: 4 })
    let t = 5
    const reg = createRegistry({ ...all(), teams: svc }, { now: () => t, onChange: vi.fn() })
    await reg.refresh('teams')
    svc.fail = true
    t = 9
    await reg.refresh('teams')
    expect(reg.snapshot().teams.status).toEqual({ state: 'error', message: 'down', updatedAt: 5 })
  })

  test('options de rafraîchissement : service demandé, ou My Epitech seul pour « tout »', async () => {
    const mye = { id: 'myepitech' as const, refresh: vi.fn(async (_o?: { force?: boolean }) => myeEmpty) }
    const gh = { id: 'github' as const, refresh: vi.fn(async (_o?: { force?: boolean }) => ghEmpty) }
    const reg = createRegistry({ ...all(), myepitech: mye, github: gh }, { now: () => 1, onChange: vi.fn() })
    await reg.refresh('myepitech', { force: true })
    expect(mye.refresh).toHaveBeenLastCalledWith({ force: true })
    await reg.refresh()
    expect(mye.refresh).toHaveBeenLastCalledWith(undefined)
    await reg.refresh(undefined, { force: true })
    expect(mye.refresh).toHaveBeenLastCalledWith({ force: true })
    expect(gh.refresh).toHaveBeenLastCalledWith(undefined)
  })
})
