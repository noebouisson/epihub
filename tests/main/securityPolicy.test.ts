import { describe, expect, test } from 'vitest';
import { cleanUserAgent, isPermissionAllowed, isTrustedSender, SERVICE_PARTITIONS } from '../../src/main/securityPolicy';

describe('cleanUserAgent', () => {
  test('retire Electron et EpiHub', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) epihub/0.1.0 Chrome/130.0.6723.191 Electron/33.4.11 Safari/537.36';
    expect(cleanUserAgent(ua)).toBe('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.191 Safari/537.36');
  });
  test('casse EpiHub/x', () => expect(cleanUserAgent('A EpiHub/1.2 B')).toBe('A B'));
  test('UA déjà propre inchangé', () => expect(cleanUserAgent('Mozilla/5.0 Chrome/130 Safari/537.36')).toBe('Mozilla/5.0 Chrome/130 Safari/537.36'));
});

describe('permissions', () => {
  test.each(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen'])('Teams autorise %s', (p) => expect(isPermissionAllowed('persist:teams', p)).toBe(true));
  test.each(['geolocation', 'clipboard-read', 'midi', 'display-capture', 'openExternal'])('Teams refuse %s', (p) => expect(isPermissionAllowed('persist:teams', p)).toBe(false));
  test.each(SERVICE_PARTITIONS.filter((p) => p !== 'persist:teams'))('%s : copie et plein écran seulement', (part) => {
    expect(isPermissionAllowed(part, 'clipboard-sanitized-write')).toBe(true);
    expect(isPermissionAllowed(part, 'fullscreen')).toBe(true);
    expect(isPermissionAllowed(part, 'media')).toBe(false);
    expect(isPermissionAllowed(part, 'notifications')).toBe(false);
  });
});

test('expéditeur IPC', () => {
  expect(isTrustedSender(1, 1, true)).toBe(true);
  expect(isTrustedSender(2, 1, true)).toBe(false);
  expect(isTrustedSender(1, 1, false)).toBe(false);
  expect(isTrustedSender(1, undefined, true)).toBe(false);
});
