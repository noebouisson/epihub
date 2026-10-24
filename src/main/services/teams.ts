import type { TeamsData } from '../../shared/types'
import { NeedsLoginError, type Service } from './types'

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

export function createTeamsService(): Service<'teams'> & { onTitle(title: string): void; onNavigate(url: string): void } {
  let title: string | null = null
  let url: string | null = null
  return {
    id: 'teams',
    onTitle(t) {
      title = t
    },
    onNavigate(u) {
      url = u
    },
    async refresh(): Promise<TeamsData> {
      if (url === null && title === null) throw new Error('Teams pas encore ouvert')
      if (url !== null && isLoginUrl(url)) throw new NeedsLoginError()
      return { unread: parseUnread(title ?? '') }
    }
  }
}
