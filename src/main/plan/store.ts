import { mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { SubjectInfo } from '../../shared/types'
import { atomicWrite } from '../reports/store'

export interface StoredSubject { projectKey: string; fileName: string; importedAt: number; text: string; info: SubjectInfo }

/** Identifiant d'item de la marche à suivre (ex. `setup#0`, `option:-R#1`). */
export const validItemId = (v: unknown): v is string => typeof v === 'string' && v.length <= 200 && /^[A-Za-z:#0-9_-]+$/.test(v)

/** Nom de fichier sûr dérivé d'une clé : uniquement `[A-Za-z0-9_-]`. */
export const sanitizeKey = (key: string): string =>
  key.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) || '_'

export const MAX_DONE = 500

export interface PlanStore {
  getSubject(key: string): StoredSubject | null
  saveSubject(key: string, fileName: string, pdf: Uint8Array, text: string, info: SubjectInfo): void
  removeSubject(key: string): void
  done(key: string): string[]
  toggle(key: string, itemId: string, on: boolean): string[]
}

/** `<userData>/subjects/<clé>.{pdf,json}` et `<userData>/plans.json` (avancement par projet). */
export function createPlanStore(userData: string): PlanStore {
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
    saveSubject(key, fileName, pdf, text, info) {
      mkdirSync(subjectsDir, { recursive: true })
      const record: StoredSubject = { projectKey: key, fileName: fileName.slice(0, 200), importedAt: Date.now(), text, info }
      atomicWrite(`${base(key)}.pdf`, pdf)
      try {
        atomicWrite(`${base(key)}.json`, JSON.stringify(record))
      } catch (err) {
        unlinkQuiet(`${base(key)}.pdf`)
        throw err
      }
    },
    removeSubject(key) {
      unlinkQuiet(`${base(key)}.json`)
      unlinkQuiet(`${base(key)}.pdf`)
    },
    done: (key) => loadPlans().get(key) ?? [],
    toggle(key, itemId, on) {
      const plans = loadPlans()
      const current = plans.get(key) ?? []
      if (!validItemId(itemId)) return current
      if (on && !current.includes(itemId) && current.length >= MAX_DONE) return current
      const next = on ? [...new Set([...current, itemId])] : current.filter((i) => i !== itemId)
      plans.set(key, next)
      mkdirSync(userData, { recursive: true })
      atomicWrite(plansPath, JSON.stringify(Object.fromEntries(plans)))
      return next
    }
  }
}
