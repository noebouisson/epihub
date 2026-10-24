import type { ServiceId, ServiceSnapshot } from '../../shared/types'
import { NeedsLoginError, type Service } from './types'

type Services = { [K in ServiceId]: Service<K> }
type Snapshots = { [K in ServiceId]: ServiceSnapshot<K> }

export interface RegistryOptions {
  now(): number
  onChange(id: ServiceId, snap: ServiceSnapshot): void
}

const IDS: ServiceId[] = ['github', 'intra', 'myepitech', 'teams']

export function createRegistry(services: Services, opts: RegistryOptions) {
  const state: Snapshots = {
    github: { status: { state: 'loading' }, data: null },
    intra: { status: { state: 'loading' }, data: null },
    myepitech: { status: { state: 'loading' }, data: null },
    teams: { status: { state: 'loading' }, data: null }
  }

  async function refreshOne(id: ServiceId): Promise<void> {
    const prev = state[id]
    let next: ServiceSnapshot
    try {
      const data = await (services[id] as Service<ServiceId>).refresh()
      next = { status: { state: 'ok', updatedAt: opts.now() }, data }
    } catch (e) {
      // `data` garde la dernière valeur connue ; le message d'erreur ne contient jamais de secret.
      next = e instanceof NeedsLoginError
        ? { status: { state: 'needs-login', message: e.message }, data: prev.data }
        : { status: { state: 'error', message: e instanceof Error ? e.message : String(e) }, data: prev.data }
    }
    ;(state as Record<ServiceId, ServiceSnapshot>)[id] = next
    opts.onChange(id, next)
  }

  const registry = {
    async refresh(id?: ServiceId): Promise<void> {
      if (id) return refreshOne(id)
      await Promise.allSettled(IDS.map(refreshOne))
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
