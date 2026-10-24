import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, test } from 'vitest'
import { createGithubService } from '../../src/main/services/github'
import { NeedsLoginError, type FetchLike } from '../../src/main/services/types'

const fx = (n: string): string => readFileSync(`tests/fixtures/github/${n}.json`, 'utf8')

let calls: { url: string; headers: Record<string, string> }[]
let status401: boolean
let force304: boolean
let notifStatus: number

const fakeFetch: FetchLike = async (url, init) => {
  const headers = init?.headers ?? {}
  calls.push({ url, headers })
  const res = (status: number, body: string, etag?: string) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (n: string) => (n.toLowerCase() === 'etag' ? (etag ?? null) : null) },
    text: async () => body
  })
  if (status401) return res(401, '{}')
  if (force304) return res(304, '')
  if (url.includes('/repos/me/empty/commits')) return res(409, '{}')
  if (url.includes('/notifications') && notifStatus !== 200) return res(notifStatus, '{"message":"Resource not accessible by personal access token"}')
  let body: string
  if (url.endsWith('/user')) body = fx('user')
  else if (url.includes('/notifications')) body = fx('notifications')
  else if (url.includes('review-requested')) body = fx('review-requests')
  else if (url.includes('assignee')) body = fx('assigned')
  else if (url.includes('/user/repos')) body = fx('repos')
  else if (url.includes('/pulls')) body = fx('pulls')
  else if (url.includes('per_page=5')) body = fx('commits-5')
  else if (url.includes('/commits')) body = fx('commits')
  else return res(404, '{}')
  return res(200, body, 'W/"etag-1"')
}

let svc: ReturnType<typeof createGithubService>
beforeEach(() => {
  calls = []
  status401 = false
  force304 = false
  notifStatus = 200
  svc = createGithubService(fakeFetch, () => 'ghp_test')
})

describe('github service', () => {
  test('refresh assemble toutes les données', async () => {
    const d = await svc.refresh()
    expect(d.login).toBe('octocat')
    expect(d.notifications[0].url).toBe('https://github.com/me/r/pull/3')
    expect(d.notifications[1].url).toBe('https://github.com/me/r/issues/7')
    expect(d.reviewRequests[0]).toMatchObject({ kind: 'pr', repo: 'me/r' })
    expect(d.assignedIssues[0]).toMatchObject({ kind: 'issue', repo: 'me/r' })
    expect(d.repos).toHaveLength(2)
  })
  test('envoie le token en Bearer', async () => {
    await svc.refresh()
    expect(calls[0].headers.Authorization).toBe('Bearer ghp_test')
    expect(calls[0].headers.Accept).toBe('application/vnd.github+json')
    expect(calls[0].headers['X-GitHub-Api-Version']).toBe('2022-11-28')
  })
  test('pas de token → NeedsLoginError', async () => {
    await expect(createGithubService(fakeFetch, () => null).refresh()).rejects.toBeInstanceOf(NeedsLoginError)
  })
  test('401 → NeedsLoginError', async () => {
    status401 = true
    await expect(svc.refresh()).rejects.toBeInstanceOf(NeedsLoginError)
  })
  test('304 réutilise le corps mis en cache', async () => {
    await svc.refresh()
    force304 = true
    expect((await svc.refresh()).repos).toHaveLength(2)
    expect(calls.at(-1)?.headers['If-None-Match']).toBe('W/"etag-1"')
  })
  test.each([403, 404])('token fin : notifications %i → liste vide, le reste est gardé', async (st) => {
    notifStatus = st
    const d = await svc.refresh()
    expect(d.notifications).toEqual([])
    expect(d.repos).toHaveLength(2)
    expect(d.reviewRequests).toHaveLength(1)
  })
  test('notifications en 500 → erreur (inchangé)', async () => {
    notifStatus = 500
    await expect(svc.refresh()).rejects.toThrow('GitHub HTTP 500')
  })
  test('lastCommit renvoie le dernier commit', async () => {
    expect(await svc.lastCommit('me/r', 'main')).toMatchObject({ sha: 'abc123', author: 'Octocat', message: 'init' })
  })
  test('lastCommit sur repo vide (409) → null', async () => {
    expect(await svc.lastCommit('me/empty', 'main')).toBeNull()
  })
  test('recentCommits : 5 commits', async () => {
    const c = await svc.recentCommits('me/r', 'main')
    expect(c).toHaveLength(5)
    expect(c[0]).toMatchObject({ sha: 'c5', message: 'feat: five', author: 'Octocat' })
    expect(calls.at(-1)?.url).toBe('https://api.github.com/repos/me/r/commits?sha=main&per_page=5')
  })
  test('recentCommits : repo vide (409) → []', async () => {
    expect(await svc.recentCommits('me/empty', 'main')).toEqual([])
  })
  test('openPulls', async () => {
    expect((await svc.openPulls('me/r'))[0]).toMatchObject({
      number: 3, title: 'Add day 01', url: 'https://github.com/me/r/pull/3', author: 'octocat', updatedAt: '2026-10-24T11:00:00Z'
    })
    expect(calls.at(-1)?.url).toBe('https://api.github.com/repos/me/r/pulls?state=open&per_page=10')
  })
})
