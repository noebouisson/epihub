import type { BrowserWindow } from 'electron';

/** Fenêtres invisibles d'EpiHub (renouvellement du jeton, export PDF), fermées à la sortie de l'application. */
const windows = new Set<BrowserWindow>();
/** ids de leurs webContents : le garde-fou de navigation ne les envoie jamais vers le navigateur système. */
const contentsIds = new Set<number>();

export function trackHiddenWindow(win: BrowserWindow): void {
  const id = win.webContents.id;
  windows.add(win);
  contentsIds.add(id);
  win.once('closed', () => {
    windows.delete(win);
    contentsIds.delete(id);
  });
}

export const isHiddenContents = (id: number): boolean => contentsIds.has(id);

export function destroyHiddenWindows(): void {
  for (const win of [...windows]) if (!win.isDestroyed()) win.destroy();
  windows.clear();
  contentsIds.clear();
}
