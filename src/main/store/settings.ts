import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isTeamsUrl } from '../../shared/projects';
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

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Ne garde que les valeurs chaîne acceptées par `accept` ; `undefined` si la table n'est pas un objet. */
function cleanLinks(v: unknown, accept: (s: string) => boolean): Record<string, string> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === 'string' && accept(val)) out[k] = val;
  return out;
}

/** Patch venu du renderer : liens Teams non Teams et liens repo non chaîne retirés. */
export function sanitizeSettingsPatch(patch: unknown): Partial<Settings> {
  if (!isRecord(patch)) return {};
  const { projectTeamsLinks, projectRepoLinks, ...rest } = patch;
  const out: Partial<Settings> = { ...(rest as Partial<Settings>) };
  const teams = cleanLinks(projectTeamsLinks, isTeamsUrl);
  const repos = cleanLinks(projectRepoLinks, () => true);
  if (teams) out.projectTeamsLinks = teams;
  if (repos) out.projectRepoLinks = repos;
  return out;
}
