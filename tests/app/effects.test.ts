import { describe, expect, test, vi } from 'vitest'
import { clip, createEffects, TEAMS_DEDUP_TTL, teamsKey } from '../../src/main/app/effects'
import { projectKey } from '../../src/shared/projects'
import type { Commit, MyEpitechData, MyProject, ServiceId, Settings } from '../../src/shared/types'

const NOW = Date.parse('2026-01-10T12:00:00Z')
const settings: Settings = { repoLinks: {}, projectRepoLinks: {}, projectTeamsLinks: {}, notify: { github: true, intra: true, myepitech: true, teams: true }, theme: 'dark' }
const repo = { fullName: 'me/B-CPE-200-LIL-2-1-mypoc-me', name: 'B-CPE-200-LIL-2-1-mypoc-me', url: 'u', pushedAt: '', defaultBranch: 'main' }
const project: MyProject = { id: '1', name: 'mypoc', unitCode: 'B-CPE-200', unitName: 'Unit', description: '', start: '2026-01-01T00:00:00Z', end: new Date(NOW + 3 * 3600e3).toISOString(), url: 'https://my.epitech.eu/' }
const profile = { login: 'jane.doe@epitech.eu', name: 'Jane Doe', promotion: 2030, semester: 1, gpa: null, cursus: null }
const myepitech: MyEpitechData = { profile, projects: [project], runs: {} }
const github = { login: '', notifications: [{ id: 'g1', title: 'PR', repo: 'me/x', type: 'PullRequest', url: 'http://g/1', updatedAt: new Date(NOW - 3600e3).toISOString() }], reviewRequests: [], assignedIssues: [], repos: [repo] }

type LastCommit = (f: string, b: string) => Promise<Commit | null>
function setup(lastCommit = vi.fn<LastCommit>(async () => null), primed: ServiceId[] = ['github'], conf: Settings = settings) {
  const marks = new Set<ServiceId>(primed)
  const hub = {
    prime: vi.fn((_k: string[], s?: ServiceId) => { if (s) marks.add(s) }),
    isPrimed: (s: ServiceId) => marks.has(s),
    push: vi.fn((_k: string, _s: ServiceId, _t: string, _b: string, _u?: string) => true)
  }
  let now = NOW
  const fx = createEffects({ lastCommit, settings: () => conf, hub, now: () => now })
  return { fx, hub, lastCommit, advance: (ms: number) => { now += ms } }
}

describe('effets après rafraîchissement', () => {
  test('pousse alerte de rendu (My Epitech) et notification GitHub avec les bonnes clés', async () => {
    const { fx, hub } = setup()
    await fx.afterRefresh({ github, myepitech })
    expect(hub.push.mock.calls.map((c) => [c[0], c[1]])).toEqual([['myepitech:deadline:mye-1:urgent', 'myepitech'], ['github:g1', 'github']])
  })

  test('rendus depuis My Epitech : projets à venir seulement', async () => {
    const past = { ...project, id: '2', name: 'Old one', end: new Date(NOW - 3600e3).toISOString() }
    const views = await setup().fx.deadlines({ myepitech: { ...myepitech, projects: [project, past] } })
    expect(views).toHaveLength(1)
    expect(views[0]).toMatchObject({ id: 'mye-1', moduleCode: 'B-CPE-200', projectCode: 'mypoc', title: 'mypoc', end: project.end, url: 'https://my.epitech.eu/' })
  })

  test('les données intranet ne produisent plus rien', async () => {
    const { fx, hub } = setup()
    await fx.afterRefresh({ intra: null })
    expect(hub.push).not.toHaveBeenCalled()
    expect(hub.prime).not.toHaveBeenCalled()
  })

  test('cache des derniers commits pendant 5 minutes', async () => {
    const { fx, lastCommit, advance } = setup()
    await fx.deadlines({ github, myepitech })
    await fx.deadlines({ github, myepitech })
    expect(lastCommit).toHaveBeenCalledTimes(1)
    advance(5 * 60_000 + 1)
    await fx.deadlines({ github, myepitech })
    expect(lastCommit).toHaveBeenCalledTimes(2)
  })

  test('une erreur lastCommit ne casse pas le calcul', async () => {
    const { fx } = setup(vi.fn<LastCommit>(async () => { throw new Error('x') }))
    const views = await fx.deadlines({ github, myepitech })
    expect(views).toHaveLength(1)
    expect(views[0]!.lastCommit).toBeNull()
  })

  test('repo lié sur la page projet prioritaire sur le lien du rendu et l’automatique', async () => {
    const other = { ...repo, fullName: 'me/other', name: 'other' }
    const old = { ...repo, fullName: 'me/old', name: 'old' }
    const gh = { ...github, repos: [repo, other, old] }
    const key = projectKey('B-CPE-200', 'mypoc')
    const d1 = 'mye-1'
    const run = async (links: Partial<Settings>): Promise<string | undefined> =>
      (await setup(undefined, undefined, { ...settings, ...links }).fx.deadlines({ github: gh, myepitech }))[0]!.repo?.fullName
    expect(await run({ projectRepoLinks: { [key]: 'me/other' }, repoLinks: { [d1]: 'me/old' } })).toBe('me/other')
    expect(await run({ projectRepoLinks: { [key]: 'me/gone' }, repoLinks: { [d1]: 'me/old' } })).toBe('me/old')
    expect(await run({ projectRepoLinks: { [key]: 'me/gone' } })).toBe(repo.fullName)
  })

  test('sans données My Epitech, aucune vue', async () => {
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
    await fx.afterRefresh({ github, myepitech })
    expect(hub.prime).toHaveBeenCalledWith(['github:g1'], 'github')
    expect(hub.prime).toHaveBeenCalledTimes(1)
    expect(hub.push.mock.calls.map((c) => c[0])).toEqual(['myepitech:deadline:mye-1:urgent'])
    await fx.afterRefresh({ github: { ...github, notifications: [...github.notifications, { ...github.notifications[0]!, id: 'g2' }] }, myepitech })
    expect(hub.push.mock.calls.map((c) => c[0])).toContain('github:g2')
  })

  test('notifications de plus de 7 jours ignorées', async () => {
    const { fx, hub } = setup()
    const old = new Date(NOW - 8 * 864e5).toISOString()
    await fx.afterRefresh({
      github: { ...github, notifications: [{ ...github.notifications[0]!, updatedAt: old }] },
      myepitech: { ...myepitech, projects: [] }
    })
    expect(hub.push).not.toHaveBeenCalled()
  })

  test('service configuré plus tard : amorcé à son premier passage, sans rafale', async () => {
    const { fx, hub } = setup(undefined, [])
    await fx.afterRefresh({ myepitech: { ...myepitech, projects: [] } })
    expect(hub.prime).not.toHaveBeenCalled()
    await fx.afterRefresh({ github, myepitech })
    expect(hub.prime).toHaveBeenCalledWith(['github:g1'], 'github')
    expect(hub.push.mock.calls.map((c) => c[0])).not.toContain('github:g1')
    await fx.afterRefresh({ github: { ...github, notifications: [{ ...github.notifications[0]!, id: 'g3' }] }, myepitech })
    expect(hub.push.mock.calls.map((c) => c[0])).toContain('github:g3')
  })

  test('appels simultanés : un seul lastCommit par repo', async () => {
    let release!: (c: Commit | null) => void
    const lastCommit = vi.fn<LastCommit>(() => new Promise((r) => { release = r }))
    const { fx } = setup(lastCommit)
    const a = fx.deadlines({ github, myepitech })
    const b = fx.deadlines({ github, myepitech })
    await Promise.resolve()
    release(null)
    await Promise.all([a, b])
    expect(lastCommit).toHaveBeenCalledTimes(1)
  })
})
