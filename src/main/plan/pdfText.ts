import { join } from 'node:path'
import { Worker } from 'node:worker_threads'

export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const PDF_TIMEOUT_MS = 20_000
const KNOWN = ['PDF illisible', 'PDF trop long', 'Ce PDF ne contient pas de texte lisible']

export interface ExtractOptions {
  /** Chemin du worker compilé (défaut : `pdfWorker.js` à côté du bundle principal). */
  workerPath?: string
  timeoutMs?: number
}

/**
 * Texte d'un PDF non fiable, extrait dans un worker_thread isolé (le fil principal ne parse jamais le PDF) :
 * délai maximal, puis le worker est terminé. Erreurs : messages destinés à l'utilisateur, jamais le contenu.
 */
export function extractPdfText(buffer: Uint8Array, opts: ExtractOptions = {}): Promise<string> {
  if (buffer.byteLength > MAX_PDF_BYTES) return Promise.reject(new Error('PDF trop gros'))
  return new Promise((resolve, reject) => {
    let settled = false
    let worker: Worker
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void worker?.terminate()
      fn()
    }
    const timer = setTimeout(() => finish(() => reject(new Error('PDF illisible'))), opts.timeoutMs ?? PDF_TIMEOUT_MS)
    try {
      worker = new Worker(opts.workerPath ?? join(__dirname, 'pdfWorker.js'), { resourceLimits: { maxOldGenerationSizeMb: 512 } })
    } catch {
      clearTimeout(timer)
      reject(new Error('PDF illisible'))
      return
    }
    worker.once('message', (m: { text?: unknown; error?: unknown }) =>
      finish(() => (typeof m.text === 'string' ? resolve(m.text) : reject(new Error(KNOWN.includes(m.error as string) ? (m.error as string) : 'PDF illisible'))))
    )
    worker.once('error', () => finish(() => reject(new Error('PDF illisible'))))
    worker.once('exit', () => finish(() => reject(new Error('PDF illisible'))))
    // Copie transférée : l'appelant garde son tampon.
    const copy = buffer.slice().buffer
    worker.postMessage(copy, [copy])
  })
}
