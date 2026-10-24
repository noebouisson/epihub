import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ServiceDataMap, ServiceId, ServiceSnapshot } from '../../shared/types';

const IDS: ServiceId[] = ['github', 'intra', 'myepitech', 'teams'];

/** Contenu de cache.json : seulement les données et leur date (jamais de token ni de cookie). */
export type SnapshotCache = Partial<{ [K in ServiceId]: { data: ServiceDataMap[K]; updatedAt: number } }>;

/** Ne garde que les services ayant des données datées. */
export function toCache(snap: { [K in ServiceId]: ServiceSnapshot<K> }): SnapshotCache {
  const out: Record<string, { data: unknown; updatedAt: number }> = {};
  for (const id of IDS) {
    const s = snap[id];
    if (s.data != null && typeof s.status.updatedAt === 'number') out[id] = { data: s.data, updatedAt: s.status.updatedAt };
  }
  return out as SnapshotCache;
}

/** Relit un cache (contenu non fiable) : entrées mal formées ignorées. */
export function parseCache(raw: unknown): SnapshotCache {
  const out: Record<string, { data: unknown; updatedAt: number }> = {};
  if (!raw || typeof raw !== 'object') return {};
  for (const id of IDS) {
    const e = (raw as Record<string, unknown>)[id] as { data?: unknown; updatedAt?: unknown } | undefined;
    if (e && typeof e === 'object' && e.data && typeof e.data === 'object' && typeof e.updatedAt === 'number') out[id] = { data: e.data, updatedAt: e.updatedAt };
  }
  return out as SnapshotCache;
}

export function createSnapshotCache(filePath: string): { load(): SnapshotCache; save(snap: { [K in ServiceId]: ServiceSnapshot<K> }): void } {
  return {
    load() {
      try {
        return parseCache(JSON.parse(readFileSync(filePath, 'utf8')));
      } catch {
        return {};
      }
    },
    save(snap) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(toCache(snap)), { mode: 0o600 });
    }
  };
}
