import { expect, test } from 'vitest';
import { userRefreshArgs } from '../../src/renderer/src/refresh';

test('rafraîchissement utilisateur : force pour My Epitech et pour « tout »', () => {
  expect(userRefreshArgs('myepitech')).toEqual(['myepitech', { force: true }]);
  expect(userRefreshArgs()).toEqual([undefined, { force: true }]);
  expect(userRefreshArgs('github')).toEqual(['github', undefined]);
});
