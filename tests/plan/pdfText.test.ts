import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { beforeAll, expect, test } from 'vitest'
import { pageLines } from '../../src/main/plan/pdfCore'
import { extractPdfText as extract } from '../../src/main/plan/pdfText'
import { parseSubject } from '../../src/main/plan/subject'
import { makePdf } from './makePdf'

// Le worker TypeScript est compilé une fois (pdfjs reste externe, comme dans le build de l'app).
let workerPath = ''
beforeAll(async () => {
  const outDir = resolve('node_modules/.cache/epihub-test')
  mkdirSync(outDir, { recursive: true })
  workerPath = join(outDir, 'pdfWorker.cjs')
  await build({ entryPoints: [resolve('src/main/plan/pdfWorker.ts')], outfile: workerPath, bundle: true, platform: 'node', format: 'cjs', external: ['pdfjs-dist'], logLevel: 'silent' })
})
const extractPdfText = (b: Uint8Array) => extract(b, { workerPath })

const sample = () => makePdf([['Binary name: my_ls', 'Language: C', 'The Makefile must contain re.'], ['Page two requirement']])
const blank = () => makePdf([[]])

test('extrait le texte d’un PDF', async () => {
  const t = await extractPdfText(sample())
  expect(t).toContain('Binary name: my_ls')
  expect(t).toContain('Page two requirement')
})
test('les lignes sont reconstruites dans l’ordre vertical', async () => {
  const lines = (await extractPdfText(sample())).split('\n')
  expect(lines.indexOf('Binary name: my_ls')).toBeLessThan(lines.indexOf('Language: C'))
})
test('PDF sans texte → erreur claire', async () => {
  await expect(extractPdfText(blank())).rejects.toThrow('Ce PDF ne contient pas de texte lisible')
})
test('PDF corrompu → PDF illisible', async () => {
  await expect(extractPdfText(new TextEncoder().encode('pas un pdf'))).rejects.toThrow('PDF illisible')
})
test('trop gros', async () => {
  await expect(extractPdfText(new Uint8Array(20 * 1024 * 1024 + 1))).rejects.toThrow('PDF trop gros')
})
test('trop long', async () => {
  const pages = Array.from({ length: 81 }, (_, i) => [`Page number ${i} has some text`])
  await expect(extractPdfText(makePdf(pages))).rejects.toThrow('PDF trop long')
})
test('80 pages acceptées', async () => {
  const pages = Array.from({ length: 80 }, (_, i) => [`Page number ${i} has some text`])
  expect(await extractPdfText(makePdf(pages))).toContain('Page number 79')
})
test('le worker qui ne répond pas est terminé après le délai → PDF illisible', async () => {
  const hang = join(mkdtempSync(join(tmpdir(), 'hang-')), 'w.cjs')
  writeFileSync(hang, "require('node:worker_threads').parentPort.once('message', () => { for (;;); })")
  const t0 = Date.now()
  await expect(extract(sample(), { workerPath: hang, timeoutMs: 300 })).rejects.toThrow('PDF illisible')
  expect(Date.now() - t0).toBeLessThan(3000)
})
test('worker introuvable ou qui plante → PDF illisible', async () => {
  await expect(extract(sample(), { workerPath: join(tmpdir(), 'absent-worker.cjs') })).rejects.toThrow('PDF illisible')
})
test('texte plafonné à 500 000 caractères', async () => {
  const long = 'x'.repeat(300)
  const pages = Array.from({ length: 80 }, () => Array.from({ length: 200 }, () => long))
  const t = await extractPdfText(makePdf(pages, { size: 3, gap: 3.5 }))
  expect(t.length).toBeGreaterThan(400_000)
  expect(t.length).toBeLessThanOrEqual(500_000)
}, 30000)
test('le tampon de l’appelant reste utilisable', async () => {
  const b = sample()
  await extractPdfText(b)
  expect(b.byteLength).toBeGreaterThan(0)
})

// Fragment de texte pdfjs : x, y, hauteur de police.
const item = (str: string, x: number, y: number, h = 12) => ({ str, transform: [h, 0, 0, h, x, y], width: str.length * h * 0.5 })

test('pageLines : ligne vide quand l’écart vertical dépasse 1,5 × l’écart médian', () => {
  const items = [item('A one', 20, 700), item('B two', 20, 686), item('C three', 20, 672), item('D four', 20, 640), item('E five', 20, 626)]
  expect(pageLines(items)).toEqual(['A one', 'B two', 'C three', '', 'D four', 'E five'])
})
test('pageLines : à défaut d’écart médian, 1,5 × la hauteur de police', () => {
  expect(pageLines([item('A one', 20, 700), item('B two', 20, 640)])).toEqual(['A one', '', 'B two'])
  expect(pageLines([item('A one', 20, 700), item('B two', 20, 686)])).toEqual(['A one', 'B two'])
})
test('pageLines : les numéros de page seuls sont retirés', () => {
  const items = [item('A one', 20, 700), item('B two', 20, 686), item('C three', 20, 672), item('3', 300, 40)]
  expect(pageLines(items)).toEqual(['A one', 'B two', 'C three'])
})
test('pages séparées par une ligne vide', async () => {
  const lines = (await extractPdfText(makePdf([['Page one has text'], ['Page two has text']]))).split('\n')
  expect(lines).toEqual(['Page one has text', '', 'Page two has text'])
})

test('de bout en bout : PDF (vrai worker) → parseSubject identique au texte', async () => {
  const txt = readFileSync(join(__dirname, '../fixtures/subjects/my_ls_en.txt'), 'utf8')
  // Une page par section (titre en majuscules), Helvetica ne sait pas écrire « ∼ » : « ~ » dans le PDF.
  const pages: string[][] = [[]]
  for (const l of txt.replace(/\n+$/, '').split('\n')) {
    if (/^(OPTIONS|BONUS)$/.test(l)) pages.push([])
    pages[pages.length - 1].push(l.replace(/∼/g, '~'))
  }
  pages.forEach((p, i) => { while (p.length > 0 && p[p.length - 1] === '') p.pop(); p.push('', '', String(i + 1)) })
  const fromPdf = parseSubject(await extractPdfText(makePdf(pages, { size: 10, gap: 14 })))
  const fromTxt = parseSubject(txt)
  const pick = (i: typeof fromTxt) => ({
    binaryName: i.binaryName, makefileRules: i.makefileRules, authorizedFunctions: i.authorizedFunctions, options: i.options,
    errorCode84: i.errorCode84, unitTests: i.unitTests, examples: i.examples.length, bonus: i.bonus
  })
  expect(pick(fromPdf)).toEqual(pick(fromTxt))
  expect(fromTxt.authorizedFunctions).toHaveLength(16)
  expect(fromTxt.examples).toHaveLength(2)
})
