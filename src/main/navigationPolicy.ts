import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAllowedUrl } from '../shared/domains';

/** Chemin absolu canonique d'un preload donné (chemin ou URL file:), ou null si illisible. */
export function preloadToPath(given: string): string | null {
  try {
    return given.startsWith('file:') ? resolve(fileURLToPath(given)) : resolve(given);
  } catch {
    return null;
  }
}

/** 'none' = pas de preload, 'teams' = exactement le preload Teams, 'reject' = tout le reste. */
export function classifyPreload(candidates: (string | undefined)[], teamsPreloadPath: string): 'none' | 'teams' | 'reject' {
  const given = candidates.filter((c): c is string => typeof c === 'string' && c !== '');
  if (given.length === 0) return 'none';
  const expected = resolve(teamsPreloadPath);
  return given.every((g) => preloadToPath(g) === expected) ? 'teams' : 'reject';
}

/** Une fenêtre ouverte depuis un invité : autorisée seulement vers les domaines des services. */
export function popupDecision(url: string): 'allow' | 'deny' {
  return isAllowedUrl(url) ? 'allow' : 'deny';
}

export function isPaletteShortcut(input: { type: string; control?: boolean; meta?: boolean; key: string }): boolean {
  return input.type === 'keyDown' && !!(input.control || input.meta) && input.key.toLowerCase() === 'k';
}
