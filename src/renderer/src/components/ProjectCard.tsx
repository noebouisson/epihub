import { scoreOf } from '../../../shared/score';
import type { PlanSummary, ProjectSummary, RunSummary, Verdict } from '../../../shared/types';
import { mainProblem, progressOf } from '../dashboard';
import { formatTarget } from '../planView';
import { VERDICT_BADGE, VERDICT_LABEL } from './ReportView';

interface Props {
  project: ProjectSummary;
  /** Début du projet (My Epitech), pour la barre d'avancement. */
  start: string | null;
  /** Passage précédent, pour la flèche Δ. */
  previous: RunSummary | null;
  /** Verdict du dernier passage (celui du rapport s'il existe, voir `verdictFor`). */
  verdict: Verdict | null;
  now: Date;
  /** Marche à suivre (projets en cours) ; null tant qu'elle n'est pas chargée. */
  plan?: PlanSummary | null;
  /** `anchor` : `rapport` (carte Moulinette) seulement s'il existe un passage. */
  onOpen(key: string, anchor?: string): void;
}

export function ProjectCard({ project: p, start, previous, verdict, now, plan, onOpen }: Props): JSX.Element {
  const last = p.lastResult;
  const score = last ? scoreOf(last.categories) : null;
  const prevScore = previous ? scoreOf(previous.categories) : null;
  const delta = score !== null && prevScore !== null ? score - prevScore : null;
  const progress = p.deadline ? progressOf(start ?? p.deadline.end, p.deadline.end, now) : null;
  return (
    <section className="card project-card">
      <header className="card-head">
        <h2>{p.title}</h2>
        <span className="tag">{p.moduleCode}</span>
      </header>
      {progress && (
        <div className="progress-row">
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.ratio * 100)}>
            <div className="progress-bar" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
          </div>
          <span className="small">{progress.label}</span>
        </div>
      )}
      {p.deadline && plan && (
        <p className="small plan-line">
          {plan.hasSubject ? (
            <span>{plan.current ? `Étape : ${plan.current.title}${plan.current.target ? ` · ${formatTarget(plan.current.target)}` : ''}` : 'Marche à suivre terminée'}</span>
          ) : (
            <span className="dim">Ajoute le sujet</span>
          )}
          {plan.late && <span className="badge badge-danger">En retard</span>}
        </p>
      )}
      <p className="project-score">
        <strong className="big">{score === null ? '—' : `${score} %`}</strong>
        {verdict ? <span className={`badge ${VERDICT_BADGE[verdict]}`}>{VERDICT_LABEL[verdict]}</span> : <span className="badge badge-dim">Pas encore testé</span>}
        {delta !== null && delta !== 0 && <span className={delta > 0 ? 'ok' : 'bad'}>{delta > 0 ? `▲ +${delta}` : `▼ ${delta}`}</span>}
      </p>
      {last && (
        <>
          <p className="small">{mainProblem(last)}</p>
          <p className="dim small">F {last.style.fatal} · M {last.style.major}</p>
        </>
      )}
      <div className="form-row">
        {last ? (
          <button type="button" className="btn btn-small" onClick={() => onOpen(p.key, 'rapport')}>Voir le rapport</button>
        ) : (
          <button type="button" className="btn btn-small" onClick={() => onOpen(p.key)}>Voir le projet</button>
        )}
      </div>
    </section>
  );
}
