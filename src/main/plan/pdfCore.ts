export const MAX_PDF_PAGES = 80
export const MAX_TEXT_CHARS = 500_000
const MIN_USEFUL_CHARS = 20

export interface TextItem { str: string; transform: number[]; width: number }
const isTextItem = (i: unknown): i is TextItem => !!i && typeof i === 'object' && typeof (i as TextItem).str === 'string' && Array.isArray((i as TextItem).transform)

const BLANK_FACTOR = 1.5
const PAGE_NUMBER = /^\d+$/

/**
 * Regroupe les fragments d'une page en lignes (même position verticale), ordonne chaque ligne de gauche à droite,
 * et rend les paragraphes : une ligne vide quand l'écart vertical avec la ligne précédente dépasse 1,5 × l'écart
 * médian de la page (à défaut d'au moins 2 écarts : 1,5 × la hauteur de police). Les numéros de page seuls sont retirés.
 */
export function pageLines(items: TextItem[]): string[] {
  const rows: { y: number; h: number; parts: TextItem[] }[] = []
  for (const it of items) {
    if (it.str === '') continue
    const y = it.transform[5]
    const row = rows.find((r) => Math.abs(r.y - y) <= 2)
    if (row) row.parts.push(it)
    else rows.push({ y, h: Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || 0, parts: [it] })
  }
  rows.sort((a, b) => b.y - a.y)
  const lines = rows
    .map((r) => {
      let line = ''
      let end = -Infinity
      for (const p of r.parts.sort((a, b) => a.transform[4] - b.transform[4])) {
        const x = p.transform[4]
        if (line && !/\s$/.test(line) && !/^\s/.test(p.str) && x - end > 1) line += ' '
        line += p.str
        end = x + (p.width || 0)
      }
      return { y: r.y, h: r.h, text: line.trim() }
    })
    .filter((l) => l.text !== '' && !PAGE_NUMBER.test(l.text))
  const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y).filter((g) => g > 0).sort((a, b) => a - b)
  const median = gaps.length >= 2 ? gaps[Math.floor((gaps.length - 1) / 2)] : null
  const out: string[] = []
  lines.forEach((l, i) => {
    if (i > 0) {
      const gap = lines[i - 1].y - l.y
      const limit = BLANK_FACTOR * (median ?? Math.max(l.h, lines[i - 1].h))
      if (limit > 0 && gap > limit) out.push('')
    }
    out.push(l.text)
  })
  return out
}

/**
 * Texte d'un PDF, une ligne par ligne visuelle. Aucun script du PDF n'est évalué (`isEvalSupported: false`) ;
 * taille et nombre de pages bornés. Les erreurs sont des messages destinés à l'utilisateur (jamais le contenu).
 */
export async function extractPdfCore(buffer: Uint8Array): Promise<string> {
  // Build « legacy » Node de pdfjs 4.10.38 (ESM ; la 5.x exige DOMMatrix, la 6.x fait planter Electron 33) :
  // import dynamique pour qu'il reste externe au bundle. Sous Node, pdfjs utilise son « fake worker » (même fil).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>
  // pdfjs 4.10.38 (≥ 4.2.67, correctif CVE-2024-4367) : aucun code du PDF n'est évalué.
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
      // Une ligne vide entre deux pages : un paragraphe ne continue jamais d'une page à l'autre.
      if (lines.length > 0) lines.push('')
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
