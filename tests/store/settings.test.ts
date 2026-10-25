import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { createSettingsStore, sanitizeSettingsPatch } from '../../src/main/store/settings';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'epihub-settings-'));
});

test('get renvoie les valeurs par défaut quand le fichier est absent', () => {
  const s = createSettingsStore(join(tmp, 'settings.json'));
  expect(s.get()).toEqual({ repoLinks: {}, projectRepoLinks: {}, projectTeamsLinks: {}, notify: { github: true, intra: true, myepitech: true, teams: true }, theme: 'dark' });
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
test('nouveaux réglages par défaut', () => {
  const p = join(tmp, 'settings.json');
  expect(createSettingsStore(p).get()).toMatchObject({ projectRepoLinks: {}, projectTeamsLinks: {} });
});
test('un ancien fichier sans les nouveaux champs les reçoit', () => {
  const p = join(tmp, 'settings.json'); writeFileSync(p, JSON.stringify({ repoLinks: { a: 'me/r' } }));
  expect(createSettingsStore(p).get().projectTeamsLinks).toEqual({});
});
test('patch : liens Teams invalides et liens repo non chaîne retirés', () => {
  const ok = 'https://teams.microsoft.com/l/chat/x';
  const patch = { theme: 'light', projectTeamsLinks: { 'A/a': ok, 'A/b': 'https://evil.com/x', 'A/c': 42 }, projectRepoLinks: { 'A/a': 'octocat/a', 'A/b': 7, 'A/c': null } } as unknown;
  expect(sanitizeSettingsPatch(patch)).toEqual({ theme: 'light', projectTeamsLinks: { 'A/a': ok }, projectRepoLinks: { 'A/a': 'octocat/a' } });
});
test('patch : tables non objet ignorées, patch absent → {}', () => {
  expect(sanitizeSettingsPatch({ projectTeamsLinks: 'x', projectRepoLinks: ['a'] })).toEqual({});
  expect(sanitizeSettingsPatch(null)).toEqual({});
});
