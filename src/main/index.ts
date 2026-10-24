import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, clipboard, Notification, safeStorage, session } from 'electron';
import type { ServiceId } from '../shared/types';
import { createEffects } from './app/effects';
import { registerIpc } from './ipc';
import { createNotificationHub, type HubNotification } from './notify/notificationHub';
import { createGithubService } from './services/github';
import { createIntraService } from './services/intra';
import { createMyEpitechService } from './services/myepitech';
import { createRegistry } from './services/registry';
import { createTeamsService } from './services/teams';
import type { FetchLike } from './services/types';
import { createSecrets } from './store/secrets';
import { createSettingsStore } from './store/settings';

const REFRESH_INTERVAL = 5 * 60_000;
let mainWindow: BrowserWindow | null = null;

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
      sandbox: true
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

/** Lit le token OIDC de My Epitech dans le localStorage de la partition, via une fenêtre cachée. */
async function readMyEpitechToken(): Promise<string | null> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { partition: 'persist:myepitech', contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  try {
    await Promise.race([
      win.loadURL('https://my.epitech.eu/'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Délai dépassé (My Epitech)')), 20_000))
    ]);
    const raw = (await win.webContents.executeJavaScript("localStorage.getItem('argos-api.oidc-token')")) as string | null;
    if (!raw) return null;
    const token = raw.replace(/^"+|"+$/g, '');
    return token || null;
  } catch {
    return null;
  } finally {
    if (!win.isDestroyed()) win.close();
  }
}

function start(): void {
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  const settings = createSettingsStore(join(dir, 'settings.json'));
  const secrets = createSecrets(join(dir, 'secrets.json'), safeStorage);
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
        mainWindow?.show();
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

  const registry = createRegistry(services, {
    now: Date.now,
    onChange: (_id, snap) => {
      mainWindow?.webContents.send('epihub:changed', registry.snapshot());
      if (snap.status.state === 'ok') {
        const s = registry.snapshot();
        void effects.afterRefresh({ github: s.github.data, intra: s.intra.data, myepitech: s.myepitech.data, teams: s.teams.data }).catch(() => {});
      }
    }
  });

  registerIpc({ registry, effects, settings, secrets, hub, teams, writeClipboard: (t) => clipboard.writeText(t) });
  registry.start(REFRESH_INTERVAL);
}

app.whenReady().then(() => {
  start();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
