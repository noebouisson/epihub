import { contextBridge, ipcRenderer } from 'electron'
import type { EpihubApi } from '../shared/types'

const subscribe = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: EpihubApi = {
  snapshot: () => ipcRenderer.invoke('epihub:snapshot'),
  refresh: (id) => ipcRenderer.invoke('epihub:refresh', id),
  deadlines: () => ipcRenderer.invoke('epihub:deadlines'),
  search: (q) => ipcRenderer.invoke('epihub:search', q),
  getSettings: () => ipcRenderer.invoke('epihub:settings:get'),
  updateSettings: (p) => ipcRenderer.invoke('epihub:settings:update', p),
  setGithubToken: (t) => ipcRenderer.invoke('epihub:github:setToken', t),
  share: (item) => ipcRenderer.invoke('epihub:share', item),
  teamsPreloadPath: () => ipcRenderer.invoke('epihub:teamsPreloadPath'),
  teamsTitle: (t) => ipcRenderer.invoke('epihub:teams:title', t),
  teamsNavigate: (u) => ipcRenderer.invoke('epihub:teams:navigate', u),
  teamsNotification: (n) => ipcRenderer.invoke('epihub:teams:notification', n),
  onChanged: (cb) => subscribe('epihub:changed', cb),
  onPalette: (cb) => subscribe<void>('epihub:palette', () => cb()),
  onOpen: (cb) => subscribe('epihub:open', cb)
}

contextBridge.exposeInMainWorld('epihub', api)
