import { parentPort } from 'node:worker_threads'
import { extractPdfCore } from './pdfCore'

/** Point d'entrée du worker : reçoit les octets du PDF, répond `{ text }` ou `{ error }` (message court, jamais le contenu). */
parentPort?.once('message', (data: ArrayBuffer) => {
  extractPdfCore(new Uint8Array(data)).then(
    (text) => parentPort?.postMessage({ text }),
    (err: unknown) => parentPort?.postMessage({ error: err instanceof Error ? err.message : '' })
  )
})
