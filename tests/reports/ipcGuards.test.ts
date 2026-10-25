import { expect, test } from 'vitest'
import { isInsideDir } from '../../src/main/reports/pipeline'
import { validRunId } from '../../src/main/reports/store'

test('isInsideDir : refuse sortie de dossier, dossier voisin et dossier lui-même', () => {
  expect(isInsideDir('/d/r/a/b.md', '/d/r')).toBe(true)
  expect(isInsideDir('/d/r/../x.md', '/d/r')).toBe(false)
  expect(isInsideDir('/d/rapports2/a.md', '/d/rapports')).toBe(false)
  expect(isInsideDir('/d/r', '/d/r')).toBe(false)
})

test('validRunId', () => {
  expect(validRunId('../1')).toBe(false)
  expect(validRunId('')).toBe(false)
  expect(validRunId(12)).toBe(false)
  expect(validRunId('9001')).toBe(true)
})
