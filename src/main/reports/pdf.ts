import { rm, writeFile } from 'node:fs/promises'
import { BrowserWindow } from 'electron'
import type { Report } from '../../shared/types'
import { trackHiddenWindow } from '../app/hiddenWindows'
import { renderHtml } from './html'
import { pdfTempPath } from './pdfTemp'

/**
 * Rend le rapport en PDF dans une fenêtre cachée, sans script ni accès réseau pilotable.
 * Le HTML passe par un fichier temporaire de `tmpDir` (userData) — pas d'URL data: (taille limitée) — supprimé ensuite.
 */
export async function exportPdf(report: Report, outFile: string, tmpDir: string): Promise<void> {
  const tmp = pdfTempPath(tmpDir, report.runId, Date.now())
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false }
  })
  trackHiddenWindow(win)
  try {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    await writeFile(tmp, renderHtml(report), { encoding: 'utf8', mode: 0o600 })
    await win.loadFile(tmp)
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
    await writeFile(outFile, pdf)
  } finally {
    if (!win.isDestroyed()) win.destroy()
    await rm(tmp, { force: true }).catch(() => undefined)
  }
}
