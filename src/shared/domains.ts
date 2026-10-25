import type { ServiceId } from './types';

export const SERVICE_HOMES: Record<ServiceId, string> = {
  github: 'https://github.com/',
  intra: 'https://intra.epitech.eu/',
  myepitech: 'https://my.epitech.eu/',
  // Redirige vers https://teams.cloud.microsoft/ (nouveau domaine de Teams web).
  teams: 'https://teams.microsoft.com/v2/'
};

/** Origines « à soi » de chaque service (accueil + domaines équivalents). */
export const SERVICE_ORIGINS: Record<ServiceId, readonly string[]> = {
  github: ['https://github.com'],
  intra: ['https://intra.epitech.eu'],
  myepitech: ['https://my.epitech.eu'],
  teams: ['https://teams.microsoft.com', 'https://teams.cloud.microsoft']
};

/** Domaines autorisés dans les webviews (le domaine lui-même et ses sous-domaines). */
export const ALLOWED_DOMAINS: readonly string[] = [
  'github.com',
  'intra.epitech.eu',
  'my.epitech.eu',
  'teams.microsoft.com',
  'cloud.microsoft',
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

const originOf = (raw: string): string | null => {
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
};

/** L'URL est sur une origine propre au service donné. */
export function isServiceOwnOrigin(service: ServiceId, raw: string): boolean {
  const o = originOf(raw);
  return o !== null && SERVICE_ORIGINS[service].includes(o);
}

/** Même origine que l'accueil d'un des quatre services. */
export function isServiceHomeOrigin(raw: string): boolean {
  return (Object.keys(SERVICE_ORIGINS) as ServiceId[]).some((s) => isServiceOwnOrigin(s, raw));
}

/**
 * Après une connexion dans l'onglet : la page est revenue sur l'origine du service alors que
 * l'accueil affiche encore « connexion requise » → on relance le rafraîchissement.
 */
export function shouldRefreshAfterLogin(service: ServiceId, url: string, state: string | undefined): boolean {
  return state === 'needs-login' && isServiceOwnOrigin(service, url);
}
