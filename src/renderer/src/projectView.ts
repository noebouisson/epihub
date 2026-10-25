import { scoreOf } from '../../shared/score';
import type { RunSummary, ServiceId, ServiceState } from '../../shared/types';

/** Message de la liste Projets vide : invitation à se connecter si une source demande une connexion. */
export function emptyProjects(states: Partial<Record<'myepitech', ServiceState>>): { message: string; login: ServiceId[] } {
  if (states.myepitech === 'needs-login') {
    return { message: 'Connecte-toi à My Epitech pour voir tes projets', login: ['myepitech'] };
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

export function scoreLine(lastResult: Pick<RunSummary, 'categories'> | null): string | null {
  if (!lastResult) return null;
  const score = scoreOf(lastResult.categories);
  return score === null ? 'Dernier passage sans test' : `Dernier score : ${score} %`;
}
