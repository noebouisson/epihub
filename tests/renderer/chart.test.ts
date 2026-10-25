import { describe, expect, test } from 'vitest';
import { scorePoints } from '../../src/renderer/src/chart';
import type { TestRun } from '../../src/shared/types';

const run = (percent: number): TestRun => ({ id: String(percent), date: '2026-10-24T12:00:00Z', percent });

describe('scorePoints', () => {
  test('un seul passage centré', () => expect(scorePoints([run(50)], 200, 100)[0]).toMatchObject({ x: 100, y: 50 }));
  test('0 % en bas, 100 % en haut', () => {
    const p = scorePoints([run(0), run(100)], 200, 100);
    expect(p[0].y).toBe(100);
    expect(p[1].y).toBe(0);
  });
  test('valeurs hors bornes ramenées', () => expect(scorePoints([run(140)], 200, 100)[0].y).toBe(0));
  test('aucun passage → []', () => expect(scorePoints([], 200, 100)).toEqual([]));
  test('x réparti uniformément', () => expect(scorePoints([run(1), run(2), run(3)], 200, 100).map((p) => p.x)).toEqual([0, 100, 200]));
});
