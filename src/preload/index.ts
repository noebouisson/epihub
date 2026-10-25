import { contextBridge, ipcRenderer } from 'electron'
import type { EpihubApi } from '../shared/types'

const subscribe = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: EpihubApi = {
  snapshot: () => ipcRenderer.invoke('epihub:snapshot'),
  refresh: (id, opts) => ipcRenderer.invoke('epihub:refresh', id, opts),
  deadlines: () => ipcRenderer.invoke('epihub:deadlines'),
  projects: () => ipcRenderer.invoke('epihub:projects'),
  project: (key, force) => ipcRenderer.invoke('epihub:project', key, force),
  search: (q) => ipcRenderer.invoke('epihub:search', q),
  getSettings: () => ipcRenderer.invoke('epihub:settings:get'),
  updateSettings: (p) => ipcRenderer.invoke('epihub:settings:update', p),
  setGithubToken: (t) => ipcRenderer.invoke('epihub:github:setToken', t),
  clearGithubToken: () => ipcRenderer.invoke('epihub:github:clearToken'),
  share: (item) => ipcRenderer.invoke('epihub:share', item),
  teamsPreloadPath: () => ipcRenderer.invoke('epihub:teamsPreloadPath'),
  teamsTitle: (t) => ipcRenderer.invoke('epihub:teams:title', t),
  teamsNavigate: (u) => ipcRenderer.invoke('epihub:teams:navigate', u),
  teamsNotification: (n) => ipcRenderer.invoke('epihub:teams:notification', n),
  reports: (key) => ipcRenderer.invoke('epihub:reports', key),
  report: (id) => ipcRenderer.invoke('epihub:report', id),
  openReportFile: (id) => ipcRenderer.invoke('epihub:openReportFile', id),
  exportReportPdf: (id) => ipcRenderer.invoke('epihub:exportReportPdf', id),
  onChanged: (cb) => subscribe('epihub:changed', cb),
  onPalette: (cb) => subscribe<void>('epihub:palette', () => cb()),
  onOpen: (cb) => subscribe('epihub:open', cb)
}

contextBridge.exposeInMainWorld('epihub', api)
