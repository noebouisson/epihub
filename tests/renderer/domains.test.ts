import { describe, expect, test } from 'vitest';
import { isAllowedUrl, isServiceHomeOrigin } from '../../src/shared/domains';

describe('isAllowedUrl', () => {
  test.each(['https://github.com/x', 'https://gist.github.com/', 'https://intra.epitech.eu/', 'https://login.microsoftonline.com/a', 'https://teams.microsoft.com/v2/'])('autorise %s', (u) => expect(isAllowedUrl(u)).toBe(true));
  test.each(['https://evil.com/', 'https://github.com.evil.com/', 'http://github.com/', 'https://notgithub.com/', 'javascript:alert(1)', 'nope'])('refuse %s', (u) => expect(isAllowedUrl(u)).toBe(false));
});
test('origines d’accueil', () => {
  expect(isServiceHomeOrigin('https://github.com/')).toBe(true);
  expect(isServiceHomeOrigin('https://github.com.evil/')).toBe(false);
  expect(isServiceHomeOrigin('https://login.microsoftonline.com/')).toBe(false);
});
