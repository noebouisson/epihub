import { expect, test } from 'vitest';
import { dashboardSummary, mainProblem, progressOf, sortProjects } from '../../src/renderer/src/dashboard';
import type { DeadlineView, ProjectSummary, RunSummary, SkillBreakdown } from '../../src/shared/types';

const now = new Date('2026-10-16T12:00:00');

const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  id: '1', unitCode: 'B-CPE-100', projectCode: 'cpe-100', title: 'Demo', year: 2026, date: '2026-10-15T10:00:00Z', commit: 'abc',
  members: ['jane.doe@epitech.eu'], failureFlags: [], style: { fatal: 0, major: 0, minor: 0, info: 0, penalty: null },
  coverage: { lines: null, branches: null }, categories: {}, repoLink: null, ...over
});
const cat = (count: number, passed: number, crashed = 0, mandatoryFailed = 0): SkillBreakdown => ({ count, passed, crashed, mandatoryFailed });
const project = (key: string, status: ProjectSummary['status'], end: string | null, last: RunSummary | null): ProjectSummary => ({
  key, aliases: [key], projectId: key, title: key, moduleCode: 'B-CPE-100',
  deadline: end ? ({ end } as DeadlineView) : null, lastResult: last, repo: null, teamsUrl: null, status
});

const okRun = run({ categories: { a: cat(5, 5) } });
const badRun = run({ categories: { a: cat(10, 2) } });
const enCoursOk = project('a', 'en-cours', '2026-10-20T12:00:00', okRun);
const enCoursEchoue = project('b', 'en-cours', '2026-10-18T12:00:00', badRun);
const termine = project('c', 'termine', '2026-10-01T12:00:00', okRun);

test('progression et libellés', () => {
  expect(progressOf('2026-10-01', '2026-10-31', now)).toMatchObject({ label: 'J-15' });
  expect(progressOf('2026-10-01', '2026-10-10', now).label).toBe('Terminé');
  expect(progressOf('2026-11-01', '2026-11-30', now).label).toBe('Commence dans 16 j');
  expect(progressOf('2026-10-01', '2026-10-16T18:00:00', now).label).toBe("Aujourd'hui");
});

test('ratio borné', () => {
  expect(progressOf('2026-10-01', '2026-10-10', now).ratio).toBe(1);
  expect(progressOf('2026-11-01', '2026-11-30', now).ratio).toBe(0);
  const mid = progressOf('2026-10-01', '2026-10-31', now).ratio;
  expect(mid).toBeGreaterThan(0.4);
  expect(mid).toBeLessThan(0.6);
});

test('dates invalides : pas de NaN', () => {
  const p = progressOf('x', 'y', now);
  expect(Number.isFinite(p.ratio)).toBe(true);
});

test('problème principal par priorité', () => {
  expect(mainProblem(run({ failureFlags: ['no-test-passed'], categories: { a: cat(5, 0, 1, 2) } }))).toBe('Aucun test ne passe');
  expect(mainProblem(run({ categories: { a: cat(5, 3, 1, 2) } }))).toBe('2 tests obligatoires échoués');
  expect(mainProblem(run({ categories: { a: cat(5, 3, 1, 1) } }))).toBe('1 test obligatoire échoué');
  expect(mainProblem(run({ categories: { a: cat(5, 3, 1, 0) } }))).toBe('1 crash');
  expect(mainProblem(run({ categories: { a: cat(5, 3, 2, 0) } }))).toBe('2 crashs');
  expect(mainProblem(run({ categories: { a: cat(5, 3, 0, 0) } }))).toBe('2 tests échoués');
  expect(mainProblem(run({ categories: { a: cat(5, 4, 0, 0) } }))).toBe('1 test échoué');
  expect(mainProblem(run({ categories: { a: cat(5, 5) } }))).toBe('Tous les tests passent');
});

test('bandeau', () => {
  const s = dashboardSummary([enCoursOk, enCoursEchoue, termine], now);
  expect(s).toMatchObject({ inProgress: 2, failing: 1, average: 73 });
  expect(s.next?.key).toBe('b');
});

test('bandeau sans passage ni échéance', () => {
  expect(dashboardSummary([project('z', 'en-cours', null, null)], now)).toEqual({ inProgress: 1, failing: 0, average: null, next: null });
});

test('tri : en cours par échéance, puis terminés par dernier passage', () => {
  const old = project('old', 'termine', null, run({ date: '2026-09-01T00:00:00Z', categories: { a: cat(1, 1) } }));
  const recent = project('recent', 'termine', null, run({ date: '2026-10-10T00:00:00Z', categories: { a: cat(1, 1) } }));
  const noEnd = project('noend', 'en-cours', null, null);
  expect(sortProjects([old, noEnd, enCoursOk, recent, enCoursEchoue]).map((p) => p.key)).toEqual(['b', 'a', 'noend', 'recent', 'old']);
});
