import { describe, expect, test, vi } from 'vitest'
import { clip, createEffects, teamsKey } from '../../src/main/app/effects'
import type { Commit, ServiceId, Settings } from '../../src/shared/types'

const NOW = Date.parse('2026-01-10T12:00:00Z')
const settings: Settings = { repoLinks: {}, notify: { github: true, intra: true, myepitech: true, teams: true }, theme: 'dark' }
const repo = { fullName: 'me/B-CPE-200-LIL-2-1-mypoc-me', name: 'B-CPE-200-LIL-2-1-mypoc-me', url: 'u', pushedAt: '', defaultBranch: 'main' }
const deadline = { id: 'd1', moduleCode: 'B-CPE-200', projectCode: 'B-CPE-200-LIL-2-1-mypoc', title: 'mypoc', end: new Date(NOW + 3 * 3600e3).toISOString(), url: 'http://i/d1' }
const intra = { login: '', promo: 0, credits: 0, gpa: '', deadlines: [deadline], events: [], notifications: [{ id: 'n1', title: 'Hello', date: '' }] }
const github = { login: '', notifications: [{ id: 'g1', title: 'PR', repo: 'me/x', type: 'PullRequest', url: 'http://g/1', updatedAt: '' }], reviewRequests: [], assignedIssues: [], repos: [repo] }

type LastCommit = (f: string, b: string) => Promise<Commit | null>
function setup(lastCommit = vi.fn<LastCommit>(async () => null)) {
  const hub = { push: vi.fn((_k: string, _s: ServiceId, _t: string, _b: string, _u?: string) => true) }
  let now = NOW
  const fx = createEffects({ lastCommit, settings: () => settings, hub, now: () => now })
  return { fx, hub, lastCommit, advance: (ms: number) => { now += ms } }
}

describe('effets après rafraîchissement', () => {
  test('pousse alerte de rendu, notification GitHub et intra avec les bonnes clés', async () => {
    const { fx, hub } = setup()
    await fx.afterRefresh({ github, intra })
    const keys = hub.push.mock.calls.map((c) => c[0])
    expect(keys).toContain('intra:deadline:d1:urgent')
    expect(keys).toContain('github:g1')
    expect(keys).toContain('intra:n1')
  })

  test('cache des derniers commits pendant 5 minutes', async () => {
    const { fx, lastCommit, advance } = setup()
    await fx.deadlines({ github, intra })
    await fx.deadlines({ github, intra })
    expect(lastCommit).toHaveBeenCalledTimes(1)
    advance(5 * 60_000 + 1)
    await fx.deadlines({ github, intra })
    expect(lastCommit).toHaveBeenCalledTimes(2)
  })

  test('une erreur lastCommit ne casse pas le calcul', async () => {
    const { fx } = setup(vi.fn<LastCommit>(async () => { throw new Error('x') }))
    const views = await fx.deadlines({ github, intra })
    expect(views).toHaveLength(1)
    expect(views[0]!.lastCommit).toBeNull()
  })

  test('sans données intra, aucune vue', async () => {
    expect(await setup().fx.deadlines({})).toEqual([])
  })

  test('clés Teams et plafonnement', () => {
    expect(teamsKey('t', 'b', 'tag1')).toBe('teams:tag1')
    expect(teamsKey('t', 'b', '')).toBe('teams:t|b')
    expect(clip('x'.repeat(500))).toHaveLength(200)
    expect(clip(undefined)).toBe('')
  })
})
