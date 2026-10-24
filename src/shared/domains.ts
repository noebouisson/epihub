import type { ServiceId } from './types';

export const SERVICE_HOMES: Record<ServiceId, string> = {
  github: 'https://github.com/',
  intra: 'https://intra.epitech.eu/',
  myepitech: 'https://my.epitech.eu/',
  teams: 'https://teams.microsoft.com/v2/'
};

/** Domaines autorisés dans les webviews (le domaine lui-même et ses sous-domaines). */
export const ALLOWED_DOMAINS: readonly string[] = [
  'github.com',
  'intra.epitech.eu',
  'my.epitech.eu',
  'epitest.eu',
  'teams.microsoft.com',
  'office.com',
  'microsoft.com',
  'microsoftonline.com',
  'live.com',
  'skype.com'
];

export function isAllowedUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return ALLOWED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Même origine que l'accueil d'un des quatre services. */
export function isServiceHomeOrigin(raw: string): boolean {
  try {
    const o = new URL(raw).origin;
    return Object.values(SERVICE_HOMES).some((h) => new URL(h).origin === o);
  } catch {
    return false;
  }
}
