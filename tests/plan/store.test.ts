import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createPlanStore, sanitizeKey, validItemId } from '../../src/main/plan/store'
import { parseSubject } from '../../src/main/plan/subject'

let dir: string
let s: ReturnType<typeof createPlanStore>
const pdf = new Uint8Array([37, 80, 68, 70])
const info = parseSubject('Binary name: my_ls')
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'plan-')); s = createPlanStore(dir) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

test('store : sujet puis suppression', () => {
  s.saveSubject('G-PSU-100/myls', 'my_ls.pdf', pdf, 'txt', info)
  const got = s.getSubject('G-PSU-100/myls')!
  expect(got.fileName).toBe('my_ls.pdf')
  expect(got.text).toBe('txt')
  expect(got.projectKey).toBe('G-PSU-100/myls')
  expect(readdirSync(join(dir, 'subjects')).sort()).toEqual(['G-PSU-100_myls.json', 'G-PSU-100_myls.pdf'])
  s.removeSubject('G-PSU-100/myls')
  expect(s.getSubject('G-PSU-100/myls')).toBeNull()
  expect(readdirSync(join(dir, 'subjects'))).toEqual([])
})
test('store : avancement persistant', () => {
  s.toggle('k', 'setup#0', true)
  expect(createPlanStore(dir).done('k')).toEqual(['setup#0'])
  expect(s.toggle('k', 'setup#0', true)).toEqual(['setup#0'])
  expect(s.toggle('k', 'setup#0', false)).toEqual([])
})
test('store : itemId invalide ignoré', () => {
  expect(s.toggle('k', '../x', true)).toEqual([])
})
test('clé forgée nettoyée, reste dans le dossier', () => {
  s.saveSubject('../../x', 'a.pdf', pdf, 't', info)
  expect(readdirSync(join(dir, 'subjects')).every((f) => !f.includes('..'))).toBe(true)
  expect(existsSync(join(dir, '..', 'x.json'))).toBe(false)
  expect(sanitizeKey('../../x')).toMatch(/^[A-Za-z0-9_-]+$/)
})
test('clé __proto__ sans effet de bord', () => {
  s.toggle('__proto__', 'a#0', true)
  expect(s.done('__proto__')).toEqual(['a#0'])
  expect(({} as Record<string, unknown>)['a#0']).toBeUndefined()
})
test('JSON corrompu → vide', () => {
  writeFileSync(join(dir, 'plans.json'), '{pas du json')
  expect(createPlanStore(dir).done('k')).toEqual([])
  s.saveSubject('k', 'a.pdf', pdf, 't', info)
  writeFileSync(join(dir, 'subjects', 'k.json'), 'oops')
  expect(s.getSubject('k')).toBeNull()
})
test('JSON d’un autre projet refusé', () => {
  s.saveSubject('a/b', 'a.pdf', pdf, 't', info)
  s.saveSubject('a_b', 'c.pdf', pdf, 't2', info)
  expect(s.getSubject('a/b')).toBeNull()
  expect(s.getSubject('a_b')!.text).toBe('t2')
})
test('itemId invalide refusé', () => {
  expect(validItemId('setup#0')).toBe(true)
  expect(validItemId('option:-R#1')).toBe(true)
  expect(validItemId('../x')).toBe(false)
  expect(validItemId(42)).toBe(false)
})
