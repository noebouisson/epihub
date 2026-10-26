export const MAX_PDF_PAGES = 80
export const MAX_TEXT_CHARS = 500_000
const MIN_USEFUL_CHARS = 20

interface TextItem { str: string; transform: number[]; width: number }
const isTextItem = (i: unknown): i is TextItem => !!i && typeof i === 'object' && typeof (i as TextItem).str === 'string' && Array.isArray((i as TextItem).transform)

/** Regroupe les fragments d'une page en lignes (même position verticale), puis ordonne chaque ligne de gauche à droite. */
function pageLines(items: TextItem[]): string[] {
  const rows: { y: number; parts: TextItem[] }[] = []
  for (const it of items) {
    if (it.str === '') continue
    const y = it.transform[5]
    const row = rows.find((r) => Math.abs(r.y - y) <= 2)
    if (row) row.parts.push(it)
    else rows.push({ y, parts: [it] })
  }
  rows.sort((a, b) => b.y - a.y)
  return rows
    .map((r) => {
      let line = ''
      let end = -Infinity
      for (const p of r.parts.sort((a, b) => a.transform[4] - b.transform[4])) {
        const x = p.transform[4]
        if (line && !/\s$/.test(line) && !/^\s/.test(p.str) && x - end > 1) line += ' '
        line += p.str
        end = x + (p.width || 0)
      }
      return line.trim()
    })
    .filter((l) => l !== '')
}

/**
 * Texte d'un PDF, une ligne par ligne visuelle. Aucun script du PDF n'est évalué (`isEvalSupported: false`) ;
 * taille et nombre de pages bornés. Les erreurs sont des messages destinés à l'utilisateur (jamais le contenu).
 */
export async function extractPdfCore(buffer: Uint8Array): Promise<string> {
  // Build « legacy » Node de pdfjs (ESM) : import dynamique pour qu'il reste externe au bundle principal.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>
  // pdfjs 6 n'évalue plus de code (l'option `isEvalSupported` a disparu des types) ; on la garde à false par défense en profondeur.
  const params = { data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }
  const task = pdfjs.getDocument(params)
  try {
    doc = await task.promise
  } catch {
    await task.destroy().catch(() => undefined)
    throw new Error('PDF illisible')
  }
  try {
    if (doc.numPages > MAX_PDF_PAGES) throw new Error('PDF trop long')
    const lines: string[] = []
    let total = 0
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      for (const l of pageLines((content.items as unknown[]).filter(isTextItem))) {
        lines.push(l)
        total += l.length + 1
      }
      page.cleanup()
      if (total > MAX_TEXT_CHARS) break
    }
    const text = lines.join('\n').slice(0, MAX_TEXT_CHARS)
    if (text.replace(/\s/g, '').length < MIN_USEFUL_CHARS) throw new Error('Ce PDF ne contient pas de texte lisible')
    return text
  } catch (err) {
    if (err instanceof Error && (err.message === 'PDF trop long' || err.message === 'Ce PDF ne contient pas de texte lisible')) throw err
    throw new Error('PDF illisible')
  } finally {
    await task.destroy().catch(() => undefined)
  }
}
