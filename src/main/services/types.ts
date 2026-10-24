import type { ServiceDataMap, ServiceId } from '../../shared/types'

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> }
) => Promise<{ status: number; ok: boolean; headers: { get(n: string): string | null }; text(): Promise<string> }>

export class NeedsLoginError extends Error {
  constructor(message = 'Connexion requise') {
    super(message)
    this.name = 'NeedsLoginError'
    Object.setPrototypeOf(this, NeedsLoginError.prototype)
  }
}

/** Le service n'a pas encore de données à lire (ex. Teams pas encore chargé) : état `loading`. */
export class NotReadyError extends Error {
  constructor(message = 'Pas encore prêt') {
    super(message)
    this.name = 'NotReadyError'
    Object.setPrototypeOf(this, NotReadyError.prototype)
  }
}

export interface Service<K extends ServiceId> {
  id: K
  refresh(): Promise<ServiceDataMap[K]>
}
