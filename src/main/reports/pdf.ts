import { writeFile } from 'node:fs/promises'
import { BrowserWindow } from 'electron'
import type { Report } from '../../shared/types'
import { renderHtml } from './html'

/** Rend le rapport en PDF dans une fenêtre cachée, sans script ni accès réseau pilotable. */
export async function exportPdf(report: Report, outFile: string): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false }
  })
  try {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(renderHtml(report)))
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
    await writeFile(outFile, pdf)
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}
