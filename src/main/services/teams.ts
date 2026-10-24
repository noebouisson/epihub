import type { TeamsData } from '../../shared/types'
import { NeedsLoginError, NotReadyError, type Service } from './types'

const LOGIN_HOSTS = new Set(['login.microsoftonline.com', 'login.live.com', 'login.microsoft.com'])

/** Titre `(3) Chat | Microsoft Teams` → 3 ; `(99+)` → 99 ; sinon 0. */
export function parseUnread(title: string): number {
  const m = /^\((\d+)\+?\)/.exec(title)
  return m ? Number(m[1]) : 0
}

export function isLoginUrl(url: string): boolean {
  try {
    return LOGIN_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

export interface TeamsService extends Service<'teams'> {
  /** Renvoie true si l'état utile (connexion / non-lus) a changé. */
  onTitle(title: string): boolean
  onNavigate(url: string): boolean
}

export function createTeamsService(): TeamsService {
  let title: string | null = null
  let url: string | null = null
  const state = (): string => {
    if (url === null && title === null) return 'pending'
    if (url !== null && isLoginUrl(url)) return 'login'
    return `unread:${parseUnread(title ?? '')}`
  }
  let last = state()
  const changed = (): boolean => {
    const next = state()
    if (next === last) return false
    last = next
    return true
  }
  return {
    id: 'teams',
    onTitle(t) {
      title = t
      return changed()
    },
    onNavigate(u) {
      url = u
      return changed()
    },
    async refresh(): Promise<TeamsData> {
      if (url === null && title === null) throw new NotReadyError('Teams pas encore ouvert')
      if (url !== null && isLoginUrl(url)) throw new NeedsLoginError()
      return { unread: parseUnread(title ?? '') }
    }
  }
}
