import { pathToFileURL } from 'node:url';
import { app, shell, type WebContents } from 'electron';
import { isAllowedUrl, isServiceHomeOrigin } from '../shared/domains';

const PARTITIONS = ['persist:github', 'persist:intra', 'persist:myepitech', 'persist:teams'];

const openExternal = (url: string): void => {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') void shell.openExternal(url);
  } catch {
    /* URL invalide : ignorée */
  }
};

/**
 * Sécurité des contenus web : webviews verrouillées (sans Node, sans preload sauf celui de Teams),
 * navigation limitée aux domaines des services, le reste part dans le navigateur système.
 */
export function installNavigationSecurity(teamsPreloadPath: string): void {
  const teamsPreloadUrl = pathToFileURL(teamsPreloadPath).href;

  app.on('web-contents-created', (_e, contents: WebContents) => {
    if (contents.getType() === 'webview') {
      const guard = (event: { preventDefault(): void }, url: string): void => {
        if (!isAllowedUrl(url)) {
          event.preventDefault();
          openExternal(url);
        }
      };
      contents.on('will-navigate', guard);
      contents.on('will-redirect', guard);
      contents.setWindowOpenHandler(({ url }) => {
        if (isAllowedUrl(url)) return { action: 'allow' };
        openExternal(url);
        return { action: 'deny' };
      });
      return;
    }

    // Fenêtre principale : jamais de navigation ni de nouvelle fenêtre.
    contents.on('will-navigate', (event, url) => {
      if (url !== contents.getURL()) {
        event.preventDefault();
        openExternal(url);
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      openExternal(url);
      return { action: 'deny' };
    });

    contents.on('will-attach-webview', (event, webPreferences, params) => {
      const rawPreload = params.preload ?? (webPreferences as { preload?: string }).preload;
      const isTeams = params.partition === 'persist:teams';
      const preloadOk = rawPreload === undefined || (isTeams && (rawPreload === teamsPreloadPath || rawPreload === teamsPreloadUrl));
      if (!isServiceHomeOrigin(params.src) || !PARTITIONS.includes(params.partition ?? '') || !preloadOk) {
        event.preventDefault();
        return;
      }
      delete (webPreferences as { preload?: string }).preload;
      delete (webPreferences as { preloadURL?: string }).preloadURL;
      delete params.preload;
      if (isTeams && rawPreload !== undefined) webPreferences.preload = teamsPreloadPath;
      webPreferences.nodeIntegration = false;
      webPreferences.nodeIntegrationInSubFrames = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      webPreferences.webSecurity = true;
      webPreferences.allowRunningInsecureContent = false;
    });
  });
}
