import type { MyEpitechData, SkillReport, TestResult, TestRun } from '../../shared/types'
import { type FetchLike, NeedsLoginError, type Service } from './types'

/** Page chargée (fenêtre cachée) pour que le SPA écrive son token, et clé localStorage du token. */
export const MYEPITECH_HOME = 'https://my.epitech.eu/'
export const MYEPITECH_TOKEN_KEY = 'argos-api.oidc-token'

/** Décode la valeur brute du localStorage (chaîne JSON entre guillemets ou non) → token ou null. */
export function tokenFromStorage(raw: string | null | undefined): string | null {
  const t = raw?.replace(/^"+|"+$/g, '').trim()
  return t ? t : null
}

/** true si le token est un JWT dont `exp` est passé (le token est alors traité comme absent). */
export function isExpiredJwt(token: string, nowMs: number): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: unknown }
    return typeof payload.exp === 'number' && payload.exp * 1000 <= nowMs
  } catch {
    return false
  }
}

/** Token utilisable : présent et non expiré. */
export function usableToken(raw: string | null | undefined, nowMs: number): string | null {
  const t = tokenFromStorage(raw)
  return t && !isExpiredJwt(t, nowMs) ? t : null
}

/** Année scolaire : l'année si le mois est ≥ septembre, sinon l'année − 1. */
export function scholarYear(now: Date): number {
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
}

function percentOf(skills: any): number {
  let count = 0
  let passed = 0
  for (const s of Object.values(skills ?? {}) as any[]) {
    count += Number(s?.count) || 0
    passed += Number(s?.passed) || 0
  }
  return count === 0 ? 0 : Math.round((100 * passed) / count)
}

export function createMyEpitechService(
  fetch: FetchLike,
  getToken: () => Promise<string | null>,
  now: () => Date = () => new Date()
): Service<'myepitech'> & {
  history(module: string, slug: string): Promise<TestRun[]>
  runDetails(testRunId: string): Promise<SkillReport[]>
} {
  const BAD_FORMAT = 'Format My Epitech inattendu'

  /** GET authentifié sur l'API Epitest ; renvoie le texte de la réponse. */
  async function apiGet(url: string): Promise<string> {
    const token = await getToken()
    if (!token) throw new NeedsLoginError()
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401 || res.status === 403) throw new NeedsLoginError()
    if (!res.ok) throw new Error(`My Epitech HTTP ${res.status}`)
    return res.text()
  }

  async function apiJson(url: string): Promise<any> {
    try {
      return JSON.parse(await apiGet(url))
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error(BAD_FORMAT)
      throw e
    }
  }

  return {
    id: 'myepitech',
    async refresh(): Promise<MyEpitechData> {
      const year = scholarYear(now())
      const entries = JSON.parse(await apiGet(`https://api.epitest.eu/me/${year}`)) as any[]
      const results: TestResult[] = entries.map((e) => {
        const id = String(e.results?.testRunId ?? e.id)
        return {
          id,
          project: e.project.name,
          module: e.project.module.code,
          slug: e.project.slug,
          date: e.date,
          percent: percentOf(e.results?.skills),
          url: `https://my.epitech.eu/index.html#d/${year}/${e.project.module.code}/${e.project.slug}/${id}`
        }
      })
      results.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      return { results }
    },
    async history(module, slug): Promise<TestRun[]> {
      const year = scholarYear(now())
      const entries = await apiJson(`https://api.epitest.eu/me/${year}/${encodeURIComponent(module)}/${encodeURIComponent(slug)}`)
      if (!Array.isArray(entries)) throw new Error(BAD_FORMAT)
      const runs = entries.map((e): TestRun => {
        const id = e?.results?.testRunId ?? e?.id
        if (id == null || typeof e.date !== 'string' || Number.isNaN(Date.parse(e.date)) || !e.results || typeof e.results !== 'object') {
          throw new Error(BAD_FORMAT)
        }
        return { id: String(id), date: e.date, percent: percentOf(e.results.skills) }
      })
      return runs.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    },
    async runDetails(testRunId): Promise<SkillReport[]> {
      const json = await apiJson(`https://api.epitest.eu/me/details/${encodeURIComponent(testRunId)}`)
      const skills = json?.results?.skills ?? json?.skills
      // Tableau, ou objet indexé par nom de compétence ; chaque valeur : { FullSkillReport: {...} } ou directement {...}.
      const entries: [string | undefined, any][] = Array.isArray(skills)
        ? skills.map((v) => [undefined, v])
        : skills && typeof skills === 'object'
          ? Object.entries(skills)
          : []
      if (entries.length === 0 && !Array.isArray(skills)) throw new Error(BAD_FORMAT)
      return entries.map(([key, v]): SkillReport => {
        const r = v?.FullSkillReport ?? v
        const name = typeof r?.name === 'string' ? r.name : key
        if (typeof name !== 'string' || !Array.isArray(r?.tests)) throw new Error(BAD_FORMAT)
        const tests = r.tests.map((t: any) => {
          if (typeof t?.name !== 'string') throw new Error(BAD_FORMAT)
          return { name: t.name, passed: t.passed === true, crashed: t.crashed === true }
        })
        return { name, passed: tests.filter((t: { passed: boolean }) => t.passed).length, count: tests.length, tests }
      })
    }
  }
}
