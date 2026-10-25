import { describe, expect, test } from 'vitest';
import { isAllowedUrl, isServiceHomeOrigin, isServiceOwnOrigin, SERVICE_HOMES, shouldRefreshAfterLogin } from '../../src/shared/domains';

describe('isAllowedUrl', () => {
  test.each(['https://github.com/x', 'https://gist.github.com/', 'https://intra.epitech.eu/', 'https://login.microsoftonline.com/a', 'https://teams.microsoft.com/v2/', 'https://teams.cloud.microsoft/', 'https://x.cloud.microsoft/a'])('autorise %s', (u) => expect(isAllowedUrl(u)).toBe(true));
  test.each(['https://evil.com/', 'https://github.com.evil.com/', 'http://github.com/', 'https://notgithub.com/', 'https://evilcloud.microsoft.com.evil/', 'https://notcloud.microsoft.evil/', 'javascript:alert(1)', 'nope', 'https://epitest.eu/', 'https://api.epitest.eu/x'])('refuse %s', (u) => expect(isAllowedUrl(u)).toBe(false));
});
test('origines d’accueil', () => {
  expect(isServiceHomeOrigin('https://github.com/')).toBe(true);
  expect(isServiceHomeOrigin('https://github.com.evil/')).toBe(false);
  expect(isServiceHomeOrigin('https://login.microsoftonline.com/')).toBe(false);
  expect(isServiceHomeOrigin('https://teams.microsoft.com/v2/')).toBe(true);
  expect(isServiceHomeOrigin('https://teams.cloud.microsoft/')).toBe(true);
  expect(isServiceHomeOrigin('https://evil.cloud.microsoft/')).toBe(false);
});
test("l'accueil Teams reste teams.microsoft.com/v2/", () => expect(SERVICE_HOMES.teams).toBe('https://teams.microsoft.com/v2/'));
test('origine propre à un service', () => {
  expect(isServiceOwnOrigin('teams', 'https://teams.cloud.microsoft/?x')).toBe(true);
  expect(isServiceOwnOrigin('github', 'https://teams.cloud.microsoft/')).toBe(false);
  expect(isServiceOwnOrigin('intra', 'nope')).toBe(false);
});
test('rafraîchir après connexion', () => {
  expect(shouldRefreshAfterLogin('intra', 'https://intra.epitech.eu/', 'needs-login')).toBe(true);
  expect(shouldRefreshAfterLogin('intra', 'https://intra.epitech.eu/', 'ok')).toBe(false);
  expect(shouldRefreshAfterLogin('teams', 'https://login.microsoftonline.com/x', 'needs-login')).toBe(false);
});
