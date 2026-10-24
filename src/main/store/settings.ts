import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Settings } from '../../shared/types';

const defaults = (): Settings => ({
  repoLinks: {},
  projectRepoLinks: {},
  projectTeamsLinks: {},
  notify: { github: true, intra: true, myepitech: true, teams: true },
  theme: 'dark'
});

function load(filePath: string): Settings {
  const base = defaults();
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<Settings>;
    return { ...base, ...raw, notify: { ...base.notify, ...raw.notify } };
  } catch {
    return base;
  }
}

export function createSettingsStore(filePath: string): { get(): Settings; update(patch: Partial<Settings>): Settings } {
  return {
    get: () => load(filePath),
    update(patch) {
      const next = { ...load(filePath), ...patch };
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(next, null, 2));
      return next;
    }
  };
}
