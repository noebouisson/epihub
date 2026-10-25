const TEAMS_HOSTS = new Set(['teams.microsoft.com', 'teams.cloud.microsoft'])

/** Clé de projet : « MODULE/nom compact » (sans accents, minuscules, sans espaces, `_` ni `-`). */
export function projectKey(moduleCode: string, name: string): string {
  const compact = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_-]+/g, '')
  return `${moduleCode.toUpperCase()}/${compact}`
}

/** Lien Teams accepté seulement en https avec un hôte Teams connu. */
export function isTeamsUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && TEAMS_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

/** Projet identifiable par sa clé canonique et ses alias (clé intranet, clé du slug, clé du nom). */
export interface ProjectKeys {
  key: string
  aliases: string[]
}

const keysOf = (p: ProjectKeys): string[] => [...new Set([p.key, ...p.aliases])]

/** Projet dont la clé canonique ou l'un des alias vaut `key`. */
export function findProject<T extends ProjectKeys>(list: T[], key: string): T | undefined {
  return list.find((p) => p.key === key) ?? list.find((p) => p.aliases.includes(key))
}

/** Lien enregistré pour un projet : clé canonique d'abord, puis les alias dans l'ordre ; `accept` écarte une valeur. */
export function resolveLink(map: Record<string, string>, p: ProjectKeys, accept: (value: string) => boolean = () => true): string | null {
  for (const k of keysOf(p)) {
    const v = map[k]
    if (typeof v === 'string' && v && accept(v)) return v
  }
  return null
}

/** Nouvelle table de liens : `value` écrit sous chaque clé du projet, ou retiré de chacune si `null`. */
export function linkPatch(map: Record<string, string>, p: ProjectKeys, value: string | null): Record<string, string> {
  const next = { ...map }
  for (const k of keysOf(p)) {
    if (value === null) delete next[k]
    else next[k] = value
  }
  return next
}
