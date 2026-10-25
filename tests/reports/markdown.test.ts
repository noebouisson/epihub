import { expect, test } from 'vitest'
import { renderMarkdown, reportPath } from '../../src/main/reports/markdown'
import { full, ft, rep } from './helpers'

test('le commentaire reste du code, même avec des backticks', () => {
  const md = renderMarkdown(rep({ failedTests: [ft({ comment: 'got ``` <script>alert(1)</script>' })] }))
  expect(md).toContain('````')
  const open = md.indexOf('````')
  const close = md.indexOf('````', open + 4)
  const at = md.indexOf('<script>alert(1)</script>')
  expect(open).toBeGreaterThan(-1)
  expect(at).toBeGreaterThan(open)
  expect(at).toBeLessThan(close)
})
test('commentaire multiligne sans backtick : clôture de 3', () => {
  const md = renderMarkdown(rep({ failedTests: [ft({ comment: 'a\nb' })] }))
  expect(md).toContain('```\na\nb\n```')
})
test('texte des données échappé hors blocs', () => expect(renderMarkdown(rep({ projectTitle: 'a_b *c* <d>' }))).toContain('a\\_b \\*c\\* \\<d\\>'))
test('un titre multiligne ne casse pas la structure', () => {
  const md = renderMarkdown(rep({ projectTitle: 'x\n# pirate' }))
  expect(md).not.toMatch(/^# pirate/m)
})
test('reportPath nettoyé et horodaté', () => expect(reportPath(rep({ unitCode: 'G-CPE-101', projectCode: 'my printf/..', date: '2026-10-20T08:05:00', runId: '42' }))).toEqual({ dir: 'G-CPE-101-myprintf', file: '2026-10-20_08-05-42.md' }))
test('reportPath : runId malicieux', () => expect(reportPath(rep({ runId: '../../x' })).file).toBe('2026-10-20_08-05-x.md'))
test('score null affiché sans NaN', () => expect(renderMarkdown(rep({ score: null }))).not.toContain('null'))
test('le Markdown contient les sections', () => {
  const md = renderMarkdown(full)
  for (const h of ['## Résumé', '## Pourquoi', '## Comment s’améliorer', '## Évolution', '## Ce qui marche']) expect(md).toContain(h)
})
test('reportPath : codes vides après nettoyage → repli', () => expect(reportPath(rep({ unitCode: '///', projectCode: '-x-' })).dir).toBe('projet-x'))
