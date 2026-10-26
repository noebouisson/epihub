import type { Improvement, ProjectSummary } from '../../shared/types';

export const PRIORITY_LABEL: Record<1 | 2 | 3, string> = { 1: 'Priorité haute', 2: 'Priorité moyenne', 3: 'Priorité basse' };
export const SOURCE_LABEL: Record<Improvement['source'], string> = { moulinette: 'Moulinette', repo: 'Repo', temps: 'Temps' };

/** `2026-11-05` → `05/11` ; chaîne vide si la date est absente ou invalide. */
export function formatTarget(target: string | null): string {
  const m = target ? /^\d{4}-(\d{2})-(\d{2})$/.exec(target) : null;
  return m ? `${m[2]}/${m[1]}` : '';
}

/** Date cible d'une étape : « pour le JJ/MM » ; vide si absente. */
export function targetLabel(target: string | null): string {
  const d = formatTarget(target);
  return d ? `pour le ${d}` : '';
}

/** La carte « Marche à suivre » (et l'import du sujet) n'existe que pour un projet en cours. */
export const showPlanCard = (summary: Pick<ProjectSummary, 'status'>): boolean => summary.status === 'en-cours';

/** Pistes groupées par priorité (1, 2, 3), groupes vides omis, ordre d'origine conservé. */
export function groupByPriority(list: Improvement[]): [1 | 2 | 3, Improvement[]][] {
  return ([1, 2, 3] as const)
    .map((p) => [p, list.filter((i) => i.priority === p)] as [1 | 2 | 3, Improvement[]])
    .filter(([, items]) => items.length > 0);
}
