import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseSubject } from '../../src/main/plan/subject'
import { buildPlan } from '../../src/main/plan/plan'
import { evaluateRepo, improvements } from '../../src/main/plan/improvements'
import type { RepoCheck } from '../../src/shared/types'
import { rep } from '../reports/helpers'

const en = parseSubject(readFileSync(join(__dirname, '../fixtures/subjects/my_ls_en.txt'), 'utf8'))
const now = new Date('2026-10-26T10:00:00')
const end = '2026-11-06T18:42:00'
const steps = buildPlan(en, { start: '2026-10-20', end, now })
const okRepo: RepoCheck = { lastPush: '2026-10-25T10:00:00', hasMakefile: true, forbiddenFiles: [], hasTests: true }
const base = { info: en, steps, done: [] as string[], report: null, repo: okRepo as RepoCheck | null | 'not-linked', end: end as string | null, now }

test('evaluateRepo', () => expect(evaluateRepo([{ name: 'Makefile', type: 'file' }, { name: 'main.o', type: 'file' }, { name: 'my_ls', type: 'file' }, { name: 'src', type: 'dir' }], '2026-10-20T00:00:00Z', 'my_ls')).toEqual({ lastPush: '2026-10-20T00:00:00Z', hasMakefile: true, forbiddenFiles: ['main.o', 'my_ls'], hasTests: false }))
test('evaluateRepo : .a, a.out, vgcore, dossier tests, sans binaire connu', () => {
  const r = evaluateRepo([{ name: 'libx.a', type: 'file' }, { name: 'a.out', type: 'file' }, { name: 'vgcore.123', type: 'file' }, { name: 'tests', type: 'dir' }, { name: 'my_ls', type: 'dir' }, { name: 'obj.o', type: 'dir' }], null, null)
  expect(r).toEqual({ lastPush: null, hasMakefile: false, forbiddenFiles: ['libx.a', 'a.out', 'vgcore.123'], hasTests: true })
})

test('rien à signaler → aucune piste', () => expect(improvements(base)).toEqual([]))
test('repo sans Makefile → P1', () => expect(improvements({ ...base, repo: { ...okRepo, hasMakefile: false } })).toEqual([{ source: 'repo', priority: 1, text: 'Ajoute un Makefile à la racine du dépôt' }]))
test('fichiers interdits → P1 avec la liste', () => expect(improvements({ ...base, repo: { ...okRepo, forbiddenFiles: ['main.o', 'my_ls'] } })).toEqual([{ source: 'repo', priority: 1, text: 'Retire du dépôt les fichiers qui ne doivent pas être poussés : main.o, my_ls' }]))
test('push il y a 6 jours, rendu dans 11 jours → P2', () => expect(improvements({ ...base, repo: { ...okRepo, lastPush: '2026-10-20T10:00:00' } })).toEqual([{ source: 'repo', priority: 2, text: 'Rien n\'a été poussé depuis 6 jours' }]))
test('push récent, ou rendu lointain, ou push inconnu → pas de piste', () => {
  expect(improvements({ ...base, repo: { ...okRepo, lastPush: '2026-10-24T10:00:00' } })).toEqual([])
  expect(improvements({ ...base, end: '2026-12-31T00:00:00Z', repo: { ...okRepo, lastPush: '2026-10-01T10:00:00' } })).toEqual([])
  expect(improvements({ ...base, repo: { ...okRepo, lastPush: null } })).toEqual([])
})
test('tests unitaires sans dossier tests → P2', () => expect(improvements({ ...base, repo: { ...okRepo, hasTests: false } })).toEqual([{ source: 'repo', priority: 2, text: 'Ajoute un dossier tests à la racine pour tes tests unitaires' }]))
test('repo inconnu (erreur) → aucune piste repo', () => expect(improvements({ ...base, repo: null })).toEqual([]))
test('repo non lié → P3', () => expect(improvements({ ...base, repo: 'not-linked' })).toEqual([{ source: 'repo', priority: 3, text: 'Lie le repo GitHub du projet pour des conseils sur ton code' }]))
test('étape en retard → P2 avec la date', () => {
  const r = improvements({ ...base, now: new Date('2026-10-30T10:00:00') })
  expect(r).toContainEqual({ source: 'temps', priority: 2, text: 'Étape « Mise en place » en retard (prévue le 27/10)' })
  expect(r.filter((x) => x.source === 'temps')).toHaveLength(3)
})
test('bonus commencé avant la fin → P3', () => {
  expect(improvements({ ...base, done: ['bonus#0'] })).toEqual([{ source: 'temps', priority: 3, text: 'Termine la partie obligatoire avant le bonus' }])
  const all = steps.flatMap((s) => s.items.map((i) => i.id))
  expect(improvements({ ...base, done: all })).toEqual([])
})
test('moulinette : un conseil → une piste (titre + tests)', () => {
  const report = rep({ advice: [{ priority: 1, title: 'Corrige le crash', text: 'détail', tests: ['t1', 't2'] }, { priority: 3, title: 'Soigne le style', text: 'x', tests: [] }] })
  expect(improvements({ ...base, report })).toEqual([
    { source: 'moulinette', priority: 1, text: 'Corrige le crash (tests : t1, t2)' },
    { source: 'moulinette', priority: 3, text: 'Soigne le style' }
  ])
})
test('tri : priorité puis moulinette, repo, temps', () => {
  const report = rep({ advice: [{ priority: 1, title: 'A', text: '', tests: [] }, { priority: 2, title: 'B', text: '', tests: [] }] })
  const r = improvements({
    ...base, report, now: new Date('2026-10-30T10:00:00'), done: ['bonus#0'],
    repo: { lastPush: '2026-10-20T10:00:00', hasMakefile: false, forbiddenFiles: ['a.out'], hasTests: false }
  })
  const order = r.map((x) => `${x.priority}${x.source}`)
  expect(order).toEqual(['1moulinette', '1repo', '1repo', '2moulinette', '2repo', '2repo', '2temps', '2temps', '2temps', '3temps'])
})
test('pas de sujet → P1 « Ajoute le sujet (PDF) pour obtenir la marche à suivre »', () => {
  const r = improvements({ ...base, info: null, steps: [], repo: 'not-linked' })
  expect(r.at(0)).toMatchObject({ priority: 1, source: 'temps', text: 'Ajoute le sujet (PDF) pour obtenir la marche à suivre' })
  expect(r).toHaveLength(2)
})

test('plus de 3 étapes en retard → une seule piste P2 groupée', () => {
  const later = new Date('2026-11-03T10:00:00')
  const late = improvements({ ...base, now: later }).filter((i) => i.source === 'temps')
  expect(late).toHaveLength(1)
  expect(late[0].priority).toBe(2)
  expect(late[0].text).toMatch(/^\d+ étapes en retard : Mise en place, Cas de base, Option -a…$/)
})
test('3 étapes en retard ou moins → une piste par étape', () => {
  const s3 = steps.slice(0, 3)
  const late = improvements({ ...base, steps: s3, now: new Date('2026-11-03T10:00:00') }).filter((i) => i.source === 'temps')
  expect(late.map((i) => i.text)).toEqual([0, 1, 2].map((k) => `Étape « ${s3[k].title} » en retard (prévue le ${s3[k].target!.slice(8, 10)}/${s3[k].target!.slice(5, 7)})`))
})
