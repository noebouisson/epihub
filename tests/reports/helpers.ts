import type { Report, RunDetail, RunSummary, RunTest, SkillBreakdown } from '../../src/shared/types'

export const cat = (count: number, passed: number, extra: Partial<SkillBreakdown> = {}): SkillBreakdown => ({
  count, passed, crashed: 0, mandatoryFailed: 0, ...extra
})

export const sum = (o: Partial<RunSummary> = {}): RunSummary => ({
  id: '42', unitCode: 'G-CPE-101', projectCode: 'myprintf', title: 'My Printf', year: 2026,
  date: '2026-10-20T08:05:00', commit: 'abc1234', members: ['jane.doe@epitech.eu'], failureFlags: [],
  style: { fatal: 0, major: 0, minor: 0, info: 0, penalty: null },
  coverage: { lines: null, branches: null },
  categories: { a: cat(10, 10) }, repoLink: null, ...o
})

export const det = (o: Partial<RunDetail> = {}): RunDetail => ({
  categories: [], deliveryError: null, makeError: null, bannedFunctions: [],
  coverage: { lines: null, branches: null }, ...o
})

export const test_ = (name: string, o: Partial<RunTest> = {}): RunTest => ({
  name, passed: false, crashed: false, skipped: false, mandatory: false, comment: '', ...o
})

export const ft = (o: Partial<Report['failedTests'][number]> = {}): Report['failedTests'][number] => ({
  category: 'base', name: 't1', mandatory: false, crashed: false, comment: 'boom', ...o
})

export const rep = (o: Partial<Report> = {}): Report => ({
  runId: '42', projectTitle: 'My Printf', unitCode: 'G-CPE-101', projectCode: 'myprintf',
  date: '2026-10-20T08:05:00', commit: 'abc1234', members: ['jane.doe@epitech.eu'],
  score: 62, verdict: 'partiel', delta: null, summary: '18 tests sur 29 passent.',
  blockers: [], categories: [], failedTests: [],
  style: { fatal: 0, major: 0, minor: 0, info: 0, penalty: null },
  coverage: { lines: null, branches: null }, advice: [], evolution: null, working: [], ...o
})

export const full: Report = rep({
  delta: 12,
  blockers: ['Erreur de compilation : make: *** Error 1'],
  categories: [{ name: 'a', passed: 3, count: 5, crashed: 1, mandatoryFailed: 1 }],
  failedTests: [ft({ mandatory: true, crashed: true, comment: 'segfault' })],
  advice: [{ priority: 1, title: 'Crashs', text: 'Lance valgrind.', tests: ['t1'] }],
  evolution: { fixed: ['t0'], broken: ['t9'], byCategory: false },
  working: ['b']
})
