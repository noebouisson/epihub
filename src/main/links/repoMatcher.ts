import type { Deadline, Repo } from '../../shared/types'

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[_\s]+/g, '-')
}

/** Forme compacte : normalisée, sans aucun tiret. */
const compact = (s: string): string => normalize(s).replace(/-/g, '')

export function matchRepo(
  deadline: Deadline,
  repos: Repo[],
  manual: Record<string, string>
): { repo: Repo | null; manual: boolean } {
  const linked = manual[deadline.id]
  if (linked) {
    const repo = repos.find((r) => r.fullName === linked)
    if (repo) return { repo, manual: true }
  }

  const project = compact(deadline.projectCode ?? '')
  // « contient projectCode » ou « contient moduleCode ET projectCode » ⇒ équivaut à « contient projectCode ».
  // Sans code projet on ne devine pas : le code module seul est trop ambigu.
  if (!project) return { repo: null, manual: false }

  const candidates = repos.filter((r) => compact(r.name).includes(project))
  if (candidates.length === 0) return { repo: null, manual: false }

  const best = candidates.reduce((a, b) => (Date.parse(b.pushedAt) > Date.parse(a.pushedAt) ? b : a))
  return { repo: best, manual: false }
}
