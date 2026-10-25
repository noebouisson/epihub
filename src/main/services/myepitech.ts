import type { MyEpitechData, MyProfile, MyProject, RunDetail, RunSummary, RunTest, SkillBreakdown } from '../../shared/types'
import { type FetchLike, NeedsLoginError, type Service } from './types'

export const MYEPITECH_HOME = 'https://my.epitech.eu/'
const BASE = 'https://my.epitech.eu/api'
const BAD_FORMAT = 'Format My Epitech inattendu'
const DAY = 864e5
/** Projet « actif » : fin dans le futur ou depuis moins de 14 jours (passages relus à chaque cycle). */
const ACTIVE_WINDOW = 14 * DAY
/** Passages des projets inactifs relus au plus toutes les 6 h. */
const INACTIVE_TTL = 6 * 3600e3
const CONCURRENCY = 4
/** Garde-fou contre une pagination qui ne se termine pas. */
const MAX_PAGES = 50

type Raw = any

const bad = (): never => {
  throw new Error(BAD_FORMAT)
}
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const idOf = (v: unknown): string => (typeof v === 'number' || (typeof v === 'string' && v) ? String(v) : bad())

function gpaOf(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (isObj(v)) {
    for (const k of ['gpa', 'value']) {
      const inner = v[k]
      if ((typeof inner === 'number' && Number.isFinite(inner)) || (typeof inner === 'string' && inner.trim())) return String(inner).trim()
    }
  }
  return null
}

export function decodeProfile(raw: Raw): MyProfile {
  if (!isObj(raw) || typeof raw.login !== 'string') bad()
  return {
    login: raw.login,
    name: [str(raw.firstname), str(raw.lastname)].filter(Boolean).join(' '),
    promotion: numOrNull(raw.promotion),
    semester: numOrNull(raw.semester),
    gpa: gpaOf(raw.gpa),
    cursus: isObj(raw.cursus) ? str(raw.cursus.name) || str(raw.cursus.code) || null : null
  }
}

export function decodeProject(raw: Raw): MyProject {
  if (!isObj(raw) || typeof raw.name !== 'string' || !isObj(raw.unitInstance)) bad()
  const unit = raw.unitInstance
  const unitCode = str(unit.unitCode) || str(unit.code)
  if (!unitCode) bad()
  return {
    id: idOf(raw.id),
    name: raw.name,
    unitCode,
    unitName: str(unit.name),
    description: str(raw.description),
    start: str(raw.startDate),
    end: str(raw.endDate),
    // Aucune route de page projet connue sur le nouveau site : accueil My Epitech.
    url: MYEPITECH_HOME
  }
}

function breakdowns(raw: unknown): Record<string, SkillBreakdown> {
  const out: Record<string, SkillBreakdown> = {}
  if (!isObj(raw)) return out
  for (const [name, v] of Object.entries(raw)) {
    if (!isObj(v)) continue
    out[name] = { count: num(v.count), passed: num(v.passed), crashed: num(v.crashed), mandatoryFailed: num(v.mandatoryFailed) }
  }
  return out
}

export function decodeRunSummary(raw: Raw): RunSummary {
  if (!isObj(raw) || !isObj(raw.context) || !isObj(raw.properties)) bad()
  const { context: ctx, properties: props } = raw
  if (typeof ctx.unitCode !== 'string' || typeof ctx.projectCode !== 'string' || typeof props.date !== 'string' || Number.isNaN(Date.parse(props.date))) bad()
  const style = isObj(raw.codingStyle) ? raw.codingStyle : {}
  const counts = isObj(style.value) ? style.value : {}
  const cov = isObj(raw.coverage) && isObj(raw.coverage.Default) ? raw.coverage.Default : {}
  const members = isObj(props.group) && Array.isArray(props.group.members) ? props.group.members.filter((m: unknown): m is string => typeof m === 'string') : []
  return {
    id: idOf(raw.id),
    unitCode: ctx.unitCode,
    projectCode: ctx.projectCode,
    title: str(ctx.title) || ctx.projectCode,
    year: num(ctx.year),
    date: props.date,
    commit: str(props.commit),
    members,
    failureFlags: Array.isArray(raw.failureFlags) ? raw.failureFlags.filter((f: unknown): f is string => typeof f === 'string') : [],
    style: { fatal: num(counts.fatal), major: num(counts.major), minor: num(counts.minor), info: num(counts.info), penalty: numOrNull(style.penalty?.Penalty?.value) },
    coverage: { lines: numOrNull(cov.linePercentage), branches: numOrNull(cov.branchPercentage) },
    categories: breakdowns(raw.skillBreakdowns),
    repoLink: str(raw.repoLink) || null
  }
}

/** Erreur de livraison ou de compilation : texte brut (objet sérialisé), ou null. */
function errorText(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v || null
  return JSON.stringify(v)
}

function bannedNames(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : isObj(x) && typeof x.name === 'string' ? x.name : null)).filter((x): x is string => !!x)
  if (isObj(v)) return Object.keys(v)
  return []
}

const percent = (covered: unknown, total: unknown): number | null =>
  typeof covered === 'number' && typeof total === 'number' && total > 0 ? Math.round((covered / total) * 100) : null

/** Compétence enveloppée dans un objet à une seule clé (`FullSkillReport`, …) → son contenu. */
function unwrapSkill(v: unknown): Record<string, any> | null {
  if (!isObj(v)) return null
  const keys = Object.keys(v)
  return keys.length === 1 && isObj(v[keys[0]]) ? v[keys[0]] : v
}

export function decodeRunDetail(raw: Raw): RunDetail {
  if (!isObj(raw) || (raw.skills != null && !Array.isArray(raw.skills))) bad()
  const categories = (raw.skills ?? []).map((s: unknown) => {
    const r = unwrapSkill(s)
    if (!r || typeof r.name !== 'string') bad()
    const tests: RunTest[] = (Array.isArray(r!.tests) ? r!.tests : []).map((t: unknown) => {
      if (!isObj(t) || typeof t.name !== 'string') bad()
      const test = t as Record<string, any>
      return { name: test.name, passed: test.passed === true, crashed: test.crashed === true, skipped: test.skipped === true, mandatory: test.mandatory === true, comment: str(test.comment) }
    })
    return { name: r!.name as string, tests }
  })
  const cov = isObj(raw.coverage) && isObj(raw.coverage.Default) ? raw.coverage.Default : {}
  return {
    categories,
    deliveryError: errorText(raw.deliveryError),
    makeError: errorText(raw.makeError),
    bannedFunctions: bannedNames(raw.bannedFunctions),
    coverage: { lines: percent(cov.coveredLines, cov.totalLines), branches: percent(cov.coveredBranches, cov.totalBranches) }
  }
}

const byDateDesc = (a: RunSummary, b: RunSummary): number => Date.parse(b.date) - Date.parse(a.date)

/** Exécute `fn` sur chaque élément avec au plus `limit` appels simultanés. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export interface MyEpitechServiceDeps {
  fetch: FetchLike
  auth: { getToken(): Promise<string | null>; invalidate(): void }
  now(): number
}

export type MyEpitechService = Service<'myepitech'> & {
  runDetail(runId: string): Promise<RunDetail>
  history(year: number, unitCode: string, projectCode: string): Promise<RunSummary[]>
}

export function createMyEpitechService(deps: MyEpitechServiceDeps): MyEpitechService {
  /** Passages par projet et date de lecture (aucun jeton n'y est conservé). */
  const runCache = new Map<string, { at: number; runs: RunSummary[] }>()

  /** GET authentifié ; 401 → jeton oublié et une seule nouvelle tentative. `null` pour une réponse 400. */
  async function get(path: string, allow400 = false): Promise<Raw | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await deps.auth.getToken()
      if (!token) throw new NeedsLoginError()
      const res = await deps.fetch(BASE + path, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
      if (res.status === 401) {
        if (attempt === 0) {
          deps.auth.invalidate()
          continue
        }
        throw new NeedsLoginError()
      }
      if (res.status === 400 && allow400) return null
      if (!res.ok) throw new Error(`My Epitech HTTP ${res.status}`)
      try {
        return JSON.parse(await res.text())
      } catch {
        throw new Error(BAD_FORMAT)
      }
    }
    throw new NeedsLoginError()
  }

  async function runList(path: string): Promise<RunSummary[]> {
    const json = await get(path, true)
    if (json === null) return [] // 400 « Project slug not found » : pas de moulinette.
    if (!isObj(json) || !Array.isArray(json.results)) bad()
    return json.results.map(decodeRunSummary).sort(byDateDesc)
  }

  async function allProjects(): Promise<Raw[]> {
    const out: Raw[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const json = await get(`/units/instances/projects?page=${page}`)
      if (!isObj(json) || !Array.isArray(json.data)) bad()
      out.push(...json.data)
      const meta = isObj(json.meta) ? json.meta : {}
      const more = typeof meta.hasNext === 'boolean' ? meta.hasNext : typeof meta.pages === 'number' && page < meta.pages
      if (!more || json.data.length === 0) break
    }
    return out
  }

  return {
    id: 'myepitech',
    async refresh(): Promise<MyEpitechData> {
      const profile = decodeProfile(await get('/students/profile'))
      const projects = (await allProjects()).filter((p) => isObj(p) && p.isUserRegistered === true).map(decodeProject)
      const now = deps.now()
      const runs: Record<string, RunSummary[]> = {}
      await pool(projects, CONCURRENCY, async (p) => {
        const cached = runCache.get(p.id)
        const end = Date.parse(p.end)
        const active = Number.isNaN(end) || end > now - ACTIVE_WINDOW
        if (cached && !active && now - cached.at < INACTIVE_TTL) {
          runs[p.id] = cached.runs
          return
        }
        try {
          const list = await runList(`/units/instances/projects/${encodeURIComponent(p.id)}/test-results`)
          runCache.set(p.id, { at: now, runs: list })
          runs[p.id] = list
        } catch (err) {
          // Reconnexion : remontée. Autre échec : derniers passages connus, retentés au prochain cycle.
          if (err instanceof NeedsLoginError) throw err
          runs[p.id] = cached?.runs ?? []
        }
      })
      for (const id of runCache.keys()) if (!(id in runs)) runCache.delete(id)
      return { profile, projects, runs }
    },
    async runDetail(runId): Promise<RunDetail> {
      return decodeRunDetail(await get(`/students/test-results/${encodeURIComponent(runId)}`))
    },
    history(year, unitCode, projectCode): Promise<RunSummary[]> {
      return runList(`/students/test-results/history/${encodeURIComponent(String(year))}/${encodeURIComponent(unitCode)}/${encodeURIComponent(projectCode)}`)
    }
  }
}
