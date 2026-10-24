import { describe, expect, test, vi } from 'vitest'
import { clip, createEffects, TEAMS_DEDUP_TTL, teamsKey } from '../../src/main/app/effects'
import type { Commit, ServiceId, Settings } from '../../src/shared/types'

const NOW = Date.parse('2026-01-10T12:00:00Z')
const settings: Settings = { repoLinks: {}, projectRepoLinks: {}, projectTeamsLinks: {}, notify: { github: true, intra: true, myepitech: true, teams: true }, theme: 'dark' }
const repo = { fullName: 'me/B-CPE-200-LIL-2-1-mypoc-me', name: 'B-CPE-200-LIL-2-1-mypoc-me', url: 'u', pushedAt: '', defaultBranch: 'main' }
const deadline = { id: 'd1', moduleCode: 'B-CPE-200', projectCode: 'B-CPE-200-LIL-2-1-mypoc', title: 'mypoc', end: new Date(NOW + 3 * 3600e3).toISOString(), url: 'http://i/d1' }
const intra = { login: '', promo: 0, credits: 0, gpa: '', deadlines: [deadline], events: [], notifications: [{ id: 'n1', title: 'Hello', date: new Date(NOW - 3600e3).toISOString() }] }
const github = { login: '', notifications: [{ id: 'g1', title: 'PR', repo: 'me/x', type: 'PullRequest', url: 'http://g/1', updatedAt: new Date(NOW - 3600e3).toISOString() }], reviewRequests: [], assignedIssues: [], repos: [repo] }

type LastCommit = (f: string, b: string) => Promise<Commit | null>
function setup(lastCommit = vi.fn<LastCommit>(async () => null), primed: ServiceId[] = ['github', 'intra']) {
  const marks = new Set<ServiceId>(primed)
  const hub = {
    prime: vi.fn((_k: string[], s?: ServiceId) => { if (s) marks.add(s) }),
    isPrimed: (s: ServiceId) => marks.has(s),
    push: vi.fn((_k: string, _s: ServiceId, _t: string, _b: string, _u?: string) => true)
  }
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
    expect(teamsKey('t', 'b', 'tag1')).toBe('teams:tag1|t|b')
    expect(teamsKey('t', 'b2', 'tag1')).not.toBe(teamsKey('t', 'b', 'tag1'))
    expect(teamsKey('t', 'b', '')).toBe('teams:|t|b')
    expect(TEAMS_DEDUP_TTL).toBe(120_000)
    expect(clip('x'.repeat(500))).toHaveLength(200)
    expect(clip(undefined)).toBe('')
  })

  test('premier lancement : amorce sans notifier, puis notifie les nouveautés', async () => {
    const { fx, hub } = setup(undefined, [])
    await fx.afterRefresh({ github, intra })
    expect(hub.prime).toHaveBeenCalledWith(['github:g1'], 'github')
    expect(hub.prime).toHaveBeenCalledWith(['intra:n1'], 'intra')
    expect(hub.push.mock.calls.map((c) => c[0])).toEqual(['intra:deadline:d1:urgent'])
    await fx.afterRefresh({ github: { ...github, notifications: [...github.notifications, { ...github.notifications[0]!, id: 'g2' }] }, intra })
    expect(hub.push.mock.calls.map((c) => c[0])).toContain('github:g2')
  })

  test('notifications de plus de 7 jours ignorées', async () => {
    const { fx, hub } = setup()
    const old = new Date(NOW - 8 * 864e5).toISOString()
    await fx.afterRefresh({
      github: { ...github, notifications: [{ ...github.notifications[0]!, updatedAt: old }] },
      intra: { ...intra, deadlines: [], notifications: [{ id: 'n9', title: 'x', date: old }] }
    })
    expect(hub.push).not.toHaveBeenCalled()
  })

  test('service configuré plus tard : amorcé à son premier passage, sans rafale', async () => {
    const { fx, hub } = setup(undefined, ['intra'])
    await fx.afterRefresh({ intra })
    expect(hub.prime).not.toHaveBeenCalled()
    await fx.afterRefresh({ github, intra })
    expect(hub.prime).toHaveBeenCalledWith(['github:g1'], 'github')
    expect(hub.push.mock.calls.map((c) => c[0])).not.toContain('github:g1')
    await fx.afterRefresh({ github: { ...github, notifications: [{ ...github.notifications[0]!, id: 'g3' }] }, intra })
    expect(hub.push.mock.calls.map((c) => c[0])).toContain('github:g3')
  })

  test('appels simultanés : un seul lastCommit par repo', async () => {
    let release!: (c: Commit | null) => void
    const lastCommit = vi.fn<LastCommit>(() => new Promise((r) => { release = r }))
    const { fx } = setup(lastCommit)
    const a = fx.deadlines({ github, intra })
    const b = fx.deadlines({ github, intra })
    await Promise.resolve()
    release(null)
    await Promise.all([a, b])
    expect(lastCommit).toHaveBeenCalledTimes(1)
  })
})
