import type { ServiceId } from '../../shared/types'

const SEVEN_DAYS = 7 * 864e5

export interface HubNotification { title: string; body: string; target: { service: ServiceId | 'app'; url?: string } }
export interface HubOptions {
  show(n: HubNotification): void
  load(): Record<string, number>
  save(seen: Record<string, number>): void
  now(): number
  enabled(service: ServiceId): boolean
}

export function createNotificationHub(opts: HubOptions) {
  const loadFresh = (now: number): Record<string, number> => {
    const seen: Record<string, number> = {}
    for (const [k, at] of Object.entries(opts.load())) if (now - at <= SEVEN_DAYS) seen[k] = at
    return seen
  }
  return {
    /** Marque des clés comme vues sans rien afficher (une seule sauvegarde). */
    prime(keys: string[]): void {
      const now = opts.now()
      const seen = loadFresh(now)
      for (const k of keys) if (!(k in seen)) seen[k] = now
      opts.save(seen)
    },
    /** Renvoie true si la notification a été affichée. */
    push(key: string, service: ServiceId, title: string, body: string, url?: string): boolean {
      const now = opts.now()
      const seen: Record<string, number> = {}
      for (const [k, at] of Object.entries(opts.load())) if (now - at <= SEVEN_DAYS) seen[k] = at

      const fresh = !(key in seen) && opts.enabled(service)
      if (fresh) {
        seen[key] = now
        opts.show({ title, body, target: { service, url } })
      }
      opts.save(seen)
      return fresh
    }
  }
}
