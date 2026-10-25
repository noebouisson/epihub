import { describe, expect, test, vi } from 'vitest'
import { createProjectsApi } from '../../src/main/app/projectsApi'
import type { DeadlineView } from '../../src/shared/types'

const dl = { id: 'a', moduleCode: 'G-CPE-100', projectCode: 'x', title: 'Day 01', end: '2099-01-01T00:00:00Z', url: 'u', repo: null, lastCommit: null, alert: null, manual: false } as DeadlineView

function make(myepitech: any = null) {
  const clock = { t: 0 }
  const deadlines = vi.fn(async () => [dl])
  const get = vi.fn(async (summary: any, force?: boolean) => ({ summary, force }) as any)
  const snap = { data: null }
  const api = createProjectsApi({
    snapshot: () => ({ github: snap, intra: snap, myepitech: { data: myepitech }, teams: snap }),
    deadlines,
    settings: () => ({ repoLinks: {}, projectRepoLinks: {}, projectTeamsLinks: {}, notify: {} as any, theme: 'dark' }),
    details: { get },
    now: () => clock.t
  })
  return { api, deadlines, get, clock }
}

describe('createProjectsApi', () => {
  test('clé non chaîne ou inconnue → null', async () => {
    const { api } = make()
    expect(await api.detail(42, false)).toBeNull()
    expect(await api.detail('NOPE/none', false)).toBeNull()
  })
  test('force est converti en booléen', async () => {
    const { api, get } = make()
    await api.detail('G-CPE-100/day01', 'yes')
    expect(get.mock.calls[0][1]).toBe(true)
    await api.detail('G-CPE-100/day01', undefined)
    expect(get.mock.calls[1][1]).toBe(false)
  })
  test('liste mémorisée 3 s, recalculée après invalidate() ou 3 s', async () => {
    const { api, deadlines, clock } = make()
    const a = await api.list()
    expect(await api.list()).toBe(a)
    await api.detail('G-CPE-100/day01', false)
    expect(deadlines).toHaveBeenCalledTimes(1)
    api.invalidate()
    await api.list()
    expect(deadlines).toHaveBeenCalledTimes(2)
    clock.t = 2999
    await api.list()
    expect(deadlines).toHaveBeenCalledTimes(2)
    clock.t = 3001
    await api.list()
    expect(deadlines).toHaveBeenCalledTimes(3)
  })
  test('appels simultanés partagent le même calcul', async () => {
    const { api, deadlines } = make()
    await Promise.all([api.list(), api.list(), api.list()])
    expect(deadlines).toHaveBeenCalledTimes(1)
  })
  test('une erreur n’est pas mémorisée', async () => {
    const { api, deadlines } = make()
    deadlines.mockRejectedValueOnce(new Error('boom'))
    await expect(api.list()).rejects.toThrow('boom')
    await expect(api.list()).resolves.toHaveLength(1)
  })
  test('une clé intranet (alias) ouvre le projet fusionné', async () => {
    const result = { id: 'r1', project: 'Day 01', module: 'G-CPE-100', slug: 'cpool-d01', date: '2026-10-20T00:00:00Z', percent: 50, url: 'u' }
    const { api, get } = make({ results: [result] })
    const d = await api.detail('G-CPE-100/day01', false)
    expect(get).toHaveBeenCalledTimes(1)
    expect(d?.summary).toMatchObject({ key: 'G-CPE-100/cpoold01', deadline: { id: 'a' }, lastResult: { id: 'r1' } })
  })
})
