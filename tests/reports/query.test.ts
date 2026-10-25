import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { reportsForKey } from '../../src/main/reports/query'
import { createReportStore } from '../../src/main/reports/store'
import type { ReportEntry } from '../../src/shared/types'
import { rep } from './helpers'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'epihub-query-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const entry = (runId: string, projectKey: string): ReportEntry => ({ runId, projectKey, projectId: 'p1', file: null, score: 50, verdict: 'partiel', date: '2026-10-20T08:05:00', generatedAt: 1 })
const projects = [{ key: 'G-CPE-101/myprintf', aliases: ['G-CPE-101/myprintf', 'G-CPE-101/cpemyprintf'] }]

test('reportsForKey : un alias est résolu vers la clé canonique', () => {
  const store = createReportStore(dir)
  store.save(entry('1', 'G-CPE-101/myprintf'), rep({ runId: '1' }))
  expect(reportsForKey(store, projects, 'G-CPE-101/cpemyprintf').map((e) => e.runId)).toEqual(['1'])
  expect(reportsForKey(store, projects, 'G-CPE-101/myprintf').map((e) => e.runId)).toEqual(['1'])
  expect(reportsForKey(store, projects, 'X/inconnu')).toEqual([])
})
