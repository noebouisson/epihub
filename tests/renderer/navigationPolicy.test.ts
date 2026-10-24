import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { classifyPreload, isPaletteShortcut, popupDecision } from '../../src/main/navigationPolicy';

describe('classifyPreload', () => {
  test.each(['/opt/epi hub/out/preload/teams-webview.js', '/opt/a#b/out/teams-webview.js', '/opt/100%/out/teams-webview.js', '/opt/a?b/teams-webview.js'])('accepte chemin et URL pour %s', (p) => {
    expect(classifyPreload([p], p)).toBe('teams');
    expect(classifyPreload([pathToFileURL(p).href], p)).toBe('teams');
    expect(classifyPreload([pathToFileURL(p).href, p, undefined], p)).toBe('teams');
  });
  test('aucun preload', () => expect(classifyPreload([undefined, ''], '/x/t.js')).toBe('none'));
  test('autre fichier refusé', () => {
    expect(classifyPreload(['/x/evil.js'], '/x/t.js')).toBe('reject');
    expect(classifyPreload([pathToFileURL('/x/evil.js').href], '/x/t.js')).toBe('reject');
    expect(classifyPreload(['/x/t.js', '/x/evil.js'], '/x/t.js')).toBe('reject');
    expect(classifyPreload(['file://%zz'], '/x/t.js')).toBe('reject');
  });
});
test('popups', () => {
  expect(popupDecision('https://login.microsoftonline.com/x')).toBe('allow');
  expect(popupDecision('https://evil.com/')).toBe('deny');
  expect(popupDecision('http://github.com/')).toBe('deny');
});
test('raccourci palette', () => {
  expect(isPaletteShortcut({ type: 'keyDown', control: true, key: 'k' })).toBe(true);
  expect(isPaletteShortcut({ type: 'keyDown', meta: true, key: 'K' })).toBe(true);
  expect(isPaletteShortcut({ type: 'keyUp', control: true, key: 'k' })).toBe(false);
  expect(isPaletteShortcut({ type: 'keyDown', key: 'k' })).toBe(false);
});
