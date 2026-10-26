import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createPlanAssembler } from '../../src/main/plan/assemble'
import { createPlanStore } from '../../src/main/plan/store'
import { parseSubject } from '../../src/main/plan/subject'
import type { ProjectSummary, Report } from '../../src/shared/types'

let dir: string
let store: ReturnType<typeof createPlanStore>
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'asm-')); store = createPlanStore(dir) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const now = new Date('2026-10-26T10:00:00')
const summary = (o: Partial<ProjectSummary> = {}): ProjectSummary => ({
  key: 'B-PSU-100/myls', aliases: ['B-PSU-100/psu100myls'], projectId: '1', title: 'my_ls', moduleCode: 'B-PSU-100',
  deadline: { id: 'd', moduleCode: 'B-PSU-100', projectCode: 'x', title: 'my_ls', end: '2026-11-06T18:42:00', url: '', repo: null, lastCommit: null, alert: null, manual: false },
  lastResult: null, repo: null, teamsUrl: null, status: 'en-cours', ...o
})
const ended = summary({ key: 'B-PSU-100/old', aliases: [], status: 'termine', deadline: null })
const text = 'Binary name: my_ls\nThe project must be compiled with a Makefile.\n-a do not ignore entries starting with .\n-l use a long listing format\nThe Makefile must contain re, clean, fclean.'
const info = parseSubject(text)
const make = (o: Partial<Parameters<typeof createPlanAssembler>[0]> = {}) =>
  createPlanAssembler({ store, projects: async () => [summary(), ended], latestReport: () => null, hasGithubToken: () => true, now: () => now, ...o })
const import_ = (key = 'B-PSU-100/myls') => store.saveSubject(key, 's.pdf', new Uint8Array([1]), text, info)

test('clé inconnue ou projet terminé → null', async () => {
  const a = make()
  expect(await a.view('X/inconnu')).toBeNull()
  expect(await a.view('B-PSU-100/old')).toBeNull()
})
test('sans sujet : vue vide et piste P1', async () => {
  const v = (await make().view('B-PSU-100/myls'))!
  expect(v.subject).toBeNull()
  expect(v.steps).toEqual([])
  expect(v.title).toBe('my_ls')
  expect(v.unitCode).toBe('B-PSU-100')
  expect(v.improvements.some((i) => i.priority === 1 && i.text.includes('Ajoute le sujet'))).toBe(true)
})
test('alias accepté, avancement stocké sous la clé canonique', async () => {
  import_()
  const a = make()
  expect(await a.canonicalKey('B-PSU-100/psu100myls')).toBe('B-PSU-100/myls')
  const v = (await a.view('B-PSU-100/psu100myls'))!
  expect(v.subject!.fileName).toBe('s.pdf')
  expect(v.steps.length).toBeGreaterThan(3)
})
test('réimport → items disparus ignorés', async () => {
  import_()
  store.toggle('B-PSU-100/myls', 'setup#0', true)
  store.toggle('B-PSU-100/myls', 'option:-z#0', true)
  const v = (await make().view('B-PSU-100/myls'))!
  expect(v.done).toEqual(['setup#0'])
  const total = v.steps.flatMap((s) => s.items).length
  expect(v.status.progress).toBe(Math.round((1 / total) * 100))
})
test('summaries', async () => {
  import_()
  store.toggle('B-PSU-100/myls', 'setup#0', true)
  const s = await make().summaries()
  expect(Object.keys(s)).toEqual(['B-PSU-100/myls'])
  expect(s['B-PSU-100/myls'].hasSubject).toBe(true)
  expect(s['B-PSU-100/myls'].current!.title).toBe('Mise en place')
  expect(s['B-PSU-100/myls'].late).toBe(false)
  const none = await make({ projects: async () => [summary({ key: 'A/b', aliases: [] })] }).summaries()
  expect(none['A/b']).toEqual({ hasSubject: false, current: null, late: false, progress: 0 })
})
test('repo non lié ou sans token → piste P3', async () => {
  const hasP3 = (v: any) => v.improvements.some((i: any) => i.source === 'repo' && i.priority === 3)
  expect(hasP3(await make().view('B-PSU-100/myls'))).toBe(true)
  const linked = summary({ repo: { fullName: 'me/myls', name: 'myls', url: '', pushedAt: '2026-10-25T00:00:00Z', defaultBranch: 'main' } })
  expect(hasP3(await make({ projects: async () => [linked], hasGithubToken: () => false }).view(linked.key))).toBe(true)
})
test('repo lié : contrôle de la racine, cache 10 min, erreur → aucune piste repo', async () => {
  const linked = summary({ repo: { fullName: 'me/myls', name: 'myls', url: '', pushedAt: '2026-10-25T00:00:00Z', defaultBranch: 'main' } })
  const rootContents = vi.fn().mockResolvedValue([{ name: 'src', type: 'dir' }])
  let t = now
  const a = make({ projects: async () => [linked], rootContents, now: () => t })
  const repoTexts = async () => (await a.view(linked.key))!.improvements.filter((i) => i.source === 'repo').map((i) => i.text)
  expect((await repoTexts()).some((x) => x.includes('Makefile'))).toBe(true)
  await repoTexts()
  expect(rootContents).toHaveBeenCalledTimes(1)
  t = new Date(now.getTime() + 11 * 60_000)
  await repoTexts()
  expect(rootContents).toHaveBeenCalledTimes(2)

  const failing = make({ projects: async () => [linked], rootContents: async () => { throw new Error('HTTP 500') } })
  expect((await failing.view(linked.key))!.improvements.filter((i) => i.source === 'repo')).toEqual([])
})
test('piste moulinette depuis le dernier rapport', async () => {
  const report = { advice: [{ priority: 1, title: 'Corrige les fuites', text: '', tests: ['t1'] }] } as unknown as Report
  const latestReport = vi.fn().mockReturnValue(report)
  const v = (await make({ latestReport }).view('B-PSU-100/myls'))!
  expect(latestReport).toHaveBeenCalledWith('B-PSU-100/myls')
  expect(v.improvements.some((i) => i.source === 'moulinette' && i.text.includes('Corrige les fuites'))).toBe(true)
})
