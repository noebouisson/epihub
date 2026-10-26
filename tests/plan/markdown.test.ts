import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseSubject } from '../../src/main/plan/subject'
import { buildPlan } from '../../src/main/plan/plan'
import { renderPlanMarkdown } from '../../src/main/plan/markdown'

const en = parseSubject(readFileSync(join(__dirname, '../fixtures/subjects/my_ls_en.txt'), 'utf8'))
const now = new Date('2026-10-26T10:00:00')
const steps = buildPlan(en, { start: null, end: '2026-11-06T18:42:00Z', now })
const v = { title: 'My LS', unitCode: 'B-PSU-100', info: en, steps, done: [steps[0].items[0].id], improvements: [{ source: 'repo' as const, priority: 1 as const, text: 'Ajoute un Makefile' }, { source: 'temps' as const, priority: 3 as const, text: 'Termine avant le bonus' }], now }

test('sections, titre, cases cochées et non cochées', () => {
  const md = renderPlanMarkdown(v)
  expect(md.startsWith('# My LS — B-PSU-100')).toBe(true)
  expect(md).toContain('## Ce que le sujet demande')
  expect(md).toContain('## Marche à suivre')
  expect(md).toContain('## Pistes d\'amélioration')
  expect(md).toContain('- [x] ' + steps[0].items[0].text.replace(/[\\`*_[\]<>#]/g, (c) => `\\${c}`))
  expect(md).toContain('- [ ] ')
  expect(md).toContain('my\\_ls')
  expect(md).toContain('re, clean, fclean')
  expect(md).toContain('Ajoute un Makefile')
  expect(md).toContain('Priorité haute')
})
test('texte du sujet échappé, une seule ligne', () => {
  const info = { ...en, binaryName: '<script>*x*</script>', missing: ['a\n# titre'] }
  const md = renderPlanMarkdown({ ...v, info, title: 'T\n# faux titre', steps: [{ id: 'x', title: '`code`', details: 'a\nb', items: [{ id: 'x#0', text: '[lien](http://x) <b>' }], target: null }] })
  expect(md).not.toContain('<script>')
  expect(md).toContain('\\<script\\>\\*x\\*\\</script\\>')
  expect(md).not.toMatch(/^# faux titre/m)
  expect(md).not.toMatch(/^# titre/m)
  expect(md).toContain('\\[lien\\](http://x) \\<b\\>')
  expect(md).toContain('\\`code\\`')
})
test('date cible et retard', () => {
  const md = renderPlanMarkdown({ ...v, now: new Date('2026-11-04T10:00:00'), done: [] })
  expect(md).toMatch(/### Mise en place\n\nDate cible : 27\/10 — En retard/)
  expect(md).toContain('En retard')
})
test('sans piste : mention explicite', () => expect(renderPlanMarkdown({ ...v, improvements: [] })).toContain('Aucune piste pour le moment'))
