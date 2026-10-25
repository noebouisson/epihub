import type { AlertLevel, Commit, Deadline, DeadlineView, Repo } from '../../shared/types'
import { matchRepo } from './repoMatcher'

const HOUR = 3600e3

export function alertLevel(end: Date, lastCommit: Commit | null, hasRepo: boolean, now: Date): AlertLevel | null {
  const ms = end.getTime() - now.getTime()
  if (ms <= 0 || ms >= 48 * HOUR) return null
  const stale = !lastCommit || now.getTime() - Date.parse(lastCommit.date) > 24 * HOUR
  if (hasRepo && !stale) return null
  return ms < 6 * HOUR ? 'urgent' : 'warning'
}

export function buildDeadlineViews(
  deadlines: Deadline[],
  repos: Repo[],
  commits: Record<string, Commit | null>,
  manual: Record<string, string>,
  now: Date
): DeadlineView[] {
  return deadlines
    .filter((d) => Date.parse(d.end) > now.getTime())
    .sort((a, b) => Date.parse(a.end) - Date.parse(b.end))
    .map((d) => {
      const m = matchRepo(d, repos, manual)
      const lastCommit = m.repo ? (commits[m.repo.fullName] ?? null) : null
      return { ...d, repo: m.repo, lastCommit, alert: alertLevel(new Date(d.end), lastCommit, m.repo !== null, now), manual: m.manual }
    })
}

export function alertKey(v: DeadlineView): string | null {
  return v.alert ? `myepitech:deadline:${v.id}:${v.alert}` : null
}
