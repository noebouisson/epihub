import { BrowserWindow, session } from 'electron';
import { MYEPITECH_HOME } from '../services/myepitech';
import type { MyEpitechAuthDeps } from '../services/myepitechAuth';
import { trackHiddenWindow } from './hiddenWindows';

const PARTITION = 'persist:myepitech';

/**
 * Câblage Electron du jeton My Epitech (logique dans services/myepitechAuth) :
 * - le SEUL écouteur onBeforeSendHeaders de la partition ; la requête est toujours poursuivie inchangée ;
 * - une fenêtre cachée (sandbox, sans preload, popups refusées) pour que le site renouvelle son jeton.
 */
export function myepitechSessionDeps(): Pick<MyEpitechAuthDeps, 'onRequestHeaders' | 'openHiddenPage'> {
  return {
    onRequestHeaders(listener) {
      session.fromPartition(PARTITION).webRequest.onBeforeSendHeaders({ urls: ['https://my.epitech.eu/api/*'] }, (details, callback) => {
        try {
          listener(details.url, details.requestHeaders);
        } finally {
          callback({ requestHeaders: details.requestHeaders });
        }
      });
    },
    async openHiddenPage() {
      const win = new BrowserWindow({
        show: false,
        webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false }
      });
      // Avant tout chargement : le garde-fou bloque alors en silence toute sortie de la liste blanche.
      trackHiddenWindow(win);
      // Remplace le gestionnaire générique : aucune popup depuis la fenêtre invisible.
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      // Les redirections MSAL peuvent faire échouer loadURL (ERR_ABORTED) sans empêcher la capture du jeton.
      win.loadURL(MYEPITECH_HOME).catch(() => undefined);
      return () => {
        if (!win.isDestroyed()) win.destroy();
      };
    }
  };
}
