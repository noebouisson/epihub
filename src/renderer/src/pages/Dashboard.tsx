import { useEffect, useMemo, useState } from 'react';
import type { ProjectSummary } from '../../../shared/types';
import type { OpenFn, Snapshot } from '../App';
import { ProjectCard } from '../components/ProjectCard';
import { dashboardSummary, sortProjects } from '../dashboard';

interface Props {
  snapshot: Snapshot | null;
  open: OpenFn;
  openProject(key: string, anchor?: string): void;
}

export function Dashboard({ snapshot, open, openProject }: Props): JSX.Element {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    let live = true;
    const load = (): void => void window.epihub.projects().then((l) => live && setProjects(l)).catch(() => live && setProjects((c) => c ?? []));
    load();
    const off = window.epihub.onChanged(load);
    return () => {
      live = false;
      off();
    };
  }, []);

  const mye = snapshot?.myepitech;
  const now = new Date();
  const sorted = useMemo(() => sortProjects(projects ?? []), [projects]);
  const summary = dashboardSummary(projects ?? [], now);
  const state = mye?.status.state;

  let body: JSX.Element;
  if (state === 'needs-login' && !mye?.data) {
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
          return <ProjectCard key={p.key} project={p} start={start} previous={runs[1] ?? null} now={now} onOpen={(k) => openProject(k, 'rapport')} />;
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
        <div className="card"><span className={`big${summary.failing > 0 ? ' bad' : ''}`}>{summary.failing}</span><span className="dim small">en échec</span></div>
        <div className="card"><span className="big">{summary.average === null ? '—' : `${summary.average} %`}</span><span className="dim small">moyenne des derniers scores</span></div>
        <div className="card">
          <span className="big stat-next">{next ? next.title : '—'}</span>
          <span className="dim small">prochain rendu</span>
        </div>
      </div>
      {body}
    </div>
  );
}
