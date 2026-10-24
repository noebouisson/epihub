import Fuse from 'fuse.js'
import type { GhItem, SearchItem, ServiceDataMap, ServiceId } from '../../shared/types'

type Snapshot = Partial<{ [K in ServiceId]: ServiceDataMap[K] | null }>

/** Élément indexé : `codes` (sous-titre en minuscules sans - _ espaces) reste interne, jamais renvoyé. */
interface Indexed { item: SearchItem; codes: string }

const PAGES: SearchItem[] = [
  { id: 'page:home', kind: 'page', title: 'Accueil', service: 'app', url: '' },
  { id: 'page:github', kind: 'page', title: 'GitHub', service: 'github', url: '' },
  { id: 'page:intra', kind: 'page', title: 'Intranet', service: 'intra', url: '' },
  { id: 'page:myepitech', kind: 'page', title: 'My Epitech', service: 'myepitech', url: '' },
  { id: 'page:teams', kind: 'page', title: 'Teams', service: 'teams', url: '' },
  { id: 'page:settings', kind: 'page', title: 'Réglages', service: 'app', url: '' }
]

const squash = (s: string): string => s.toLowerCase().replace(/[-_\s]+/g, '')

export function buildSearchItems(snap: Snapshot): SearchItem[] {
  const out: SearchItem[] = [...PAGES]
  const seen = new Set(out.map((i) => i.id))
  const add = (item: SearchItem): void => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    out.push(item)
  }

  const gh = snap.github
  if (gh) {
    for (const r of gh.repos) add({ id: `repo:${r.fullName}`, kind: 'repo', title: r.name, subtitle: r.fullName, service: 'github', url: r.url, date: r.pushedAt })
    const ghItem = (i: GhItem): void => add({ id: `${i.kind}:${i.id}`, kind: i.kind, title: i.title, subtitle: i.repo, service: 'github', url: i.url, date: i.updatedAt })
    gh.reviewRequests.forEach(ghItem)
    gh.assignedIssues.forEach(ghItem)
  }
  for (const d of snap.intra?.deadlines ?? [])
    add({ id: `deadline:${d.id}`, kind: 'deadline', title: d.title, subtitle: `${d.moduleCode} · ${d.projectCode}`, service: 'intra', url: d.url, date: d.end })
  return out
}

const time = (i: SearchItem): number => (i.date ? Date.parse(i.date) || 0 : 0)

export function search(items: SearchItem[], query: string, limit = 20): SearchItem[] {
  const q = query.trim()
  const compact = squash(q)
  if (!compact) return items.filter((i) => i.kind === 'page').slice(0, limit)

  const indexed: Indexed[] = items.map((item) => ({ item, codes: squash(item.subtitle ?? '') }))
  const fuse = new Fuse(indexed, {
    includeScore: true,
    threshold: 0.4,
    keys: [
      { name: 'item.title', weight: 0.6 },
      { name: 'item.subtitle', weight: 0.2 },
      { name: 'codes', weight: 0.2 }
    ]
  })

  // La requête brute et sa forme compacte sont testées ; on garde le meilleur score.
  const best = new Map<SearchItem, number>()
  for (const term of new Set([q, compact])) {
    for (const r of fuse.search(term)) {
      const score = r.score ?? 1
      const prev = best.get(r.item.item)
      if (prev === undefined || score < prev) best.set(r.item.item, score)
    }
  }
  return [...best.entries()]
    .sort((a, b) => a[1] - b[1] || time(b[0]) - time(a[0]))
    .slice(0, limit)
    .map(([item]) => item)
}
