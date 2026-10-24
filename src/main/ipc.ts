import { ipcMain } from 'electron'
import type { ServiceId, Settings, TeamsNotificationPayload } from '../shared/types'
import { clip, teamsKey } from './app/effects'
import { buildSearchItems, search } from './links/searchIndex'
import { shareText } from './links/shareText'

const SERVICE_IDS: readonly ServiceId[] = ['github', 'intra', 'myepitech', 'teams']
const isServiceId = (v: unknown): v is ServiceId => SERVICE_IDS.includes(v as ServiceId)

export interface IpcDeps {
  registry: { refresh(id?: ServiceId): Promise<void>; snapshot(): Record<ServiceId, { data: unknown }> }
  effects: { deadlines(data: Record<string, unknown>): Promise<unknown> }
  settings: { get(): Settings; update(patch: Partial<Settings>): Settings }
  secrets: { setGithubToken(t: string): void }
  hub: { push(key: string, service: ServiceId, title: string, body: string, url?: string): boolean }
  teams: { onTitle(t: string): void; onNavigate(u: string): void }
  writeClipboard(text: string): void
  refreshTeams(): void
  teamsPreloadPath: string
}

const dataOf = (deps: IpcDeps): Record<ServiceId, any> => {
  const s = deps.registry.snapshot()
  return { github: s.github.data, intra: s.intra.data, myepitech: s.myepitech.data, teams: s.teams.data }
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle('epihub:snapshot', () => deps.registry.snapshot())
  ipcMain.handle('epihub:refresh', (_e, id?: unknown) => deps.registry.refresh(isServiceId(id) ? id : undefined))
  ipcMain.handle('epihub:deadlines', () => deps.effects.deadlines(dataOf(deps)))
  ipcMain.handle('epihub:search', (_e, query: unknown) => search(buildSearchItems(dataOf(deps)), typeof query === 'string' ? query : ''))
  ipcMain.handle('epihub:teamsPreloadPath', () => deps.teamsPreloadPath)
  ipcMain.handle('epihub:settings:get', () => deps.settings.get())
  ipcMain.handle('epihub:settings:update', (_e, patch: Partial<Settings>) => deps.settings.update(patch ?? {}))

  ipcMain.handle('epihub:github:setToken', (_e, token: unknown) => {
    if (typeof token !== 'string' || !token.trim()) return { ok: false, error: 'ENCRYPTION_UNAVAILABLE' as const }
    try {
      deps.secrets.setGithubToken(token.trim())
    } catch {
      return { ok: false, error: 'ENCRYPTION_UNAVAILABLE' as const }
    }
    void deps.registry.refresh('github')
    return { ok: true as const }
  })

  ipcMain.handle('epihub:share', (_e, item: { title: string; url: string; context?: string }) => {
    const text = shareText({ title: String(item?.title ?? ''), url: String(item?.url ?? ''), context: item?.context === undefined ? undefined : String(item.context) })
    deps.writeClipboard(text)
    return text
  })

  ipcMain.handle('epihub:teams:title', (_e, title: unknown) => {
    if (typeof title === 'string') {
      deps.teams.onTitle(title)
      deps.refreshTeams()
    }
  })
  ipcMain.handle('epihub:teams:navigate', (_e, url: unknown) => {
    if (typeof url === 'string') {
      deps.teams.onNavigate(url)
      deps.refreshTeams()
    }
  })
  // Charge utile issue de la page Teams (non fiable) : types vérifiés et longueurs plafonnées.
  ipcMain.handle('epihub:teams:notification', (_e, n: Partial<TeamsNotificationPayload>) => {
    const title = clip(n?.title)
    const body = clip(n?.body)
    const tag = clip(n?.tag)
    deps.hub.push(teamsKey(title, body, tag), 'teams', title, body)
  })
}
