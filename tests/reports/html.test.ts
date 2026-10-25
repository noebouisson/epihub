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
