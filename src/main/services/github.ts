import type { Commit, GhItem, GhNotification, GithubData, PullSummary, Repo } from '../../shared/types'
import { type FetchLike, NeedsLoginError, type Service } from './types'

const API = 'https://api.github.com'

/** URL web dérivée de l'URL d'API du sujet d'une notification. */
function webUrl(subjectUrl: string | null | undefined, fallback: string): string {
  const m = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/(pulls|issues)\/(\d+)$/.exec(subjectUrl ?? '')
  if (!m) return fallback
  return `https://github.com/${m[1]}/${m[2] === 'pulls' ? 'pull' : 'issues'}/${m[3]}`
}

const repoFromApiUrl = (u: string): string => u.replace(/^https:\/\/api\.github\.com\/repos\//, '')

export function createGithubService(
  fetch: FetchLike,
  getToken: () => string | null
): Service<'github'> & {
  lastCommit(fullName: string, branch: string): Promise<Commit | null>
  recentCommits(fullName: string, branch: string): Promise<Commit[]>
  openPulls(fullName: string): Promise<PullSummary[]>
  rootContents(fullName: string): Promise<{ name: string; type: 'file' | 'dir' }[]>
} {
  const cache = new Map<string, { etag: string; body: string }>()

  /** Renvoie le JSON décodé, ou null si le statut fait partie de `nullOn`. */
  async function get(path: string, nullOn: readonly number[] = []): Promise<any> {
    const token = getToken()
    if (!token) throw new NeedsLoginError('Token GitHub manquant')
    const url = API + path
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
    const cached = cache.get(url)
    if (cached) headers['If-None-Match'] = cached.etag
    const res = await fetch(url, { headers })
    if (res.status === 401) throw new NeedsLoginError('Token GitHub invalide')
    if (res.status === 304 && cached) return JSON.parse(cached.body)
    if (nullOn.includes(res.status)) return null
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`)
    const body = await res.text()
    const etag = res.headers.get('etag')
    if (etag) cache.set(url, { etag, body })
    return JSON.parse(body)
  }

  const toItem = (i: any, kind: 'pr' | 'issue'): GhItem => ({
    id: i.id,
    title: i.title,
    repo: repoFromApiUrl(i.repository_url),
    url: i.html_url,
    updatedAt: i.updated_at,
    kind
  })

  const toCommit = (c: any): Commit => ({
    sha: c.sha,
    message: String(c.commit.message).split('\n')[0],
    author: c.commit.author?.name ?? '',
    date: c.commit.author?.date ?? '',
    url: c.html_url
  })

  const commitsOf = async (fullName: string, branch: string, perPage: number): Promise<Commit[]> =>
    ((await get(`/repos/${fullName}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}`, [409])) ?? []).map(toCommit)

  return {
    id: 'github',
    async refresh(): Promise<GithubData> {
      const user = await get('/user')
      const [notifs, reviews, assigned, repos] = await Promise.all([
        // Les tokens fins (fine-grained) n'ont pas accès aux notifications : 403/404 → liste vide.
        get('/notifications?per_page=50', [403, 404]).then((n) => n ?? []),
        get('/search/issues?q=is:open+is:pr+review-requested:@me&per_page=30'),
        get('/search/issues?q=is:open+is:issue+assignee:@me&per_page=30'),
        get('/user/repos?sort=pushed&per_page=100')
      ])
      const notifications: GhNotification[] = (notifs as any[]).map((n) => ({
        id: n.id,
        title: n.subject.title,
        repo: n.repository.full_name,
        type: n.subject.type,
        url: webUrl(n.subject.url, n.repository.html_url),
        updatedAt: n.updated_at
      }))
      return {
        login: user.login,
        notifications,
        reviewRequests: (reviews.items as any[]).map((i) => toItem(i, 'pr')),
        assignedIssues: (assigned.items as any[]).map((i) => toItem(i, 'issue')),
        repos: (repos as any[]).map(
          (r): Repo => ({
            fullName: r.full_name,
            name: r.name,
            url: r.html_url,
            pushedAt: r.pushed_at,
            defaultBranch: r.default_branch
          })
        )
      }
    },
    async lastCommit(fullName, branch): Promise<Commit | null> {
      return (await commitsOf(fullName, branch, 1))[0] ?? null
    },
    recentCommits: (fullName, branch) => commitsOf(fullName, branch, 5),
    async rootContents(fullName): Promise<{ name: string; type: 'file' | 'dir' }[]> {
      if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) throw new Error('GitHub: dépôt invalide')
      // 404 : dépôt vide ou inaccessible (liste vide) ; l'appelant traite une erreur comme « pas de contrôle ».
      const list = await get(`/repos/${fullName}/contents`, [404])
      if (list === null) return []
      if (!Array.isArray(list)) throw new Error('GitHub: réponse inattendue')
      return list.map((e) => ({ name: String(e.name), type: e.type === 'dir' ? ('dir' as const) : ('file' as const) }))
    },
    async openPulls(fullName): Promise<PullSummary[]> {
      const list = await get(`/repos/${fullName}/pulls?state=open&per_page=10`)
      if (!Array.isArray(list)) throw new Error('GitHub: réponse inattendue')
      return list.map((p) => ({
        number: p.number,
        title: p.title,
        url: p.html_url,
        author: p.user?.login ?? '',
        updatedAt: p.updated_at
      }))
    }
  }
}
