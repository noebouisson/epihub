import type { BrowserWindow } from 'electron';

/** Ramène la fenêtre au premier plan (même réduite ou cachée). */
export function revealWindow(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
