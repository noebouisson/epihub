import type { ServiceId } from '../../shared/types';

/**
 * Rafraîchissement demandé par l'utilisateur (Réessayer, Rafraîchir, connexion dans l'onglet) :
 * My Epitech (seul ou dans « tout ») ignore alors sa pause de reconnexion.
 * Usage : `window.epihub.refresh(...userRefreshArgs(id))`.
 */
export function userRefreshArgs(id?: ServiceId): [ServiceId | undefined, { force: true } | undefined] {
  return [id, id === undefined || id === 'myepitech' ? { force: true } : undefined];
}
