import { useEffect, useMemo, useState } from 'react';
import type { ProjectSummary, ReportEntry } from '../../../shared/types';
import type { OpenFn, Snapshot } from '../App';
import { ProjectCard } from '../components/ProjectCard';
import { dashboardSummary, notConnectedBanner, sortProjects, verdictFor } from '../dashboard';
import { userRefreshArgs } from '../refresh';

interface Props {
  snapshot: Snapshot | null;
  open: OpenFn;
  openProject(key: string, anchor?: string): void;
}

export function Dashboard({ snapshot, open, openProject }: Props): JSX.Element {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [entries, setEntries] = useState<Record<string, ReportEntry>>({});

  useEffect(() => {
    let live = true;
    const loadEntries = (): void => void window.epihub.latestReports().then((e) => live && setEntries(e)).catch(() => undefined);
    const load = (): void => {
      void window.epihub.projects().then((l) => live && setProjects(l)).catch(() => live && setProjects((c) => c ?? []));
      loadEntries();
    };
    load();
    const off = window.epihub.onChanged(load);
    // Un rapport vient d'être enregistré : la carte reprend son verdict.
    const offReports = window.epihub.onReportsChanged(loadEntries);
    return () => {
      live = false;
      off();
      offReports();
    };
  }, []);

  const mye = snapshot?.myepitech;
  const now = new Date();
  const sorted = useMemo(() => sortProjects(projects ?? []), [projects]);
  const summary = dashboardSummary(projects ?? [], now, entries);
  const state = mye?.status.state;
  const retry = (): void => void window.epihub.refresh(...userRefreshArgs('myepitech')).catch(() => undefined);

  let body: JSX.Element;
  if (state === 'error' && !mye?.data) {
    body = (
      <div className="stack-sm">
        <p className="bad">{mye?.status.message ? `Impossible de charger My Epitech : ${mye.status.message}` : 'Impossible de charger My Epitech'}</p>
        <div className="form-row"><button type="button" className="btn btn-small" onClick={retry}>Réessayer</button></div>
      </div>
    );
  } else if (state === 'needs-login' && !mye?.data) {
    body = (
      <div className="stack-sm">
        <p className="dim">Connecte-toi à My Epitech pour voir tes projets</p>
        <div className="form-row"><button type="button" className="btn btn-small" onClick={() => open('myepitech')}>Ouvrir My Epitech</button></div>
      </div>
    );
  } else if (projects === null || (!mye?.data && (!mye || state === 'loading'))) {
    body = <p className="dim">Chargement…</p>;
  } else if (sorted.length === 0) {
    body = <p className="dim">Aucun projet</p>;
  } else {
    body = (
      <div className="grid">
        {sorted.map((p) => {
          const runs = (p.projectId && mye?.data?.runs[p.projectId]) || [];
          const start = (p.projectId && mye?.data?.projects.find((m) => m.id === p.projectId)?.start) || null;
          return <ProjectCard key={p.key} project={p} start={start} previous={runs[1] ?? null} verdict={verdictFor(p, entries)} now={now} onOpen={openProject} />;
        })}
      </div>
    );
  }

  const next = summary.next;
  return (
    <div className="page">
      <div className="page-head"><h1>Tableau de bord</h1></div>
      <div className="stat-band">
        <div className="card"><span className="big">{summary.inProgress}</span><span className="dim small">en cours</span></div>
        <div className="card"><span className={`big${summary.failing > 0 ? ' bad' : ''}`}>{summary.failing}</span><span className="dim small">en échec (en cours)</span></div>
        <div className="card"><span className="big">{summary.average === null ? '—' : `${summary.average} %`}</span><span className="dim small">moyenne des derniers scores</span></div>
        <div className="card">
          <span className="big stat-next">{next ? next.title : '—'}</span>
          <span className="dim small">prochain rendu</span>
        </div>
      </div>
      {state === 'needs-login' && mye?.data && (
        <div className="banner" role="status">
          <span>{notConnectedBanner(mye.status.updatedAt)}</span>{' '}
          <button type="button" className="btn btn-small" onClick={() => open('myepitech')}>Ouvrir My Epitech</button>
        </div>
      )}
      {body}
    </div>
  );
}
