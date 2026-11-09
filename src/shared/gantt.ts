/* Diagramme de Gantt des projets : projets Epitech depuis My Epitech, projets perso depuis l'export CSV d'AppFlowy. */
import { projectKey } from './projects'
import type { MyProject } from './types'

export interface GanttProject {
  name: string
  status: string
  /** AAAA-MM-JJ */
  start: string
  /** AAAA-MM-JJ, ou null si la date de rendu est inconnue. */
  end: string | null
  category: string
  module: string
  with: string
  verify: boolean
  source: 'myepitech' | 'csv'
  /** Clé du projet EpiHub (projets My Epitech), pour ouvrir sa page. */
  key: string | null
}

export interface GanttResult {
  /** Chemin du CSV lu. */
  path: string
  /** Dernière modification du CSV (ISO), null s'il est absent. */
  modified: string | null
  error: 'missing' | 'read' | null
  projects: GanttProject[]
  /** Projets sans date de début : absents du diagramme. */
  skipped: string[]
  /** Valeurs de date que le parseur n'a pas comprises. */
  unreadable: string[]
}

/** Lit un CSV (guillemets, virgules et retours à la ligne dans les champs, BOM). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  const [head, ...body] = rows.filter((r) => r.some((v) => v.trim() !== ''))
  if (!head) return []
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, janvier: 1, january: 1,
  feb: 2, fev: 2, 'fév': 2, 'févr': 2, fevr: 2, 'février': 2, fevrier: 2, february: 2,
  mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, avril: 4, april: 4,
  may: 5, mai: 5,
  jun: 6, juin: 6, june: 6,
  jul: 7, juil: 7, juillet: 7, july: 7,
  aug: 8, aou: 8, 'aoû': 8, 'août': 8, aout: 8, august: 8,
  sep: 9, sept: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dec: 12, 'déc': 12, 'décembre': 12, decembre: 12, december: 12
}

const pad = (n: number): string => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number): string | null => {
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null
}

/** 2026-11-02, 2026/11/02, 02/11/2026 (jour/mois), Nov 2, 2026, 2 nov. 2026…
 *  Pour une plage (« A → B »), garde la première date. undefined si illisible, null si vide. */
export function parseDate(text: string): string | null | undefined {
  const t = text.trim().split(/\s*(?:→|->|–| - )\s*/)[0]
  if (!t) return null
  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t)
  if (m) return iso(+m[1], +m[2], +m[3]) ?? undefined
  m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(t)
  if (m) {
    let [d, mo] = [+m[1], +m[2]]
    if (mo > 12) [d, mo] = [mo, d] // format US mois/jour
    return iso(+m[3], mo, d) ?? undefined
  }
  const words = t.toLowerCase().match(/[a-zéûô]+|\d+/g) ?? []
  const nums = words.filter((w) => /^\d+$/.test(w)).map(Number)
  const month = words.map((w) => MONTHS[w]).find((v) => v !== undefined)
  const year = nums.find((n) => n > 31)
  const day = nums.find((n) => n >= 1 && n <= 31)
  return month && year && day ? (iso(year, month, day) ?? undefined) : undefined
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const pick = (row: Record<string, string>, ...names: string[]): string => {
  const wanted = names.map(norm)
  const key = Object.keys(row).find((k) => wanted.includes(norm(k)))
  return key ? row[key] : ''
}
const truthy = (v: string): boolean => ['yes', 'oui', 'true', 'vrai', '1', 'x', '✓', 'checked'].includes(norm(v))
const DONE = ['rendu', 'done', 'termine', 'fini']

/** Projets à afficher (statut différent de « Rendu »), triés : en cours d'abord, puis par date de rendu. */
export function buildGantt(csv: string): Pick<GanttResult, 'projects' | 'skipped' | 'unreadable'> {
  const projects: GanttProject[] = []
  const skipped: string[] = []
  const unreadable: string[] = []
  const date = (v: string): string | null => {
    const d = parseDate(v)
    if (d === undefined) { unreadable.push(v); return null }
    return d
  }
  for (const row of parseCsv(csv)) {
    const name = pick(row, 'Projet', 'Name', 'Nom')
    if (!name) continue
    const status = pick(row, 'Statut', 'Status') || 'À faire'
    if (DONE.includes(norm(status))) continue
    const start = date(pick(row, 'Début', 'Start'))
    const end = date(pick(row, 'Fin', 'End', 'Rendu'))
    if (!start) { skipped.push(name); continue }
    projects.push({
      name, status, start, end,
      category: pick(row, 'Catégorie', 'Category'),
      module: pick(row, 'Module'),
      with: pick(row, 'Avec', 'With'),
      verify: truthy(pick(row, 'Dates à vérifier')),
      source: 'csv',
      key: null
    })
  }
  return { projects: sortGantt(projects), skipped, unreadable }
}

/** En cours d'abord, puis par date de rendu, puis par nom. */
export function sortGantt(projects: GanttProject[]): GanttProject[] {
  const rank = (p: GanttProject): number => (norm(p.status) === 'en cours' ? 0 : 1)
  return [...projects].sort((a, b) => rank(a) - rank(b) || (a.end ?? '9999').localeCompare(b.end ?? '9999') || a.name.localeCompare(b.name))
}

/** Jour local (AAAA-MM-JJ) d'un instant ISO. */
export const localDay = (isoTime: string): string => {
  const d = new Date(isoTime)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Au-delà, une inscription (ex. « Student Engagement », 1 an) n'est pas un projet à planifier. */
export const MAX_PROJECT_DAYS = 90

/** Projets My Epitech pas encore terminés : « En cours » si commencés, sinon « À venir ». */
export function fromMyEpitech(projects: MyProject[], today: string): GanttProject[] {
  const out: GanttProject[] = []
  for (const p of projects) {
    if (!p.start || !p.end || Number.isNaN(Date.parse(p.start)) || Number.isNaN(Date.parse(p.end))) continue
    const start = localDay(p.start)
    const end = localDay(p.end)
    if (end < today || daysBetween(start, end) > MAX_PROJECT_DAYS) continue
    out.push({
      name: p.name, status: start <= today ? 'En cours' : 'À venir', start, end,
      category: 'Epitech', module: p.unitCode, with: '', verify: false,
      source: 'myepitech', key: projectKey(p.unitCode, p.name)
    })
  }
  return sortGantt(out)
}

/** My Epitech pour Epitech ; le CSV n'ajoute que les projets hors Epitech (perso). */
export function mergeGantt(myepitech: GanttProject[], csv: GanttProject[]): GanttProject[] {
  return sortGantt([...myepitech, ...csv.filter((p) => norm(p.category) !== 'epitech')])
}

const DAY = 86_400_000
/** Nombre de jours entre deux dates AAAA-MM-JJ (b - a). */
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / DAY)
export const addDays = (d: string, n: number): string => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10)

export interface GanttBar {
  project: GanttProject
  /** Premier jour (index dans la plage) et nombre de jours couverts. */
  from: number
  span: number
  /** Fin inconnue : barre ouverte jusqu'à aujourd'hui + 7 jours. */
  open: boolean
  /** Jours restants avant le rendu (négatif si dépassé), null si fin inconnue. */
  left: number | null
}

/** Plage affichée (2 jours avant le premier début → au moins 3 semaines après aujourd'hui) et barres. */
export function ganttLayout(projects: GanttProject[], today: string): { start: string; days: number; today: number; bars: GanttBar[] } {
  const starts = projects.map((p) => p.start)
  const first = [today, ...starts].sort()[0]
  const start = addDays(first, -2)
  const ends = projects.map((p) => p.end ?? today)
  const last = [addDays(today, 21), ...ends].sort().at(-1) as string
  const days = daysBetween(start, addDays(last, 3)) + 1
  const bars = projects.map((p): GanttBar => {
    const open = p.end === null
    const end = p.end ?? addDays(p.start > today ? p.start : today, 7)
    const from = daysBetween(start, p.start)
    return { project: p, from, span: Math.max(1, daysBetween(p.start, end) + 1), open, left: p.end ? daysBetween(today, p.end) : null }
  })
  return { start, days, today: daysBetween(start, today), bars }
}
