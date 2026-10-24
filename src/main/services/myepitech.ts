import type { MyEpitechData, TestResult } from '../../shared/types'
import { type FetchLike, NeedsLoginError, type Service } from './types'

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
): Service<'myepitech'> {
  return {
    id: 'myepitech',
    async refresh(): Promise<MyEpitechData> {
      const token = await getToken()
      if (!token) throw new NeedsLoginError()
      const year = scholarYear(now())
      const res = await fetch(`https://api.epitest.eu/me/${year}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401 || res.status === 403) throw new NeedsLoginError()
      if (!res.ok) throw new Error(`My Epitech HTTP ${res.status}`)
      const entries = JSON.parse(await res.text()) as any[]
      const results: TestResult[] = entries.map((e) => ({
        id: String(e.id),
        project: e.project.name,
        module: e.project.module.code,
        date: e.date,
        percent: percentOf(e.results?.skills),
        url: `https://my.epitech.eu/index.html#d/${year}/${e.project.module.code}/${e.project.slug}/${e.id}`
      }))
      results.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      return { results }
    }
  }
}
