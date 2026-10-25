import { expect, test } from 'vitest'
import { renderHtml } from '../../src/main/reports/html'
import { full, ft, rep } from './helpers'

test('HTML échappé', () => {
  const h = renderHtml(rep({ failedTests: [ft({ comment: '<script>x</script>' })] }))
  expect(h).not.toContain('<script>x')
  expect(h).toContain('&lt;script&gt;x')
})
test('titre échappé, guillemets compris', () => {
  const h = renderHtml(rep({ projectTitle: '"><img src=x onerror=1>' }))
  expect(h).not.toContain('<img')
  expect(h).toContain('&quot;&gt;&lt;img')
})
test('document complet', () => expect(renderHtml(full)).toMatch(/^<!doctype html>/i))
test('aucun script', () => expect(renderHtml(full)).not.toContain('<script'))
test('style, couverture et compteurs par catégorie', () => {
  const h = renderHtml(rep({
    style: { fatal: 1, major: 2, minor: 0, info: 0, penalty: null }, coverage: { lines: 30, branches: null },
    categories: [{ name: 'a', passed: 1, count: 3, crashed: 2, mandatoryFailed: 1 }]
  }))
  expect(h).toContain('1 fatal, 2 major')
  expect(h).toContain('lignes 30 %')
  expect(h).toContain('2 crash')
  expect(h).toContain('1 obligatoire(s) en échec')
})
test('conseils regroupés par priorité, comme le Markdown', () => {
  const html = renderHtml(rep({ advice: [{ priority: 1, title: 'Crashs', text: 'Lance valgrind.', tests: ['t1'] }, { priority: 3, title: 'Style', text: 'x', tests: [] }] }))
  expect(html).toContain('<h3>Priorité haute</h3><ul><li><strong>Crashs</strong> : Lance valgrind. Tests : t1</li></ul>')
  expect(html).toContain('<h3>Priorité basse</h3>')
  expect(html).not.toContain('Priorité moyenne')
  expect(html).not.toContain('(priorité')
})
