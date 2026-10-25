import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createReportStore, validRunId } from '../../src/main/reports/store'
import type { ReportEntry } from '../../src/shared/types'
import { rep } from './helpers'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'epihub-store-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const entry = (runId: string, date: string, key = 'A/b'): ReportEntry => ({ runId, projectKey: key, projectId: 'p', file: null, score: 50, verdict: 'partiel', date, generatedAt: 1 })

test('save / has / get / report, relus par une nouvelle instance', () => {
  const s = createReportStore(dir)
  s.save(entry('1', '2026-10-01'), rep({ runId: '1' }))
  const again = createReportStore(dir)
  expect(again.has('1')).toBe(true)
  expect(again.get('1')?.runId).toBe('1')
  expect(again.report('1')?.runId).toBe('1')
  expect(again.report('2')).toBeNull()
})

test('list : par projet, date décroissante', () => {
  const s = createReportStore(dir)
  s.save(entry('1', '2026-10-01'), rep())
  s.save(entry('2', '2026-10-03'), rep())
  s.save(entry('3', '2026-10-02', 'X/y'), rep())
  expect(s.list('A/b').map((e) => e.runId)).toEqual(['2', '1'])
})

test('initialisation persistée', () => {
  const s = createReportStore(dir)
  expect(s.isInitialized()).toBe(false)
  s.markInitialized()
  expect(createReportStore(dir).isInitialized()).toBe(true)
})

test('index corrompu → vide', () => {
  writeFileSync(join(dir, 'reports.json'), '{x')
  expect(createReportStore(dir).list('a')).toEqual([])
})

test('runId non numérique refusé', () => {
  expect(validRunId('../1')).toBe(false)
  expect(validRunId('12')).toBe(true)
  expect(() => createReportStore(dir).save(entry('../1', '2026-10-01'), rep())).toThrow()
  expect(createReportStore(dir).report('../1')).toBeNull()
})

test('silent : persisté, retiré, et aucun .tmp laissé', () => {
  const s = createReportStore(dir)
  s.markSilent('5')
  expect(createReportStore(dir).isSilent('5')).toBe(true)
  s.clearSilent('5')
  expect(createReportStore(dir).isSilent('5')).toBe(false)
  expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
})
