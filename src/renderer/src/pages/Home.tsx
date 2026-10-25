import { useEffect, useState } from 'react';
import { scoreOf } from '../../../shared/score';
import type { DeadlineView, RunSummary, ServiceId, Settings } from '../../../shared/types';
import type { OpenFn, Snapshot } from '../App';
import { projectKey } from '../../../shared/projects';
import { Card } from '../components/Card';
import { DeadlineRow } from '../components/DeadlineRow';
import { RepoPicker } from '../components/RepoPicker';
import { ShareButton } from '../components/ShareButton';
import type { View } from '../services';

interface Props {
  snapshot: Snapshot | null;
  settings: Settings | null;
  onSettings(s: Settings): void;
  open: OpenFn;
  openProject(key: string): void;
  setView(view: View): void;
  toast(message: string): void;
}

export function Home({ snapshot, settings, onSettings, open, openProject, setView, toast }: Props): JSX.Element {
  const [deadlines, setDeadlines] = useState<DeadlineView[]>([]);
  const [picking, setPicking] = useState<DeadlineView | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let live = true;
    void window.epihub.deadlines().then((d) => live && setDeadlines(d)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [snapshot, settings?.repoLinks]);

  const refresh = (id?: ServiceId): void => void window.epihub.refresh(id).catch(() => undefined);
  const refreshAll = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await window.epihub.refresh();
    } catch {
      /* l'état de chaque service s'affiche dans sa carte */
    } finally {
      setRefreshing(false);
    }
  };
  const common = { open, setView, refresh };
  const gh = snapshot?.github.data;
  const mye = snapshot?.myepitech.data;
  const results: RunSummary[] = Object.values(mye?.runs ?? {})
    .map((runs) => runs[0])
    .filter((r): r is RunSummary => !!r)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 5);
  const profile = mye?.profile;
  const unread = snapshot?.teams.data?.unread ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Accueil</h1>
        <button type="button" className="btn" disabled={refreshing} onClick={() => void refreshAll()}>{refreshing ? 'Rafraîchissement…' : 'Rafraîchir'}</button>
      </div>
      <div className="grid">
        <Card title="À rendre bientôt" service="myepitech" snap={snapshot?.myepitech} wide {...common}>
          {deadlines.length === 0 ? (
            <p className="dim">Aucun rendu à venir.</p>
          ) : (
            <ul className="list">{deadlines.map((d) => <DeadlineRow key={d.id} deadline={d} open={open} openProject={openProject} toast={toast} onLink={setPicking} />)}</ul>
          )}
        </Card>

        <Card title="GitHub" service="github" snap={snapshot?.github} {...common}>
          <h3 className="sub">Notifications</h3>
          {gh && gh.notifications.length > 0 ? (
            <ul className="list">
              {gh.notifications.slice(0, 8).map((n) => (
                <li key={n.id} className="row">
                  <div className="row-main">
                    <button type="button" className="link" onClick={() => open('github', n.url)}>{n.title}</button>
                    <div className="dim small">{n.repo}</div>
                  </div>
                  <ShareButton item={{ title: n.title, url: n.url, context: n.repo }} open={open} toast={toast} />
                </li>
              ))}
            </ul>
          ) : <p className="dim">Aucune notification.</p>}
          <h3 className="sub">PR à relire</h3>
          {gh && gh.reviewRequests.length > 0 ? (
            <ul className="list">
              {gh.reviewRequests.slice(0, 8).map((p) => (
                <li key={p.id} className="row">
                  <div className="row-main">
                    <button type="button" className="link" onClick={() => open('github', p.url)}>{p.title}</button>
                    <div className="dim small">{p.repo}</div>
                  </div>
                  <ShareButton item={{ title: p.title, url: p.url, context: p.repo }} open={open} toast={toast} />
                </li>
              ))}
            </ul>
          ) : <p className="dim">Aucune PR à relire.</p>}
        </Card>

        <Card title="My Epitech" service="myepitech" snap={snapshot?.myepitech} {...common}>
          {results.length === 0 ? <p className="dim">Aucun résultat.</p> : (
            <ul className="list">
              {results.map((r) => {
                const score = scoreOf(r.categories);
                return (
                  <li key={r.id} className="row">
                    <div className="row-main">
                      <button type="button" className="link" onClick={() => openProject(projectKey(r.unitCode, r.projectCode))}>{r.title}</button>
                      <div className="dim small">{r.unitCode}</div>
                    </div>
                    <strong className={score !== null && score >= 50 ? 'ok' : 'bad'}>{score === null ? '—' : `${score} %`}</strong>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Teams" service="teams" snap={snapshot?.teams} {...common}>
          <p className="big">{unread} <span className="dim small">non-lu{unread > 1 ? 's' : ''}</span></p>
          <button type="button" className="btn" onClick={() => open('teams')}>Ouvrir Teams</button>
        </Card>

        <Card title="Profil Epitech" service="myepitech" snap={snapshot?.myepitech} {...common}>
          {profile && (
            <div className="stats">
              <div><span className="big">{profile.promotion ?? '—'}</span><span className="dim small">promo</span></div>
              <div><span className="big">{profile.semester ?? '—'}</span><span className="dim small">semestre</span></div>
              <div><span className="big">{profile.gpa ?? '—'}</span><span className="dim small">GPA</span></div>
            </div>
          )}
        </Card>
      </div>

      {picking && settings && (
        <RepoPicker deadline={picking} repos={gh?.repos ?? []} settings={settings} onSaved={onSettings} onClose={() => setPicking(null)} />
      )}
    </div>
  );
}
