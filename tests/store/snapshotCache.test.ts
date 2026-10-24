import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createSnapshotCache, parseCache, toCache } from '../../src/main/store/snapshotCache';

const snap = {
  github: { status: { state: 'needs-login' as const }, data: null },
  intra: { status: { state: 'error' as const, message: 'x', updatedAt: 5 }, data: { login: 'n', promo: 1, credits: 2, gpa: '', deadlines: [], events: [], notifications: [] } },
  myepitech: { status: { state: 'loading' as const }, data: { results: [] } },
  teams: { status: { state: 'ok' as const, updatedAt: 9 }, data: { unread: 3 } }
};

test('toCache : seulement données datées, sans statut', () => {
  expect(toCache(snap)).toEqual({ intra: { data: snap.intra.data, updatedAt: 5 }, teams: { data: { unread: 3 }, updatedAt: 9 } });
});
test('parseCache ignore les entrées mal formées', () => {
  expect(parseCache({ teams: { data: { unread: 1 }, updatedAt: 'x' }, github: { data: null, updatedAt: 1 }, evil: { data: {}, updatedAt: 1 } })).toEqual({});
  expect(parseCache(null)).toEqual({});
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
