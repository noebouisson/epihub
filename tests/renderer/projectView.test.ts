import { expect, test } from 'vitest';
import { emptyProjects, projectPage, scoreLine } from '../../src/renderer/src/projectView';

test('liste vide : invitation à se connecter si intranet ou My Epitech demande une connexion', () => {
  const login = { message: "Connecte-toi à l'intranet et à My Epitech pour voir tes projets", login: ['intra', 'myepitech'] };
  expect(emptyProjects({ intra: 'needs-login', myepitech: 'ok' })).toEqual(login);
  expect(emptyProjects({ intra: 'ok', myepitech: 'needs-login' })).toEqual(login);
  expect(emptyProjects({ intra: 'ok', myepitech: 'ok' })).toEqual({ message: 'Aucun projet', login: [] });
  expect(emptyProjects({})).toEqual({ message: 'Aucun projet', login: [] });
});

test('page projet : échec avec résumé connu → erreur avec réessai, jamais un chargement infini', () => {
  const s = { key: 'k' };
  expect(projectPage({ summary: s, detail: undefined, failed: true })).toBe('failed');
  expect(projectPage({ summary: null, detail: undefined, failed: true })).toBe('failed');
  expect(projectPage({ summary: null, detail: null, failed: false })).toBe('not-found');
  expect(projectPage({ summary: null, detail: undefined, failed: false })).toBe('loading');
  expect(projectPage({ summary: s, detail: undefined, failed: false })).toBe('ready');
  expect(projectPage({ summary: s, detail: { summary: s }, failed: true })).toBe('ready');
  expect(projectPage({ summary: s, detail: null, failed: false })).toBe('not-found');
});

test('score du dernier passage', () => {
  expect(scoreLine({ percent: 66.6 })).toBe('Dernier score : 67 %');
  expect(scoreLine(null)).toBeNull();
});
