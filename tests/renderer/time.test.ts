import { describe, expect, test } from 'vitest';
import { relativeTime } from '../../src/renderer/src/time';

const now = new Date('2026-10-24T12:00:00Z');

describe('relativeTime', () => {
  test('futur en heures', () => expect(relativeTime('2026-10-24T15:00:00Z', now)).toBe('dans 3 h'));
  test('futur en jours', () => expect(relativeTime('2026-10-26T12:00:00Z', now)).toBe('dans 2 j'));
  test('passé en minutes', () => expect(relativeTime('2026-10-24T11:55:00Z', now)).toBe('il y a 5 min'));
  test('passé en jours', () => expect(relativeTime('2026-10-23T12:00:00Z', now)).toBe('il y a 1 j'));
  test('passé en heures', () => expect(relativeTime('2026-10-24T09:00:00Z', now)).toBe('il y a 3 h'));
  test('futur en minutes', () => expect(relativeTime('2026-10-24T12:30:00Z', now)).toBe('dans 30 min'));
  test("à l'instant", () => expect(relativeTime('2026-10-24T11:59:40Z', now)).toBe("à l'instant"));
  test("à l'instant (futur proche)", () => expect(relativeTime('2026-10-24T12:00:30Z', now)).toBe("à l'instant"));
  test('date invalide', () => expect(relativeTime('nope', now)).toBe(''));
});
