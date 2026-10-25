import { join } from 'node:path'

/** Fichier HTML temporaire d'un export PDF (dans userData) ; nom limité à `[A-Za-z0-9_-]`. */
export function pdfTempPath(dir: string, runId: string, stamp: number): string {
  return join(dir, `pdf-${runId.replace(/[^A-Za-z0-9_-]/g, '')}-${stamp}.html`)
}
