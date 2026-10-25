import { useEffect, useMemo, useState } from 'react';
import type { ProjectSummary } from '../../../shared/types';
import type { OpenFn, Snapshot } from '../App';
import { emptyProjects, scoreLine } from '../projectView';
import { relativeTime } from '../time';

interface Props {
  snapshot: Snapshot | null;
  open: OpenFn;
  openProject(key: string): void;
}

const LOGIN_LABEL = { myepitech: 'Ouvrir My Epitech' } as const;

function Row({ p, openProject }: { p: ProjectSummary; openProject(key: string): void }): JSX.Element {
  const d = p.deadline;
  return (
    <li className={`row${d?.alert ? ` row-${d.alert}` : ''}`}>
      <div className="row-main">
        <button type="button" className="link" onClick={() => openProject(p.key)}>{p.title}</button>
        <div className="dim small">
          <span className="tag">{p.moduleCode}</span>{' '}
          {d ? <strong>{relativeTime(d.end, new Date())}</strong> : scoreLine(p.lastResult)}
          {d?.alert && <span className={`badge badge-${d.alert === 'urgent' ? 'danger' : 'warn'}`}>{d.alert === 'urgent' ? 'Urgent' : 'Attention'}</span>}
        </div>
      </div>
    </li>
  );
}

function EmptyList({ snapshot, open }: { snapshot: Snapshot | null; open: OpenFn }): JSX.Element {
  const empty = emptyProjects({ myepitech: snapshot?.myepitech.status.state });
  return (
    <div className="stack-sm">
      <p className="dim">{empty.message}</p>
      {empty.login.length > 0 && (
        <div className="form-row wrap">
          {empty.login.map((s) => (
            <button key={s} type="button" className="btn btn-small" onClick={() => open(s)}>{LOGIN_LABEL[s as keyof typeof LOGIN_LABEL]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Projects({ snapshot, open, openProject }: Props): JSX.Element {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [q, setQ] = useState('');

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

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (projects ?? []).filter((p) => !n || p.title.toLowerCase().includes(n) || p.moduleCode.toLowerCase().includes(n));
  }, [projects, q]);
  const groups: [string, ProjectSummary[]][] = [
    ['En cours', filtered.filter((p) => p.status === 'en-cours')],
    ['Terminés', filtered.filter((p) => p.status === 'termine')]
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Projets</h1>
        <input className="input filter" placeholder="Filtrer" aria-label="Filtrer" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {projects === null ? (
        <p className="dim">Chargement…</p>
      ) : projects.length === 0 ? (
        <EmptyList snapshot={snapshot} open={open} />
      ) : filtered.length === 0 ? (
        <p className="dim">Aucun projet</p>
      ) : (
        <div className="stack">
          {groups.map(([label, list]) => list.length > 0 && (
            <section key={label} className="card">
              <header className="card-head"><h2>{label}</h2><span className="badge badge-dim">{list.length}</span></header>
              <ul className="list">{list.map((p) => <Row key={p.key} p={p} openProject={openProject} />)}</ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
