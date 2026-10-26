import { expect, test } from 'vitest'
import { extractPdfText } from '../../src/main/plan/pdfText'
import { makePdf } from './makePdf'

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
