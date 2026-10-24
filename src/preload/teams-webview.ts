import { ipcRenderer, webFrame } from 'electron'

// Electron 33 n'a pas contextBridge.executeInMainWorld : on injecte un script dans le monde
// principal de la page, qui relaie chaque notification par postMessage jusqu'à ce preload.
const MAIN_WORLD_SCRIPT = `(() => {
  class EpihubNotification {
    constructor(title, options) {
      const o = options || {}
      window.postMessage({ __epihub: 'teams-notification', title: String(title), body: o.body == null ? '' : String(o.body), tag: o.tag == null ? '' : String(o.tag) }, '*')
    }
    static get permission() { return 'granted' }
    static requestPermission(cb) {
      if (typeof cb === 'function') cb('granted')
      return Promise.resolve('granted')
    }
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  Object.defineProperty(window, 'Notification', { value: EpihubNotification, writable: true, configurable: true })
})()`

void webFrame.executeJavaScript(MAIN_WORLD_SCRIPT)

window.addEventListener('message', (e: MessageEvent) => {
  if (e.source !== window) return
  const d = e.data as { __epihub?: string; title?: unknown; body?: unknown; tag?: unknown } | null
  if (!d || d.__epihub !== 'teams-notification') return
  ipcRenderer.sendToHost('teams-notification', {
    title: String(d.title ?? ''),
    body: String(d.body ?? ''),
    tag: String(d.tag ?? '')
  })
})
