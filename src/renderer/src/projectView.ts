import type { ServiceId, ServiceState } from '../../shared/types';

/** Message de la liste Projets vide : invitation à se connecter si une source demande une connexion. */
export function emptyProjects(states: Partial<Record<'intra' | 'myepitech', ServiceState>>): { message: string; login: ServiceId[] } {
  if (states.intra === 'needs-login' || states.myepitech === 'needs-login') {
    return { message: "Connecte-toi à l'intranet et à My Epitech pour voir tes projets", login: ['intra', 'myepitech'] };
  }
  return { message: 'Aucun projet', login: [] };
}

/** État d'affichage de la page projet (un échec n'aboutit jamais à un chargement sans fin). */
export function projectPage({ summary, detail, failed }: { summary: unknown; detail: unknown; failed: boolean }): 'loading' | 'not-found' | 'failed' | 'ready' {
  if (detail) return 'ready';
  if (detail === null) return 'not-found';
  if (failed) return 'failed';
  return summary ? 'ready' : 'loading';
}

export function scoreLine(lastResult: { percent: number } | null): string | null {
  return lastResult ? `Dernier score : ${Math.round(lastResult.percent)} %` : null;
}
