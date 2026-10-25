import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createSnapshotCache, parseCache, toCache } from '../../src/main/store/snapshotCache';

const snap = {
  github: { status: { state: 'needs-login' as const }, data: null },
  intra: { status: { state: 'ok' as const, updatedAt: 4 }, data: null },
  myepitech: { status: { state: 'error' as const, message: 'x', updatedAt: 5 }, data: { profile: { login: 'jane.doe@epitech.eu', name: 'Jane Doe', promotion: 2030, semester: 1, gpa: null, cursus: null }, projects: [], runs: {} } },
  teams: { status: { state: 'ok' as const, updatedAt: 9 }, data: { unread: 3 } }
};

test('toCache : seulement données datées, sans statut', () => {
  expect(toCache(snap)).toEqual({ myepitech: { data: snap.myepitech.data, updatedAt: 5 }, teams: { data: { unread: 3 }, updatedAt: 9 } });
});
test('parseCache ignore les entrées mal formées', () => {
  expect(parseCache({ teams: { data: { unread: 1 }, updatedAt: 'x' }, github: { data: null, updatedAt: 1 }, evil: { data: {}, updatedAt: 1 } })).toEqual({});
  expect(parseCache(null)).toEqual({});
});
test('parseCache ignore les anciens formats intranet et My Epitech', () => {
  const old = { intra: { data: { login: 'n', deadlines: [] }, updatedAt: 1 }, myepitech: { data: { results: [] }, updatedAt: 1 }, teams: { data: { unread: 1 }, updatedAt: 2 } };
  expect(parseCache(old)).toEqual({ teams: { data: { unread: 1 }, updatedAt: 2 } });
  expect(parseCache({ myepitech: { data: snap.myepitech.data, updatedAt: 5 } })).toEqual({ myepitech: { data: snap.myepitech.data, updatedAt: 5 } });
});
test('aller-retour fichier et fichier corrompu', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'epihub-cache-')), 'cache.json');
  const c = createSnapshotCache(p);
  expect(c.load()).toEqual({});
  c.save(snap);
  expect(c.load()).toEqual(toCache(snap));
  expect(readFileSync(p, 'utf8')).not.toMatch(/token|cookie/i);
  writeFileSync(p, '{oops');
  expect(c.load()).toEqual({});
});
