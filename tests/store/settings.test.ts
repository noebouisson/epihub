import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { createSettingsStore } from '../../src/main/store/settings';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'epihub-settings-'));
});

test('get renvoie les valeurs par défaut quand le fichier est absent', () => {
  const s = createSettingsStore(join(tmp, 'settings.json'));
  expect(s.get()).toEqual({ repoLinks: {}, notify: { github: true, intra: true, myepitech: true, teams: true }, theme: 'dark' });
});
test('update fusionne et persiste', () => {
  const p = join(tmp, 'settings.json');
  createSettingsStore(p).update({ repoLinks: { 'acti-1': 'me/repo' } });
  expect(createSettingsStore(p).get().repoLinks).toEqual({ 'acti-1': 'me/repo' });
});
test('un fichier corrompu redonne les valeurs par défaut', () => {
  const p = join(tmp, 'settings.json'); writeFileSync(p, '{oops');
  expect(createSettingsStore(p).get().theme).toBe('dark');
});
