import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseSubject } from '../../src/main/plan/subject'
import { buildPlan, planStatus } from '../../src/main/plan/plan'

const read = (f: string) => readFileSync(join(__dirname, '../fixtures/subjects', f), 'utf8')
const en = parseSubject(read('my_ls_en.txt'))
const fr = parseSubject(read('extrait_fr.txt'))
const now = new Date('2026-10-26T10:00:00')
const w = { start: '2026-10-20', end: '2026-11-06T18:42:00', now }

test('étapes du sujet my_ls dans l’ordre', () => expect(buildPlan(en, w).map((s) => s.id)).toEqual(['setup', 'base', 'option:-a', 'option:-l', 'option:-R', 'option:-d', 'option:-r', 'option:-t', 'errors', 'tests', 'finish', 'bonus']))
test('contenu : setup, option, erreurs, tests, bonus', () => {
  const s = buildPlan(en, w)
  const get = (id: string) => s.find((x) => x.id === id)!
  const setup = get('setup').items.map((i) => i.text).join('\n')
  expect(setup).toContain('B-PSU-100-my_ls')
  expect(setup).toContain('re, clean, fclean')
  expect(setup).toContain('my_ls')
  expect(setup).toContain('.gitignore')
  expect(get('base').items.map((i) => i.text).join('\n')).toContain('opendir')
  expect(get('option:-l').title).toBe('Option -l')
  expect(get('option:-l').details).toBe('use a long listing format')
  expect(get('errors').items.map((i) => i.text).join('\n')).toContain('84')
  const tests = get('tests').items.map((i) => i.text).join('\n')
  expect(tests).toContain('exemple 2')
  expect(tests).toContain('tests_run')
  expect(get('bonus').items).toHaveLength(3)
  expect(get('bonus').details).toBe('Seulement quand tout le reste est fait')
})
test('ids d’items stables', () => {
  const s = buildPlan(en, w)
  expect(s.find((x) => x.id === 'setup')!.items[0].id).toBe('setup#0')
  expect(s.find((x) => x.id === 'option:-R')!.items[1].id).toBe('option:-R#1')
  expect(buildPlan(en, w)).toEqual(s)
})
test('dates : croissantes, dernière = fin − 1 jour, première après aujourd’hui', () => {
  const t = buildPlan(en, w).map((s) => s.target!)
  expect([...t].sort()).toEqual(t)
  expect(t[t.length - 1]).toBe('2026-11-05')
  expect(t[0] >= '2026-10-26').toBe(true)
})
test('poids : setup 1/16,5 de dix jours → 27/10 ; base cumul 3 → 28/10', () => {
  const s = buildPlan(en, w)
  expect(s[0].target).toBe('2026-10-27')
  expect(s[1].target).toBe('2026-10-28')
})
test('début futur : la fenêtre commence au début', () => {
  const t = buildPlan(en, { start: '2026-11-01', end: '2026-11-06T18:42:00', now }).map((s) => s.target!)
  expect(t[0] >= '2026-11-01').toBe(true)
  expect(t[t.length - 1]).toBe('2026-11-05')
})
test('fin passée ou absente → dates nulles', () => {
  expect(buildPlan(en, { start: null, end: '2026-10-01', now }).every((s) => s.target === null)).toBe(true)
  expect(buildPlan(en, { start: null, end: null, now }).every((s) => s.target === null)).toBe(true)
  expect(buildPlan(en, { start: null, end: 'pas une date', now }).every((s) => s.target === null)).toBe(true)
})
test('rendu dans moins d’un jour → pas de NaN, dates ≤ fin', () => {
  const t = buildPlan(en, { start: null, end: '2026-10-26T20:00:00', now }).map((s) => s.target)
  expect(t.every((x) => x === null || /^\d{4}-\d{2}-\d{2}$/.test(x))).toBe(true)
  expect(t.every((x) => x !== null && x <= '2026-10-26')).toBe(true)
})
test('début invalide ignoré', () => expect(buildPlan(en, { start: 'x', end: '2026-11-06T18:42:00', now }).every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.target!))).toBe(true))
test('sans options → étape features', () => {
  const s = buildPlan(fr, w)
  expect(s.map((x) => x.id)).toContain('features')
  expect(s.find((x) => x.id === 'features')!.items.some((i) => /doit vérifier/.test(i.text))).toBe(true)
})
test('features : 12 exigences au plus', () => {
  const many = parseSubject(Array.from({ length: 20 }, (_, i) => `Le programme doit faire la chose ${i}.`).join('\n'))
  expect(buildPlan(many, w).find((x) => x.id === 'features')!.items).toHaveLength(12)
})
test('bonus : 10 lignes au plus', () => {
  const b = parseSubject('Bonus\n' + Array.from({ length: 20 }, (_, i) => `idée ${i}`).join('\n'))
  expect(buildPlan(b, w).find((x) => x.id === 'bonus')!.items).toHaveLength(10)
})
test('sujet vide → plan générique utilisable', () => expect(buildPlan(parseSubject(''), w).map((s) => s.id)).toEqual(['setup', 'base', 'features', 'errors', 'tests', 'finish']))

test('avancement', () => {
  const s = buildPlan(en, w)
  const all = s.flatMap((x) => x.items.map((i) => i.id))
  const st = planStatus(s, s[0].items.map((i) => i.id), now)
  expect(st.current!.id).toBe('base')
  expect(st.progress).toBe(Math.round((s[0].items.length / all.length) * 100))
  expect(st.late).toEqual([])
})
test('avancement : tout fait → current null, 100 %, ids disparus ignorés', () => {
  const s = buildPlan(en, w)
  const st = planStatus(s, [...s.flatMap((x) => x.items.map((i) => i.id)), 'option:-zz#0'], now)
  expect(st).toEqual({ progress: 100, current: null, late: [] })
})
test('avancement : aucune étape', () => expect(planStatus([], [], now)).toEqual({ progress: 0, current: null, late: [] }))
test('retards', () => {
  const s = buildPlan(en, w)
  const later = new Date('2026-10-30T09:00:00')
  const st = planStatus(s, s[0].items.map((i) => i.id), later)
  const ids = st.late.map((x) => x.id)
  expect(ids).toContain('base')
  expect(ids).not.toContain('setup')
  expect(ids).not.toContain('finish')
})
test('retards : sans date cible, jamais en retard', () => {
  const s = buildPlan(en, { start: null, end: null, now })
  expect(planStatus(s, [], new Date('2030-01-01T00:00:00')).late).toEqual([])
})
