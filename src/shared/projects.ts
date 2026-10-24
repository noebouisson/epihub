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
