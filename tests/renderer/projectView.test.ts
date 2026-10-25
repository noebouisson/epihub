import { expect, test } from 'vitest';
import { emptyProjects, projectPage, scoreLine } from '../../src/renderer/src/projectView';

test('liste vide : invitation à se connecter si My Epitech demande une connexion', () => {
  const login = { message: 'Connecte-toi à My Epitech pour voir tes projets', login: ['myepitech'] };
  expect(emptyProjects({ myepitech: 'needs-login' })).toEqual(login);
  expect(emptyProjects({ myepitech: 'ok' })).toEqual({ message: 'Aucun projet', login: [] });
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
  const cat = (count: number, passed: number) => ({ count, passed, crashed: 0, mandatoryFailed: 0 });
  expect(scoreLine({ categories: { a: cat(2, 1), b: cat(1, 1) } })).toBe('Dernier score : 67 %');
  expect(scoreLine({ categories: {} })).toBe('Dernier passage sans test');
  expect(scoreLine(null)).toBeNull();
});
