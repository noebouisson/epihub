import { expect, test } from 'vitest';
import type { Improvement } from '../../src/shared/types';
import { formatTarget, groupByPriority, PRIORITY_LABEL, showPlanCard, SOURCE_LABEL, targetLabel } from '../../src/renderer/src/planView';

test('formatTarget : JJ/MM, vide si absent ou invalide', () => {
  expect(formatTarget('2026-11-05')).toBe('05/11');
  expect(formatTarget(null)).toBe('');
  expect(formatTarget('n/a')).toBe('');
});

test('groupByPriority : groupes ordonnés, sans groupe vide, ordre conservé', () => {
  const imp = (priority: 1 | 2 | 3, text: string): Improvement => ({ source: 'repo', priority, text });
  const list = [imp(3, 'c'), imp(1, 'a'), imp(3, 'd'), imp(1, 'b')];
  expect(groupByPriority(list)).toEqual([[1, [list[1], list[3]]], [3, [list[0], list[2]]]]);
  expect(groupByPriority([])).toEqual([]);
});

test('libellés de priorité et de source', () => {
  expect(PRIORITY_LABEL[1]).toBe('Priorité haute');
  expect(PRIORITY_LABEL[2]).toBe('Priorité moyenne');
  expect(PRIORITY_LABEL[3]).toBe('Priorité basse');
  expect(SOURCE_LABEL).toEqual({ moulinette: 'Moulinette', repo: 'Repo', temps: 'Temps' });
});

test('targetLabel : « pour le JJ/MM »', () => {
  expect(targetLabel('2026-11-05')).toBe('pour le 05/11');
  expect(targetLabel(null)).toBe('');
});

test('showPlanCard : seulement pour un projet en cours', () => {
  expect(showPlanCard({ status: 'en-cours' })).toBe(true);
  expect(showPlanCard({ status: 'termine' })).toBe(false);
  expect(showPlanCard({ status: 'a-venir' } as never)).toBe(false);
});
