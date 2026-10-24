import { BrowserWindow } from 'electron';
import { MYEPITECH_HOME, MYEPITECH_TOKEN_KEY, usableToken } from './services/myepitech';

/**
 * Lit le token OIDC de My Epitech dans le localStorage de la partition, via une fenêtre cachée.
 * null = pas de token utilisable (connexion requise) ; exception = My Epitech injoignable.
 */
export async function readMyEpitechToken(): Promise<string | null> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { partition: 'persist:myepitech', contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  // Fenêtre invisible : aucune popup, jamais (remplace le gestionnaire générique).
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  let timer: NodeJS.Timeout | undefined;
  const run = async (): Promise<string | null> => {
    try {
      await win.loadURL(MYEPITECH_HOME);
    } catch {
      throw new Error('My Epitech injoignable');
    }
    // Le SPA écrit (ou renouvelle) le token après le chargement : on interroge jusqu'à 5 s ;
    // un JWT expiré est traité comme absent.
    for (let i = 0; i < 10; i++) {
      const raw = (await win.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(MYEPITECH_TOKEN_KEY)})`)) as string | null;
      const token = usableToken(raw, Date.now());
      if (token) return token;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  };
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('My Epitech injoignable')), 20_000);
      })
    ]);
  } finally {
    clearTimeout(timer);
    if (!win.isDestroyed()) win.destroy();
  }
}
