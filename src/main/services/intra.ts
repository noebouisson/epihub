import type { Deadline, IntraData, IntraEvent, IntraNotification, SubjectData } from '../../shared/types'
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
 * (calculé par le service) : il reste vide ici.
 */
export function parseTitleLink(link: string): { moduleCode: string; projectCode: string } {
  const m = /^\/module\/\d+\/([^/]+)\//.exec(link)
  if (!m) return { moduleCode: '', projectCode: '' }
  return { moduleCode: m[1], projectCode: '' }
}

const ENTITIES = new Map([
  ['nbsp', ' '], ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'],
  ['eacute', 'é'], ['egrave', 'è'], ['ecirc', 'ê'], ['euml', 'ë'], ['agrave', 'à'], ['acirc', 'â'], ['ccedil', 'ç'],
  ['ugrave', 'ù'], ['ucirc', 'û'], ['ocirc', 'ô'], ['icirc', 'î'], ['iuml', 'ï'], ['oelig', 'œ'],
  ['Eacute', 'É'], ['Egrave', 'È'], ['Agrave', 'À'], ['Ccedil', 'Ç'],
  ['rsquo', '’'], ['lsquo', '‘'], ['ldquo', '“'], ['rdquo', '”'], ['laquo', '«'], ['raquo', '»'],
  ['hellip', '…'], ['ndash', '–'], ['mdash', '—'], ['euro', '€'], ['deg', '°']
])

/** Décode les entités HTML courantes (nommées, décimales, hexadécimales) ; le reste est laissé tel quel. */
const decodeEntities = (s: string): string =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec?: string, hex?: string, name?: string) => {
    // Sensible à la casse (&Eacute; ≠ &eacute;), avec repli en minuscules pour &AMP;, &NBSP;…
    if (name) return ENTITIES.get(name) ?? ENTITIES.get(name.toLowerCase()) ?? m
    const code = dec ? parseInt(dec, 10) : parseInt(hex as string, 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : m
  })

const stripTags = (s: string): string => decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()

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

const PROJECT_URL = /^https:\/\/intra\.epitech\.eu\/module\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/project\//

/** true pour une page projet de l'intranet (`/module/<année>/<module>/<instance>/<acti>/project/`). */
export function isIntraProjectUrl(url: string): boolean {
  return PROJECT_URL.test(url)
}

const SUBJECT_UNAVAILABLE = 'Sujet indisponible'

/**
 * GET pour la page projet : reconnexion seulement sur 401/403 ou une page de connexion ;
 * un JSON `{message}`, un 404 ou toute autre réponse inattendue → « Sujet indisponible ».
 */
async function getProjectJson(fetch: FetchLike, path: string): Promise<any> {
  const res = await fetch(BASE + path)
  if (res.status === 401 || res.status === 403) throw new NeedsLoginError()
  const text = await res.text()
  if (!/^\s*[{[]/.test(text)) {
    if (text.includes('login.microsoftonline.com') || /<form[\s>]/i.test(text)) throw new NeedsLoginError()
    throw new Error(SUBJECT_UNAVAILABLE)
  }
  if (!res.ok) throw new Error(SUBJECT_UNAVAILABLE)
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(SUBJECT_UNAVAILABLE)
  }
  if (json && typeof json === 'object' && !Array.isArray(json) && 'message' in json && !('title' in json) && !('description' in json)) {
    throw new Error(SUBJECT_UNAVAILABLE)
  }
  return json
}

export function createIntraService(fetch: FetchLike): Service<'intra'> & { projectDetails(url: string): Promise<SubjectData> } {
  return {
    id: 'intra',
    async projectDetails(url): Promise<SubjectData> {
      if (!isIntraProjectUrl(url)) throw new Error('URL intranet invalide')
      const path = url.slice(BASE.length).replace(/[?#].*$/, '').replace(/\/?$/, '/')
      // Liste de fichiers : au mieux (seule une demande de reconnexion est remontée).
      const filesOrEmpty = getProjectJson(fetch, `${path}file/?format=json`).catch((e: unknown) => {
        if (e instanceof NeedsLoginError) throw e
        return []
      })
      const [project, files] = await Promise.all([getProjectJson(fetch, `${path}?format=json`), filesOrEmpty])
      return {
        description: stripTags(project?.description ?? ''),
        files: (Array.isArray(files) ? files : [])
          .filter((f: any) => typeof f?.fullpath === 'string' && f.fullpath.startsWith('/'))
          .map((f: any) => ({ title: String(f.title ?? f.fullpath), url: BASE + f.fullpath }))
      }
    },
    async refresh(): Promise<IntraData> {
      const [user, board] = await Promise.all([getJson(fetch, '/user/?format=json'), getJson(fetch, '/?format=json')])

      const deadlines: Deadline[] = []
      const projets: any[] = board.board?.projets ?? []
      for (const p of projets) {
        const end = safeDate(p.timeline_end)
        if (!end) continue
        deadlines.push({
          id: `acti-${p.id_activite}`,
          moduleCode: parseTitleLink(p.title_link).moduleCode,
          projectCode: normalize(String(p.title)),
          title: p.title,
          end,
          url: BASE + p.title_link
        })
      }
      // Aucune date lisible alors qu'il y a des projets : le format a changé, on le signale.
      if (projets.length > 0 && deadlines.length === 0) throw new Error('Format de date intranet inconnu')

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
