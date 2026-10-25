import { app, shell, type BrowserWindow, type WebContents } from 'electron';
import { isServiceHomeOrigin } from '../shared/domains';
import { isHiddenContents } from './app/hiddenWindows';
import { classifyPreload, guestNavigation, isPaletteShortcut, popupPolicy } from './navigationPolicy';
import { SERVICE_PARTITIONS } from './securityPolicy';

const PARTITIONS: readonly string[] = SERVICE_PARTITIONS;

const openExternal = (url: string): void => {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') void shell.openExternal(url);
  } catch {
    /* URL invalide : ignorée */
  }
};

type NavEvent = { preventDefault(): void; isMainFrame?: boolean; url?: string };

/**
 * Sécurité des contenus web. La fenêtre principale est identifiée par son id ; TOUT autre
 * webContents (webviews et popups de connexion) reçoit le garde-fou : navigation du cadre principal
 * limitée aux domaines des services, le reste part dans le navigateur système.
 */
export function installNavigationSecurity(teamsPreloadPath: string, getMainWindow: () => BrowserWindow | null): void {
  const isMain = (c: WebContents): boolean => getMainWindow()?.webContents.id === c.id;

  app.on('web-contents-created', (_e, contents: WebContents) => {
    // Electron 33 : `event.isMainFrame` (et l'argument positionnel déprécié, en repli).
    const guard = (event: NavEvent, url: string, _inPlace?: boolean, isMainFrameArg?: boolean): void => {
      if (isMain(contents)) return;
      const mainFrame = event.isMainFrame ?? isMainFrameArg ?? true;
      const decision = guestNavigation(url, mainFrame, isHiddenContents(contents.id));
      if (decision === 'allow') return;
      event.preventDefault();
      if (decision === 'external') openExternal(url);
    };
    contents.on('will-navigate', (event, url, inPlace, isMainFrameArg) => {
      if (isMain(contents)) {
        if (url !== contents.getURL()) {
          event.preventDefault();
          openExternal(url);
        }
      } else guard(event, url, inPlace, isMainFrameArg);
    });
    contents.on('will-redirect', (event, url, inPlace, isMainFrameArg) => guard(event, url, inPlace, isMainFrameArg));

    contents.setWindowOpenHandler(({ url }) => {
      if (isMain(contents)) {
        openExternal(url);
        return { action: 'deny' };
      }
      const decision = popupPolicy(url);
      if (decision === 'popup') {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: undefined }
          }
        };
      }
      if (decision === 'same-view') void contents.loadURL(url).catch(() => undefined);
      else openExternal(url);
      return { action: 'deny' };
    });

    // Ctrl/Cmd+K depuis un onglet de service : on ouvre la palette de la fenêtre principale.
    contents.on('before-input-event', (event, input) => {
      if (isMain(contents) || !isPaletteShortcut(input)) return;
      event.preventDefault();
      getMainWindow()?.webContents.send('epihub:palette');
    });

    contents.on('will-attach-webview', (event, webPreferences, params) => {
      const isTeams = params.partition === 'persist:teams';
      const kind = classifyPreload(
        [params.preload, (webPreferences as { preload?: string }).preload, (webPreferences as { preloadURL?: string }).preloadURL],
        teamsPreloadPath
      );
      if (!isMain(contents) || !isServiceHomeOrigin(params.src) || !PARTITIONS.includes(params.partition ?? '') || kind === 'reject' || (kind === 'teams' && !isTeams)) {
        event.preventDefault();
        return;
      }
      delete (webPreferences as { preload?: string }).preload;
      delete (webPreferences as { preloadURL?: string }).preloadURL;
      delete params.preload;
      if (kind === 'teams') webPreferences.preload = teamsPreloadPath;
      webPreferences.nodeIntegration = false;
      webPreferences.nodeIntegrationInSubFrames = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      webPreferences.webSecurity = true;
      webPreferences.allowRunningInsecureContent = false;
    });
  });
}
