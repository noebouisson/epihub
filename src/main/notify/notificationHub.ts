import type { ServiceId } from '../../shared/types'

const SEVEN_DAYS = 7 * 864e5
/** Préfixe des marqueurs « service amorcé » : jamais purgés. */
const PRIMED = 'primed:'

export interface HubNotification { title: string; body: string; target: { service: ServiceId | 'app'; url?: string } }
export interface HubOptions {
  show(n: HubNotification): void
  load(): Record<string, number>
  save(seen: Record<string, number>): void
  now(): number
  enabled(service: ServiceId): boolean
}

export function createNotificationHub(opts: HubOptions) {
  /** Clés vues depuis moins de 7 jours + marqueurs d'amorçage. */
  const loadFresh = (now: number): Record<string, number> => {
    const seen: Record<string, number> = {}
    for (const [k, at] of Object.entries(opts.load())) if (k.startsWith(PRIMED) || now - at <= SEVEN_DAYS) seen[k] = at
    return seen
  }
  return {
    /** true si les notifications de ce service ont déjà été amorcées (sur ce poste). */
    isPrimed(service: ServiceId): boolean {
      return `${PRIMED}${service}` in opts.load()
    },
    /** Marque des clés comme vues sans rien afficher (une seule sauvegarde) ; `service` pose le marqueur d'amorçage. */
    prime(keys: string[], service?: ServiceId): void {
      const now = opts.now()
      const seen = loadFresh(now)
      for (const k of keys) if (!(k in seen)) seen[k] = now
      if (service) seen[`${PRIMED}${service}`] = now
      opts.save(seen)
    },
    /**
     * Renvoie true si la notification a été affichée. `ttlMs` = fenêtre de déduplication de cette
     * clé (7 jours par défaut ; plus court pour les messages Teams). `targetService` : cible du clic (par défaut `service`).
     */
    push(key: string, service: ServiceId, title: string, body: string, url?: string, ttlMs = SEVEN_DAYS, targetService: ServiceId | 'app' = service): boolean {
      const now = opts.now()
      const seen = loadFresh(now)
      const fresh = !(key in seen && now - seen[key] < ttlMs) && opts.enabled(service)
      if (fresh) {
        seen[key] = now
        opts.show({ title, body, target: { service: targetService, url } })
      }
      opts.save(seen)
      return fresh
    }
  }
}
