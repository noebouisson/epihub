import { expect, test } from 'vitest'
import { pdfTempPath } from '../../src/main/reports/pdfTemp'

test('pdfTempPath : fichier HTML temporaire dans le dossier donné, nom nettoyé', () => {
  expect(pdfTempPath('/u', '42', 1700)).toBe('/u/pdf-42-1700.html')
  expect(pdfTempPath('/u', '../x', 1)).toBe('/u/pdf-x-1.html')
})
