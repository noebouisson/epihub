import { scoreOf, verdictOf } from '../../shared/score';
import { projectKey } from '../../shared/projects';
import type { MyEpitechData, ProjectSummary, ReportEntry, RunSummary, Verdict } from '../../shared/types';

const DAY = 86_400_000;

/** Les dates sans heure (`2026-10-01`) sont lues à l'heure locale, comme les autres. */
function parse(s: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`).getTime() : Date.parse(s);
}

const dayStart = (t: number): number => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Jours calendaires entre deux instants (heure d'été comprise). */
const daysBetween = (from: number, to: number): number => Math.round((dayStart(to) - dayStart(from)) / DAY);

/** Avancement temporel d'un projet : `ratio` dans [0, 1] et libellé (J-n, Aujourd'hui, Terminé, Commence dans n j). */
export function progressOf(start: string, end: string, now: Date): { ratio: number; label: string } {
  const s = parse(start);
  const e = parse(end);
  const n = now.getTime();
  if (Number.isNaN(e)) return { ratio: 0, label: '' };
  const toEnd = daysBetween(n, e);
  let label: string;
  if (!Number.isNaN(s) && daysBetween(n, s) > 0) label = `Commence dans ${daysBetween(n, s)} j`;
  else if (toEnd < 0) label = 'Terminé';
  else if (toEnd === 0) label = "Aujourd'hui";
  else label = `J-${toEnd}`;
  let ratio = 0;
  if (Number.isNaN(s) || e <= s) ratio = n >= e ? 1 : 0;
  else ratio = (n - s) / (e - s);
  return { ratio: Math.min(1, Math.max(0, ratio)), label };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

/** Le problème le plus important d'un passage, en une ligne. */
export function mainProblem(r: RunSummary): string {
  if (r.failureFlags.includes('no-test-passed')) return 'Aucun test ne passe';
  const cats = Object.values(r.categories);
  const sum = (f: (c: (typeof cats)[number]) => number): number => cats.reduce((n, c) => n + f(c), 0);
  const mandatory = sum((c) => c.mandatoryFailed);
  if (mandatory > 0) return `${plural(mandatory, 'test obligatoire', 'tests obligatoires')} ${mandatory > 1 ? 'échoués' : 'échoué'}`;
  const crashed = sum((c) => c.crashed);
  if (crashed > 0) return plural(crashed, 'crash', 'crashs');
  const failed = sum((c) => c.count - c.passed);
  if (failed > 0) return `${plural(failed, 'test', 'tests')} ${failed > 1 ? 'échoués' : 'échoué'}`;
  return 'Tous les tests passent';
}

const endOf = (p: ProjectSummary): number => (p.deadline ? Date.parse(p.deadline.end) : NaN);
const lastDate = (p: ProjectSummary): number => (p.lastResult ? Date.parse(p.lastResult.date) : 0) || 0;

/** En cours par échéance (sans échéance en dernier), puis terminés du passage le plus récent au plus ancien. */
export function sortProjects(projects: ProjectSummary[]): ProjectSummary[] {
  const running = projects.filter((p) => p.status === 'en-cours').sort((a, b) => (endOf(a) || Infinity) - (endOf(b) || Infinity));
  const done = projects.filter((p) => p.status !== 'en-cours').sort((a, b) => lastDate(b) - lastDate(a));
  return [...running, ...done];
}

/** Verdict du dernier passage : celui du rapport enregistré s'il existe (carte = rapport), sinon calculé sans détail. */
export function verdictFor(p: ProjectSummary, entries: Record<string, ReportEntry>): Verdict | null {
  const last = p.lastResult;
  if (!last) return null;
  const e = entries[p.key];
  return e && e.runId === last.id ? e.verdict : verdictOf(last, null);
}

/** `failing` : projets EN COURS dont le dernier passage est en échec. */
export function dashboardSummary(projects: ProjectSummary[], now: Date, entries: Record<string, ReportEntry> = {}): { inProgress: number; failing: number; average: number | null; next: ProjectSummary | null } {
  const running = projects.filter((p) => p.status === 'en-cours');
  const scores = projects.map((p) => (p.lastResult ? scoreOf(p.lastResult.categories) : null)).filter((s): s is number => s !== null);
  const upcoming = running.filter((p) => endOf(p) >= now.getTime()).sort((a, b) => endOf(a) - endOf(b));
  return {
    inProgress: running.length,
    failing: running.filter((p) => verdictFor(p, entries) === 'echoue').length,
    average: scores.length === 0 ? null : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    next: upcoming[0] ?? null
  };
}

/**
 * Derniers passages (un par projet, du plus récent au plus ancien) avec la clé canonique du projet
 * (`projectKey(unité, nom)`, via l'id du projet) ; repli sur le code du passage si le projet est inconnu.
 */
export function latestResults(data: MyEpitechData | null | undefined, limit: number): { run: RunSummary; key: string }[] {
  if (!data) return [];
  const byId = new Map(data.projects.map((p) => [p.id, p]));
  return Object.entries(data.runs)
    .map(([id, runs]) => {
      const run = runs[0];
      if (!run) return null;
      const p = byId.get(id);
      return { run, key: p ? projectKey(p.unitCode, p.name) : projectKey(run.unitCode, run.projectCode) };
    })
    .filter((x): x is { run: RunSummary; key: string } => x !== null)
    .sort((a, b) => Date.parse(b.run.date) - Date.parse(a.run.date))
    .slice(0, limit);
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Bandeau affiché au-dessus des cartes quand les données en cache sont montrées sans connexion. */
export function notConnectedBanner(updatedAt: number | undefined): string {
  if (updatedAt === undefined || Number.isNaN(updatedAt)) return 'Pas connecté à My Epitech';
  const d = new Date(updatedAt);
  return `Pas connecté à My Epitech — données de ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
