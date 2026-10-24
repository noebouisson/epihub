import type { Deadline, IntraData, IntraEvent, IntraNotification } from '../../shared/types'
import { normalize } from '../links/repoMatcher'
import { type FetchLike, NeedsLoginError, type Service } from './types'

const BASE = 'https://intra.epitech.eu'

/** "dd/mm/yyyy, HH:MM" ou "yyyy-mm-dd HH:MM:SS" (heure locale) → ISO. */
export function parseIntraDate(s: string): string {
  let m = /^(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).toISOString()
  m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim())
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0).toISOString()
  throw new Error(`Format de date intranet inconnu : ${s}`)
}

/**
 * Code module extrait du lien (`/module/<année>/<CODE>/...`). Le code projet vient du titre
 * (`normalize` du titre sans espaces) ; il est vide si aucun titre n'est fourni.
 */
export function parseTitleLink(link: string, title = ''): { moduleCode: string; projectCode: string } {
  const m = /^\/module\/\d+\/([^/]+)\//.exec(link)
  if (!m) return { moduleCode: '', projectCode: '' }
  return { moduleCode: m[1], projectCode: title ? normalize(title.replace(/\s+/g, '')) : '' }
}

const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

function safeDate(s: string): string | null {
  try {
    return parseIntraDate(s)
  } catch {
    return null
  }
}

async function getJson(fetch: FetchLike, path: string): Promise<any> {
  const res = await fetch(BASE + path)
  if (res.status === 401 || res.status === 403) throw new NeedsLoginError()
  const text = await res.text()
  if (!/^\s*[{[]/.test(text)) throw new NeedsLoginError()
  const json = JSON.parse(text)
  if (json && typeof json === 'object' && 'message' in json && !('board' in json) && !('login' in json)) {
    throw new NeedsLoginError()
  }
  if (!res.ok) throw new Error(`Intranet HTTP ${res.status}`)
  return json
}

export function createIntraService(fetch: FetchLike): Service<'intra'> {
  return {
    id: 'intra',
    async refresh(): Promise<IntraData> {
      const [user, board] = await Promise.all([getJson(fetch, '/user/?format=json'), getJson(fetch, '/?format=json')])

      const deadlines: Deadline[] = []
      for (const p of board.board?.projets ?? []) {
        const end = safeDate(p.timeline_end)
        if (!end) continue
        deadlines.push({
          id: `acti-${p.id_activite}`,
          moduleCode: parseTitleLink(p.title_link).moduleCode,
          projectCode: normalize(String(p.title).replace(/\s+/g, '')),
          title: p.title,
          end,
          url: BASE + p.title_link
        })
      }

      const events: IntraEvent[] = []
      for (const a of board.board?.activites ?? []) {
        const start = safeDate(a.timeline_start)
        const end = safeDate(a.timeline_end)
        if (!start || !end) continue
        events.push({ id: a.title_link, title: a.title, start, end, url: BASE + a.title_link })
      }

      const notifications: IntraNotification[] = []
      for (const h of board.history ?? []) {
        const date = safeDate(h.date)
        if (!date) continue
        notifications.push({ id: String(h.id), title: stripTags(String(h.title)), date })
      }

      return {
        login: user.login,
        promo: user.promo,
        credits: user.credits,
        gpa: String(user.gpa?.[0]?.gpa ?? ''),
        deadlines,
        events,
        notifications
      }
    }
  }
}
