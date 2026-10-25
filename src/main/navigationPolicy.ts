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

const AUTH_POPUP_HOSTS = new Set(['login.microsoftonline.com', 'login.live.com', 'login.microsoft.com']);

/** Fenêtre de connexion légitime (OAuth Microsoft ou GitHub). */
export function isAuthPopupUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (AUTH_POPUP_HOSTS.has(host)) return true;
  return host === 'github.com' && /^\/(login|session)(\/|$)/.test(u.pathname);
}

/**
 * window.open / target=_blank depuis un invité : 'popup' = nouvelle fenêtre (connexion uniquement),
 * 'same-view' = chargé dans la même webview, 'external' = navigateur système.
 */
export function popupPolicy(url: string): 'popup' | 'same-view' | 'external' {
  if (isAuthPopupUrl(url)) return 'popup';
  return isAllowedUrl(url) ? 'same-view' : 'external';
}

/**
 * Navigation (will-navigate / will-redirect) d'un invité : les sous-cadres (iframes) sont laissés
 * passer sans bruit ; seul le cadre principal est limité aux domaines des services.
 * `hidden` : fenêtre invisible d'EpiHub → hors liste bloqué en silence ('block').
 */
export function guestNavigation(url: string, isMainFrame: boolean, hidden = false): 'allow' | 'external' | 'block' {
  if (!isMainFrame) return 'allow';
  if (isAllowedUrl(url)) return 'allow';
  // Fenêtre cachée (renouvellement du jeton) : rien ne doit s'ouvrir dans le navigateur de l'utilisateur.
  return hidden ? 'block' : 'external';
}

export function isPaletteShortcut(input: { type: string; control?: boolean; meta?: boolean; key: string }): boolean {
  return input.type === 'keyDown' && !!(input.control || input.meta) && input.key.toLowerCase() === 'k';
}
