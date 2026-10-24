import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, clipboard, Notification, safeStorage, session } from 'electron';
import type { ServiceId } from '../shared/types';
import { debounce } from './app/debounce';
import { createEffects } from './app/effects';
import { revealWindow } from './app/window';
import { registerIpc } from './ipc';
import { readMyEpitechToken } from './myepitechToken';
import { installNavigationSecurity } from './security';
import { configureServiceSessions } from './sessions';
import { createNotificationHub, type HubNotification } from './notify/notificationHub';
import { createGithubService } from './services/github';
import { createIntraService } from './services/intra';
import { createMyEpitechService } from './services/myepitech';
import { createRegistry } from './services/registry';
import { createTeamsService } from './services/teams';
import type { FetchLike } from './services/types';
import { createSecrets, isEncryptionUsable } from './store/secrets';
import { createSettingsStore } from './store/settings';
import { createSnapshotCache } from './store/snapshotCache';

const REFRESH_INTERVAL = 5 * 60_000;
const TEAMS_PRELOAD_PATH = join(__dirname, '../preload/teams-webview.js');
let mainWindow: BrowserWindow | null = null;

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0f1115',
    title: 'EpiHub',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

/** Session.fetch d'Electron renvoie une Response standard : elle satisfait FetchLike (cookies de la partition inclus). */
const partitionFetch = (id: ServiceId): FetchLike => (url, init) => session.fromPartition(`persist:${id}`).fetch(url, init);

function start(): void {
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  const settings = createSettingsStore(join(dir, 'settings.json'));
  const secrets = createSecrets(join(dir, 'secrets.json'), {
    // Sous Linux, le backend basic_text n'offre aucune protection : traité comme indisponible.
    isEncryptionAvailable: () =>
      isEncryptionUsable(process.platform, safeStorage.isEncryptionAvailable(), process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : undefined),
    encryptString: (s) => safeStorage.encryptString(s),
    decryptString: (b) => safeStorage.decryptString(b)
  });
  const cache = createSnapshotCache(join(dir, 'cache.json'));
  const seenPath = join(dir, 'notified.json');

  const hub = createNotificationHub({
    now: Date.now,
    enabled: (service) => settings.get().notify[service],
    load: () => {
      try {
        return JSON.parse(readFileSync(seenPath, 'utf8')) as Record<string, number>;
      } catch {
        return {};
      }
    },
    save: (seen) => writeFileSync(seenPath, JSON.stringify(seen)),
    show: (n: HubNotification) => {
      const notif = new Notification({ title: n.title, body: n.body });
      notif.on('click', () => {
        revealWindow(mainWindow);
        mainWindow?.webContents.send('epihub:open', { service: n.target.service, url: n.target.url });
      });
      notif.show();
    }
  });

  const github = createGithubService(partitionFetch('github'), () => secrets.getGithubToken());
  const teams = createTeamsService();
  const services = {
    github,
    intra: createIntraService(partitionFetch('intra')),
    myepitech: createMyEpitechService(partitionFetch('myepitech'), readMyEpitechToken),
    teams
  };

  const effects = createEffects({ lastCommit: (f, b) => github.lastCommit(f, b), settings: () => settings.get(), hub, now: Date.now });

  // Un cycle de rafraîchissement (4 services) ne déclenche qu'un seul passage des effets.
  const runEffects = debounce(() => {
    const s = registry.snapshot();
    void effects
      .afterRefresh({ github: s.github.data, intra: s.intra.data, myepitech: s.myepitech.data, teams: s.teams.data })
      .catch((err: unknown) => console.error('[epihub] afterRefresh:', errMsg(err)));
  }, 500);

  const registry = createRegistry(services, {
    now: Date.now,
    initial: cache.load(),
    onChange: (_id, snap) => {
      mainWindow?.webContents.send('epihub:changed', registry.snapshot());
      if (snap.status.state === 'ok') {
        try {
          cache.save(registry.snapshot());
        } catch (err) {
          console.error('[epihub] cache:', errMsg(err));
        }
        runEffects();
      }
    }
  });

  registerIpc({
    teamsPreloadPath: pathToFileURL(TEAMS_PRELOAD_PATH).href,
    refreshTeams: () => void registry.refresh('teams').catch((err: unknown) => console.error('[epihub] teams refresh:', errMsg(err))),
    mainWebContentsId: () => mainWindow?.webContents.id,
    registry,
    effects,
    settings,
    secrets,
    hub,
    teams,
    writeClipboard: (t) => clipboard.writeText(t)
  });
  registry.start(REFRESH_INTERVAL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => revealWindow(mainWindow));

  app.whenReady().then(() => {
    configureServiceSessions();
    installNavigationSecurity(TEAMS_PRELOAD_PATH, () => mainWindow);
    start();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
