import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createReportPipeline, isInsideDir, pdfPathFor } from '../../src/main/reports/pipeline'
import { createReportStore } from '../../src/main/reports/store'
import { NeedsLoginError } from '../../src/main/services/types'
import { projectKey } from '../../src/shared/projects'
import type { MyEpitechData, MyProject } from '../../src/shared/types'
import { cat, det, rep, sum, test_ } from './helpers'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'epihub-pipe-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const project: MyProject = { id: 'p1', name: 'My printf', unitCode: 'G-CPE-101', unitName: 'C', description: '', start: '2026-10-01', end: '2026-11-01', url: '' }
const data: MyEpitechData = {
  profile: { login: 'jane.doe@epitech.eu', name: 'Jane', promotion: null, semester: null, gpa: null, cursus: null },
  projects: [project],
  runs: { p1: [
    sum({ id: '9001', title: 'My printf', categories: { a: cat(29, 18) } }),
    sum({ id: '9000', title: 'My printf', categories: { a: cat(30, 15) } })
  ] }
}

function setup(freshStore = false) {
  const store = createReportStore(dir)
  if (!freshStore) store.markInitialized()
  const runDetail = vi.fn(async (_id: string) => det({ categories: [{ name: 'a', tests: [test_('t1')] }] }))
  const writeFile = vi.fn(async (_p: string, _d: string) => {})
  const mkdir = vi.fn(async (_p: string) => {})
  const notify = vi.fn()
  const pipe = createReportPipeline({ runDetail, store, docsDir: '/docs', writeFile, mkdir, notify, projectKeyOf: (p) => projectKey(p.unitCode, p.name), now: () => Date.parse('2026-10-21T00:00:00') })
  return { store, runDetail, writeFile, mkdir, notify, pipe }
}

test('nouveau passage → rapport, fichier, entrée, notification', async () => {
  const { pipe, writeFile, store, notify } = setup()
  await pipe.process(data)
  expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('/docs/EpiHub/rapports/G-CPE-101-myprintf/'), expect.stringContaining('## Pourquoi'))
  expect(store.has('9001')).toBe(true)
  expect(store.get('9001')?.projectKey).toBe('G-CPE-101/myprintf')
  expect(notify).toHaveBeenCalledWith('My printf : 62 % (+12)', 'Rapport prêt', 'G-CPE-101/myprintf', '9001')
})

test('premier lancement : pas de notification, puis initialisé', async () => {
  const { pipe, notify, store } = setup(true)
  await pipe.process(data)
  expect(notify).not.toHaveBeenCalled()
  expect(store.isInitialized()).toBe(true)
  expect(store.has('9001')).toBe(true)
})

test('pas de doublon : détail courant + précédent, une seule fois', async () => {
  const { pipe, runDetail, writeFile } = setup()
  await pipe.process(data)
  await pipe.process(data)
  expect(runDetail).toHaveBeenCalledTimes(2)
  expect(runDetail.mock.calls.map((c) => c[0]).sort()).toEqual(['9000', '9001'])
  expect(writeFile).toHaveBeenCalledTimes(1)
})

test('détail précédent en erreur : rapport généré quand même', async () => {
  const { pipe, runDetail, store } = setup()
  runDetail.mockImplementation(async (id: string) => { if (id === '9000') throw new Error('x'); return det() })
  await pipe.process(data)
  expect(store.has('9001')).toBe(true)
})

test('détail en erreur → rien d’indexé, réessayé ensuite', async () => {
  const { pipe, runDetail, store } = setup()
  runDetail.mockRejectedValueOnce(new Error('x'))
  await pipe.process(data)
  expect(store.has('9001')).toBe(false)
  await pipe.process(data)
  expect(store.has('9001')).toBe(true)
})

const two = (): MyEpitechData => ({ ...data, projects: [project, { ...project, id: 'p2', name: 'Autre' }], runs: { ...data.runs, p2: [sum({ id: '9100', title: 'Autre', categories: { a: cat(10, 5) } })] } })

test('premier lancement avec un projet en échec : initialisé, nouveau passage ailleurs notifié, passage en échec jamais notifié', async () => {
  const { pipe, runDetail, store, notify } = setup(true)
  runDetail.mockImplementation(async (id: string) => { if (id === '9001') throw new Error('x'); return det() })
  await pipe.process(two())
  expect(store.isInitialized()).toBe(true)
  expect(store.has('9100')).toBe(true)
  expect(notify).not.toHaveBeenCalled()
  // nouveau passage sur le projet 2
  const next = two()
  next.runs['p2'] = [sum({ id: '9101', title: 'Autre', categories: { a: cat(10, 8) } }), ...next.runs['p2']]
  runDetail.mockImplementation(async () => det())
  await pipe.process(next)
  expect(store.has('9001')).toBe(true)
  expect(notify).toHaveBeenCalledTimes(1)
  expect(notify.mock.calls[0][3]).toBe('9101')
  expect(createReportStore(dir).isSilent('9001')).toBe(false)
})

test('premier process sans aucun passage : reste non initialisé', async () => {
  const { pipe, store } = setup(true)
  await pipe.process({ ...data, runs: {} })
  expect(store.isInitialized()).toBe(false)
})

test('reconnexion requise : arrêt du lot, projets restants intacts et jamais marqués silencieux', async () => {
  const { pipe, runDetail, store, notify } = setup(true)
  runDetail.mockRejectedValue(new NeedsLoginError())
  await pipe.process(two())
  expect(runDetail).toHaveBeenCalledTimes(1)
  expect(store.has('9001')).toBe(false)
  expect(store.has('9100')).toBe(false)
  expect(store.isSilent('9001')).toBe(false)
  expect(store.isSilent('9100')).toBe(false)
  expect(store.isInitialized()).toBe(false)
  runDetail.mockImplementation(async () => det())
  await pipe.process(two())
  expect(store.has('9001') && store.has('9100')).toBe(true)
  expect(notify).not.toHaveBeenCalled()
})

test('une erreur sur un projet n’arrête pas les autres', async () => {
  const { pipe, runDetail, store } = setup()
  runDetail.mockImplementation(async (id: string) => { if (id === '9001') throw new Error('x'); return det() })
  await pipe.process(two())
  expect(store.has('9001')).toBe(false)
  expect(store.has('9100')).toBe(true)
})

test('écriture en échec → entrée avec file null, réécrite au cycle suivant', async () => {
  const { pipe, writeFile, store, runDetail, notify } = setup()
  writeFile.mockRejectedValueOnce(new Error('EACCES'))
  await pipe.process(data)
  expect(store.get('9001')?.file).toBeNull()
  expect(notify).toHaveBeenCalledTimes(1)
  await pipe.process(data)
  expect(store.get('9001')?.file).toContain('/docs/EpiHub/rapports/G-CPE-101-myprintf/')
  expect(runDetail).toHaveBeenCalledTimes(2)
  expect(notify).toHaveBeenCalledTimes(1)
})

test('process concurrents : une seule génération', async () => {
  const { pipe, store, writeFile } = setup()
  await Promise.all([pipe.process(data), pipe.process(data)])
  expect(store.list('G-CPE-101/myprintf')).toHaveLength(1)
  expect(writeFile).toHaveBeenCalledTimes(1)
})

test('projet sans passage ignoré', async () => {
  const { pipe, runDetail } = setup()
  await pipe.process({ ...data, runs: {} })
  expect(runDetail).not.toHaveBeenCalled()
})

const many = (n: number, date = '2026-10-20T08:05:00'): MyEpitechData => ({
  ...data,
  projects: Array.from({ length: n }, (_, i) => ({ ...project, id: `q${i}`, name: `Projet ${i}` })),
  runs: Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i}`, [sum({ id: String(7000 + i), title: `Projet ${i}`, date })]]))
})

test('process renvoie le nombre de rapports enregistrés', async () => {
  const { pipe } = setup()
  expect(await pipe.process(data)).toBe(1)
  expect(await pipe.process(data)).toBe(0)
})

test('passage de plus de 7 jours : rapport généré, pas de notification', async () => {
  const { pipe, notify, store } = setup()
  await pipe.process(many(1, '2026-10-13T08:00:00'))
  expect(store.has('7000')).toBe(true)
  expect(notify).not.toHaveBeenCalled()
})

test('jusqu’à 3 notifications individuelles', async () => {
  const { pipe, notify } = setup()
  await pipe.process(many(3))
  expect(notify).toHaveBeenCalledTimes(3)
  expect(notify.mock.calls.map((c) => c[3])).toEqual(['7000', '7001', '7002'])
})

test('plus de 3 : une seule notification groupée', async () => {
  const { pipe, notify, store } = setup()
  await pipe.process(many(4))
  expect(store.has('7003')).toBe(true)
  expect(notify).toHaveBeenCalledTimes(1)
  expect(notify.mock.calls[0][0]).toBe('4 nouveaux résultats de moulinette')
  expect(notify.mock.calls[0][2]).toBeNull()
})

test('pdfPathFor : à côté du .md, nom nettoyé', () => {
  expect(pdfPathFor(rep({ runId: '42' }), '/d/r')).toBe('/d/r/G-CPE-101-myprintf/2026-10-20_08-05-42.pdf')
})

test('isInsideDir', () => {
  expect(isInsideDir('/d/r/a.md', '/d/r')).toBe(true)
  expect(isInsideDir('/d/r/../x.md', '/d/r')).toBe(false)
  expect(isInsideDir('/d/rapports2/a.md', '/d/rapports')).toBe(false)
  expect(isInsideDir('/d/r/..foo/a.md', '/d/r')).toBe(true)
})
