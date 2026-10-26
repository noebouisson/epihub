import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { SubjectInfo } from '../../shared/types'
import { atomicWrite } from '../reports/store'

export interface StoredSubject { projectKey: string; fileName: string; importedAt: number; text: string; info: SubjectInfo }
/** Fiche légère d'un sujet (sans son texte), lue par la vue et le tableau de bord. */
export type SubjectMeta = Omit<StoredSubject, 'text'>
interface MetaFile extends SubjectMeta { textHash: string }

const hashOf = (text: string): string => createHash('sha256').update(text).digest('hex')

/** Identifiant d'item de la marche à suivre (ex. `setup#0`, `option:-R#1`). */
export const validItemId = (v: unknown): v is string => typeof v === 'string' && v.length <= 200 && /^[A-Za-z:#0-9_-]+$/.test(v)

/** Nom de fichier sûr dérivé d'une clé : uniquement `[A-Za-z0-9_-]`. */
export const sanitizeKey = (key: string): string =>
  key.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) || '_'

export const MAX_DONE = 500

export interface PlanStore {
  getSubject(key: string): StoredSubject | null
  getSubjectMeta(key: string): SubjectMeta | null
  saveSubject(key: string, fileName: string, pdf: Uint8Array, text: string, info: SubjectInfo): void
  removeSubject(key: string): void
  done(key: string): string[]
  toggle(key: string, itemId: string, on: boolean): string[]
}

/**
 * `<userData>/subjects/<clé>.{pdf,json,info.json}` (le `.info.json` est la fiche légère, sans texte)
 * et `<userData>/plans.json` (avancement par projet).
 */
export function createPlanStore(userData: string, opts: { now?: () => number } = {}): PlanStore {
  const now = opts.now ?? Date.now
  const subjectsDir = join(userData, 'subjects')
  const plansPath = join(userData, 'plans.json')
  const base = (key: string): string => join(subjectsDir, sanitizeKey(key))

  const loadPlans = (): Map<string, string[]> => {
    try {
      const raw = JSON.parse(readFileSync(plansPath, 'utf8')) as unknown
      const out = new Map<string, string[]>()
      if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw)) if (Array.isArray(v)) out.set(k, v.filter(validItemId))
      }
      return out
    } catch {
      return new Map()
    }
  }
  const savePlans = (plans: Map<string, string[]>): void => {
    mkdirSync(userData, { recursive: true })
    atomicWrite(plansPath, JSON.stringify(Object.fromEntries(plans)))
  }
  const clearDone = (key: string): void => {
    const plans = loadPlans()
    if (plans.delete(key)) savePlans(plans)
  }
  const readMeta = (key: string): MetaFile | null => {
    try {
      const raw = JSON.parse(readFileSync(`${base(key)}.info.json`, 'utf8')) as Partial<MetaFile>
      if (raw.projectKey !== key || typeof raw.fileName !== 'string' || typeof raw.textHash !== 'string' || !raw.info || typeof raw.importedAt !== 'number') return null
      return raw as MetaFile
    } catch {
      return null
    }
  }
  const unlinkQuiet = (f: string): void => {
    try {
      unlinkSync(f)
    } catch {
      /* déjà absent */
    }
  }

  return {
    getSubject(key) {
      try {
        const raw = JSON.parse(readFileSync(`${base(key)}.json`, 'utf8')) as Partial<StoredSubject>
        // Deux clés pouvant donner le même nom de fichier : le JSON doit être celui de ce projet.
        if (raw.projectKey !== key || typeof raw.fileName !== 'string' || typeof raw.text !== 'string' || !raw.info || typeof raw.importedAt !== 'number') return null
        return raw as StoredSubject
      } catch {
        return null
      }
    },
    getSubjectMeta(key) {
      const m = readMeta(key)
      return m ? { projectKey: m.projectKey, fileName: m.fileName, importedAt: m.importedAt, info: m.info } : null
    },
    saveSubject(key, fileName, pdf, text, info) {
      mkdirSync(subjectsDir, { recursive: true })
      const previous = readMeta(key)
      const record: StoredSubject = { projectKey: key, fileName: fileName.slice(0, 200), importedAt: now(), text, info }
      const meta: MetaFile = { projectKey: key, fileName: record.fileName, importedAt: record.importedAt, info, textHash: hashOf(text) }
      atomicWrite(`${base(key)}.pdf`, pdf)
      try {
        atomicWrite(`${base(key)}.json`, JSON.stringify(record))
        atomicWrite(`${base(key)}.info.json`, JSON.stringify(meta))
      } catch (err) {
        unlinkQuiet(`${base(key)}.info.json`)
        unlinkQuiet(`${base(key)}.json`)
        unlinkQuiet(`${base(key)}.pdf`)
        throw err
      }
      // Les ids d'étapes sont positionnels : un autre sujet rendrait les coches fausses.
      if (previous && previous.textHash !== meta.textHash) clearDone(key)
    },
    removeSubject(key) {
      unlinkQuiet(`${base(key)}.info.json`)
      unlinkQuiet(`${base(key)}.json`)
      unlinkQuiet(`${base(key)}.pdf`)
      clearDone(key)
    },
    done: (key) => loadPlans().get(key) ?? [],
    toggle(key, itemId, on) {
      const plans = loadPlans()
      const current = plans.get(key) ?? []
      if (!validItemId(itemId)) return current
      if (on && !current.includes(itemId) && current.length >= MAX_DONE) return current
      const next = on ? [...new Set([...current, itemId])] : current.filter((i) => i !== itemId)
      plans.set(key, next)
      savePlans(plans)
      return next
    }
  }
}
