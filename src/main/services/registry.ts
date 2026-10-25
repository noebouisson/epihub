import type { ServiceId, ServiceSnapshot } from '../../shared/types'
import { NeedsLoginError, NotReadyError, type RefreshOptions, type Service } from './types'

type Services = { [K in ServiceId]: Service<K> }
type Snapshots = { [K in ServiceId]: ServiceSnapshot<K> }

export interface RegistryOptions {
  now(): number
  onChange(id: ServiceId, snap: ServiceSnapshot): void
  /** Données mises en cache au lancement précédent : affichées en `loading` avec leur ancienne date. */
  initial?: Partial<{ [K in ServiceId]: { data: ServiceSnapshot<K>['data']; updatedAt?: number } }>
}

const IDS: ServiceId[] = ['github', 'intra', 'myepitech', 'teams']

export function createRegistry(services: Services, opts: RegistryOptions) {
  const seed = <K extends ServiceId>(id: K): ServiceSnapshot<K> => {
    const c = opts.initial?.[id]
    if (!c || c.data == null) return { status: { state: 'loading' }, data: null }
    return { status: c.updatedAt ? { state: 'loading', updatedAt: c.updatedAt } : { state: 'loading' }, data: c.data as ServiceSnapshot<K>['data'] }
  }
  const state: Snapshots = { github: seed('github'), intra: seed('intra'), myepitech: seed('myepitech'), teams: seed('teams') }

  async function refreshOne(id: ServiceId, refreshOpts?: RefreshOptions): Promise<void> {
    const prev = state[id]
    let next: ServiceSnapshot
    try {
      const data = await (services[id] as Service<ServiceId>).refresh(refreshOpts)
      next = { status: { state: 'ok', updatedAt: opts.now() }, data }
    } catch (e) {
      // `data` garde la dernière valeur connue (avec sa date) ; le message ne contient jamais de secret.
      const updatedAt = prev.status.updatedAt
      const status: ServiceSnapshot['status'] = e instanceof NotReadyError
        ? { state: 'loading', message: e.message }
        : e instanceof NeedsLoginError
          ? { state: 'needs-login', message: e.message }
          : { state: 'error', message: e instanceof Error ? e.message : String(e) }
      if (updatedAt !== undefined) status.updatedAt = updatedAt
      next = { status, data: prev.data }
    }
    ;(state as Record<ServiceId, ServiceSnapshot>)[id] = next
    opts.onChange(id, next)
  }

  const registry = {
    /** `refreshOpts` (force) : transmis au service demandé ; pour « tout », à My Epitech seulement. */
    async refresh(id?: ServiceId, refreshOpts?: RefreshOptions): Promise<void> {
      if (id) return refreshOne(id, refreshOpts)
      await Promise.allSettled(IDS.map((i) => refreshOne(i, i === 'myepitech' ? refreshOpts : undefined)))
    },
    snapshot: (): Snapshots => ({ ...state }),
    start(intervalMs: number): () => void {
      void registry.refresh()
      const timer = setInterval(() => void registry.refresh(), intervalMs)
      return () => clearInterval(timer)
    }
  }
  return registry
}
