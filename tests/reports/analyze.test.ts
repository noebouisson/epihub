import { expect, test } from 'vitest'
import { scoreOf, verdictOf } from '../../src/shared/score'
import { buildReport } from '../../src/main/reports/analyze'
import { cat, det, sum, test_ } from './helpers'

test('score : somme des catégories', () => expect(scoreOf({ a: cat(10, 7), b: cat(10, 3) })).toBe(50))
test('score : plafonné à 99 tant qu’un test échoue', () => {
  expect(scoreOf({ a: cat(1000, 995) })).toBe(99)
  expect(scoreOf({ a: cat(1000, 1000) })).toBe(100)
  expect(scoreOf({ a: cat(200, 199) })).toBe(99)
})
test('score : aucun test → null', () => expect(scoreOf({})).toBeNull())
test('score : catégories à zéro test → null', () => expect(scoreOf({ a: cat(0, 0) })).toBeNull())
test('verdict réussi', () => expect(verdictOf(sum({ categories: { a: cat(5, 5) } }), det())).toBe('reussi'))
test('verdict sans détail', () => expect(verdictOf(sum({ categories: { a: cat(5, 5) } }), null)).toBe('reussi'))
test('verdict : 100 % mais un flag → partiel', () => expect(verdictOf(sum({ categories: { a: cat(5, 5) }, failureFlags: ['x'] }), det())).toBe('partiel'))
test('verdict : 60 % → partiel', () => expect(verdictOf(sum({ categories: { a: cat(10, 6) } }), det())).toBe('partiel'))
test('verdict échoué : < 50 %, no-test-passed, makeError, aucun test', () => {
  expect(verdictOf(sum({ categories: { a: cat(10, 4) } }), det())).toBe('echoue')
  expect(verdictOf(sum({ categories: { a: cat(10, 9) }, failureFlags: ['no-test-passed'] }), det())).toBe('echoue')
  expect(verdictOf(sum({ categories: { a: cat(10, 9) } }), det({ makeError: 'make: *** Error 1' }))).toBe('echoue')
  expect(verdictOf(sum({ categories: { a: cat(10, 9) } }), det({ deliveryError: 'x' }))).toBe('echoue')
  expect(verdictOf(sum({ categories: {} }), det())).toBe('echoue')
})
test('blockers dans l’ordre, flag inconnu hors blocages', () => expect(buildReport(sum({ failureFlags: ['no-test-passed', 'weird'] }), det({ deliveryError: 'x', makeError: 'y', bannedFunctions: ['printf'] })).blockers.map((b) => b.split(' :')[0])).toEqual(['Erreur de livraison', 'Erreur de compilation', 'Fonctions interdites', 'Aucun test ne passe']))
test('flags inconnus : un seul conseil P2 qui les liste, jamais « Priorité : Indicateur moulinette »', () => {
  const r = buildReport(sum({ categories: { a: cat(10, 9) }, failureFlags: ['weird', 'odd'] }), det())
  const flags = r.advice.filter((a) => a.title.startsWith('Indicateur'))
  expect(flags).toHaveLength(1)
  expect(flags[0].priority).toBe(2)
  expect(flags[0].text).toContain('weird, odd')
  expect(r.summary).not.toContain('Indicateur')
})
test('tests non exécutés mentionnés dans le résumé', () => {
  const { s, d } = failing()
  expect(buildReport(s, d).summary).toBe('18 tests sur 29 passent. 1 test non exécuté. Priorité : Tests obligatoires.')
  const two = det({ categories: [{ name: 'a', tests: [test_('x', { skipped: true }), test_('y', { skipped: true })] }] })
  expect(buildReport(sum(), two).summary).toContain('2 tests non exécutés.')
  expect(buildReport(sum(), det()).summary).not.toContain('non exécuté')
})
test('évolution par test : catégorie contenant « / »', () => {
  const t = (name: string, passed: boolean) => test_(name, { passed })
  const prev = { summary: sum(), detail: det({ categories: [{ name: 'bonus / extra', tests: [t('x', false)] }, { name: 'a/b', tests: [t('c', true)] }, { name: 'a', tests: [t('b/c', false)] }] }) }
  const r = buildReport(sum(), det({ categories: [{ name: 'bonus / extra', tests: [t('x', true)] }, { name: 'a/b', tests: [t('c', true)] }, { name: 'a', tests: [t('b/c', false)] }] }), prev)
  expect(r.evolution).toEqual({ fixed: ['x'], broken: [], byCategory: false })
})

const failing = () => ({
  s: sum({ categories: { a: cat(29, 18) } }),
  d: det({
    categories: [{ name: 'a', tests: [
      test_('t1'), test_('t2', { mandatory: true }), test_('t3', { crashed: true }), test_('t4', { skipped: true }), test_('t5', { passed: true })
    ] }]
  })
})

test('catégories triées par nom', () => {
  const r = buildReport(sum({ categories: { b: cat(2, 1), a: cat(3, 3) } }), det())
  expect(r.categories.map((c) => c.name)).toEqual(['a', 'b'])
  expect(r.working).toEqual(['a'])
})
test('tests échoués : obligatoires et crashs d’abord, skipped exclus', () => {
  const { s, d } = failing()
  expect(buildReport(s, d).failedTests.map((t) => t.name)).toEqual(['t2', 't3', 't1'])
})
test('conseils P1 crash avec texte valgrind et tests cités', () => {
  const { s, d } = failing()
  const a = buildReport(s, d).advice.find((x) => x.title === 'Crashs')!
  expect(a.priority).toBe(1)
  expect(a.text).toContain('valgrind')
  expect(a.tests).toEqual(['t3'])
})
test('conseil obligatoire cite le test', () => {
  const { s, d } = failing()
  const a = buildReport(s, d).advice.find((x) => x.title === 'Tests obligatoires')!
  expect(a.tests).toEqual(['t2'])
})
test('conseil format et base-avant-hard', () => {
  const r = buildReport(sum({ categories: { '01 - base tests': cat(5, 3), '04 - hard tests': cat(4, 0), '05 - easy format tests': cat(3, 1) } }), det())
  const p2 = r.advice.filter((x) => x.priority === 2).map((x) => x.title)
  expect(p2).toEqual(['Tests de base d’abord', 'Format de sortie'])
  expect(r.advice.find((x) => x.title === 'Format de sortie')!.text).toContain('caractère par caractère')
})
test('pas de conseil base si la catégorie base est complète', () => {
  const r = buildReport(sum({ categories: { '01 - base tests': cat(5, 5), '04 - hard tests': cat(4, 0) } }), det())
  expect(r.advice.map((x) => x.title)).not.toContain('Tests de base d’abord')
})
test('style et couverture en P3', () => {
  const r = buildReport(sum({ style: { fatal: 1, major: 0, minor: 0, info: 0, penalty: null } }), det({ coverage: { lines: 30, branches: null } }))
  expect(r.advice.filter((x) => x.priority === 3).map((x) => x.title)).toEqual(['Coding style', 'Couverture'])
})
test('tri des conseils par priorité', () => {
  const { s, d } = failing()
  const r = buildReport({ ...s, style: { fatal: 2, major: 0, minor: 0, info: 0, penalty: null } }, d)
  const prios = r.advice.map((x) => x.priority)
  expect(prios).toEqual([...prios].sort())
})
test('résumé', () => {
  const { s, d } = failing()
  expect(buildReport(s, d).summary).toBe('18 tests sur 29 passent. 1 test non exécuté. Priorité : Tests obligatoires.')
})
test('résumé à 100 %', () => expect(buildReport(sum(), det()).summary).toBe('10 tests sur 10 passent. Tous les tests passent.'))
test('évolution par test', () => {
  const prev = { summary: sum(), detail: det({ categories: [{ name: 'c', tests: [test_('a'), test_('b', { passed: true })] }] }) }
  const r = buildReport(sum(), det({ categories: [{ name: 'c', tests: [test_('a', { passed: true }), test_('b')] }] }), prev)
  expect(r.evolution).toEqual({ fixed: ['a'], broken: ['b'], byCategory: false })
})
test('évolution par catégorie sans détail précédent', () => {
  const r = buildReport(sum({ categories: { x: cat(5, 4) } }), det(), { summary: sum({ categories: { x: cat(5, 2) } }), detail: null })
  expect(r.evolution).toEqual({ fixed: ['x : +2'], broken: [], byCategory: true })
})
test('pas de précédent → evolution et delta null', () => {
  const r = buildReport(sum(), det())
  expect(r.evolution).toBeNull()
  expect(r.delta).toBeNull()
})
test('delta', () => expect(buildReport(sum({ categories: { a: cat(10, 6) } }), det(), { summary: sum({ categories: { a: cat(10, 4) } }), detail: null }).delta).toBe(20))
test('zéro test : score null, verdict échoué', () => {
  const r = buildReport(sum({ categories: {} }), det())
  expect(r.score).toBeNull()
  expect(r.verdict).toBe('echoue')
})

test('995/1000 : arrondi à 100 mais partiel, sans « Tous les tests passent »', () => {
  const s = sum({ categories: { a: cat(1000, 995) } })
  expect(verdictOf(s, det())).toBe('partiel')
  expect(buildReport(s, det()).summary).not.toContain('Tous les tests passent')
})
test('conseils de blocage actionnables, sans répéter l’erreur brute', () => {
  const r = buildReport(sum(), det({ makeError: 'make: *** Error 1' }))
  expect(r.blockers[0]).toContain('make: *** Error 1')
  const a = r.advice.find((x) => x.title === 'Erreur de compilation')!
  expect(a.text).toContain('make re')
  expect(a.text).not.toContain('Error 1')
})
test('évolution par test : deux catégories avec le même nom de test', () => {
  const t = (name: string, passed: boolean) => test_(name, { passed })
  const prev = { summary: sum(), detail: det({ categories: [{ name: 'x', tests: [t('a', false)] }, { name: 'y', tests: [t('a', true)] }] }) }
  const r = buildReport(sum(), det({ categories: [{ name: 'x', tests: [t('a', true)] }, { name: 'y', tests: [t('a', true)] }] }), prev)
  expect(r.evolution).toEqual({ fixed: ['a'], broken: [], byCategory: false })
})
