import type { ServiceId } from '../shared/types'
import type { RefreshOptions } from './services/types'

const SERVICE_IDS: readonly ServiceId[] = ['github', 'intra', 'myepitech', 'teams']
export const isServiceId = (v: unknown): v is ServiceId => SERVICE_IDS.includes(v as ServiceId)

/** Arguments de `epihub:refresh` validés : `{ force: true }` exact, accepté pour My Epitech ou « tout » (appliqué à My Epitech seul). */
export function refreshArgs(id: unknown, opts: unknown): { id: ServiceId | undefined; opts: RefreshOptions | undefined } {
  const service = isServiceId(id) ? id : undefined
  const forceable = service === 'myepitech' || (service === undefined && id === undefined)
  const force = forceable && !!opts && typeof opts === 'object' && (opts as { force?: unknown }).force === true
  return { id: service, opts: force ? { force: true } : undefined }
}
