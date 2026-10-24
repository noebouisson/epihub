import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, test } from 'vitest'
import { createGithubService } from '../../src/main/services/github'
import { NeedsLoginError, type FetchLike } from '../../src/main/services/types'

const fx = (n: string): string => readFileSync(`tests/fixtures/github/${n}.json`, 'utf8')

let calls: { url: string; headers: Record<string, string> }[]
let status401: boolean
let force304: boolean

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
  let body: string
  if (url.endsWith('/user')) body = fx('user')
  else if (url.includes('/notifications')) body = fx('notifications')
  else if (url.includes('review-requested')) body = fx('review-requests')
  else if (url.includes('assignee')) body = fx('assigned')
  else if (url.includes('/user/repos')) body = fx('repos')
  else if (url.includes('/commits')) body = fx('commits')
  else return res(404, '{}')
  return res(200, body, 'W/"etag-1"')
}

let svc: ReturnType<typeof createGithubService>
beforeEach(() => {
  calls = []
  status401 = false
  force304 = false
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
  test('lastCommit renvoie le dernier commit', async () => {
    expect(await svc.lastCommit('me/r', 'main')).toMatchObject({ sha: 'abc123', author: 'Octocat', message: 'init' })
  })
  test('lastCommit sur repo vide (409) → null', async () => {
    expect(await svc.lastCommit('me/empty', 'main')).toBeNull()
  })
})
