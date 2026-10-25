import { projectKey } from '../../shared/projects'
import type { Commit, Deadline, DeadlineView, MyEpitechData, Repo, ServiceDataMap, ServiceId, Settings } from '../../shared/types'
import { alertKey, buildDeadlineViews } from '../links/deadlineAlerts'
import { normalize } from '../links/repoMatcher'

const COMMIT_TTL = 5 * 60_000
const MAX_TEXT = 200
const SEVEN_DAYS = 7 * 864e5
/** Fenêtre de déduplication des notifications Teams (le même message peut légitimement revenir). */
export const TEAMS_DEDUP_TTL = 2 * 60_000

type Data = Partial<{ [K in ServiceId]: ServiceDataMap[K] | null }>

export interface EffectsDeps {
  lastCommit(fullName: string, branch: string): Promise<Commit | null>
  settings(): Settings
  hub: {
    push(key: string, service: ServiceId, title: string, body: string, url?: string): boolean
    /** Marque sans notifier ; avec `service`, pose le marqueur d'amorçage de ce service. */
    prime(keys: string[], service?: ServiceId): void
    isPrimed(service: ServiceId): boolean
  }
  now(): number
}

export const clip = (s: unknown, max = MAX_TEXT): string => String(s ?? '').slice(0, max)

/** Clé de déduplication d'une notification Teams (la charge utile vient de la page : à plafonner). */
export function teamsKey(title: string, body: string, tag: string): string {
  return `teams:${tag}|${title}|${body}`
}

/** Rendus : projets My Epitech inscrits dont la fin est dans le futur. */
export function deadlinesFrom(data: MyEpitechData | null | undefined, nowMs: number): Deadline[] {
  return (data?.projects ?? [])
    .filter((p) => Date.parse(p.end) > nowMs)
    .map((p) => ({ id: `mye-${p.id}`, moduleCode: p.unitCode, projectCode: normalize(p.name), title: p.name, end: p.end, url: p.url }))
}

/**
 * Lien manuel par échéance : repo lié sur la page projet (clé du projet, s'il existe encore),
 * sinon lien posé sur le rendu ; l'association automatique reste le dernier recours.
 */
export function deadlineRepoLinks(deadlines: Deadline[], repos: Repo[], settings: Pick<Settings, 'repoLinks' | 'projectRepoLinks'>): Record<string, string> {
  const links: Record<string, string> = { ...settings.repoLinks }
  for (const d of deadlines) {
    const linked = settings.projectRepoLinks[projectKey(d.moduleCode, d.title)]
    if (linked && repos.some((r) => r.fullName === linked)) links[d.id] = linked
  }
  return links
}

export function createEffects(deps: EffectsDeps) {
  const commits = new Map<string, { at: number; commit: Commit | null }>()
  const inFlight = new Map<string, Promise<Commit | null>>()

  function commitFor(repo: Repo): Promise<Commit | null> {
    const hit = commits.get(repo.fullName)
    if (hit && deps.now() - hit.at < COMMIT_TTL) return Promise.resolve(hit.commit)
    // Un seul appel réseau à la fois par repo : les demandes simultanées partagent la promesse.
    const pending = inFlight.get(repo.fullName)
    if (pending) return pending
    const p = (async () => {
      try {
        const commit = await deps.lastCommit(repo.fullName, repo.defaultBranch)
        commits.set(repo.fullName, { at: deps.now(), commit })
        return commit
      } catch {
        // Erreur réseau ou token : on réessaiera au prochain rafraîchissement.
        return hit?.commit ?? null
      } finally {
        inFlight.delete(repo.fullName)
      }
    })()
    inFlight.set(repo.fullName, p)
    return p
  }

  async function deadlines(data: Data): Promise<DeadlineView[]> {
    if (!data.myepitech) return []
    const list = deadlinesFrom(data.myepitech, deps.now())
    const repos = data.github?.repos ?? []
    const manual = deadlineRepoLinks(list, repos, deps.settings())
    const now = new Date(deps.now())
    const first = buildDeadlineViews(list, repos, {}, manual, now)
    const linked = new Map<string, Repo>()
    for (const v of first) if (v.repo) linked.set(v.repo.fullName, v.repo)
    const fetched: Record<string, Commit | null> = {}
    await Promise.all([...linked.values()].map(async (r) => { fetched[r.fullName] = await commitFor(r) }))
    return buildDeadlineViews(list, repos, fetched, manual, now)
  }

  return {
    deadlines,
    /** À appeler après chaque rafraîchissement : alertes de rendu + nouvelles notifications GitHub. */
    async afterRefresh(data: Data): Promise<void> {
      for (const v of await deadlines(data)) {
        const key = alertKey(v)
        if (!key) continue
        const urgent = v.alert === 'urgent'
        deps.hub.push(key, 'myepitech', urgent ? 'Rendu urgent' : 'Rendu bientôt dû', `${v.title} — fin ${new Date(v.end).toLocaleString('fr-FR')}`, v.url)
      }
      const recent = (date: string): boolean => {
        const t = Date.parse(date)
        return Number.isNaN(t) || deps.now() - t <= SEVEN_DAYS
      }
      const batch = (service: 'github', items: { key: string; date: string; title: string; body: string; url?: string }[]): void => {
        const fresh = items.filter((i) => recent(i.date))
        // Première fois que ce service est traité sur ce poste : on amorce sans rafale de notifications.
        if (!deps.hub.isPrimed(service)) deps.hub.prime(fresh.map((i) => i.key), service)
        else for (const i of fresh) deps.hub.push(i.key, service, i.title, i.body, i.url)
      }
      if (data.github) batch('github', data.github.notifications.map((n) => ({ key: `github:${n.id}`, date: n.updatedAt, title: n.title, body: n.repo, url: n.url })))
    }
  }
}
