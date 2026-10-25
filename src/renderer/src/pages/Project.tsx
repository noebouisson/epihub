import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectDetail, ProjectSummary, Repo, Section, ServiceId, Settings } from '../../../shared/types';
import type { OpenFn } from '../App';
import { Card } from '../components/Card';
import { RepoPicker } from '../components/RepoPicker';
import { ScoreChart } from '../components/ScoreChart';
import { TeamsLinkEditor } from '../components/TeamsLinkEditor';
import { findProject, isTeamsUrl, linkPatch, resolveLink } from '../../../shared/projects';
import { projectPage, scoreLine } from '../projectView';
import { relativeTime } from '../time';

interface Props {
  projectKey: string;
  settings: Settings | null;
  repos: Repo[];
  open: OpenFn;
  toast(message: string): void;
  onSettings(s: Settings): void;
  onBack(): void;
}

function SectionBadge({ section, service, open, retry }: { section: Section<unknown> | undefined; service: ServiceId; open: OpenFn; retry(): void }): JSX.Element | null {
  if (!section || section.state === 'loading') return <span className="badge badge-dim">Chargement…</span>;
  if (section.state === 'needs-login') return <button type="button" className="btn btn-small" onClick={() => open(service)}>Reconnecte-toi</button>;
  if (section.state === 'error') {
    return (
      <span className="badge-group">
        <span className="badge badge-danger" title={section.message}>{section.message ?? 'Erreur'}</span>
        <button type="button" className="btn btn-small" onClick={retry}>Réessayer</button>
      </span>
    );
  }
  return null;
}

export function Project({ projectKey: key, settings, repos, open, toast, onSettings, onBack }: Props): JSX.Element {
  const [listSummary, setListSummary] = useState<ProjectSummary | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const seq = useRef(0);

  // Un appel à l'ouverture, au bouton « Rafraîchir » et après un changement de lien — jamais sur chaque onChanged.
  const load = useCallback((force: boolean): void => {
    const n = ++seq.current;
    setBusy(true);
    setFailed(false);
    window.epihub.project(key, force)
      .then((d) => seq.current === n && setDetail(d))
      .catch(() => seq.current === n && setFailed(true))
      .finally(() => seq.current === n && setBusy(false));
  }, [key]);

  useEffect(() => {
    let live = true;
    setDetail(undefined);
    setListSummary(null);
    void window.epihub.projects().then((l) => live && setListSummary(findProject(l, key) ?? null)).catch(() => undefined);
    load(false);
    return () => {
      live = false;
      seq.current++;
    };
  }, [key, load]);

  const summary = detail?.summary ?? listSummary;
  // Sans force : les sections en échec ne sont pas en cache et un changement de lien change la signature.
  const afterLinkChange = (s: Settings): void => {
    onSettings(s);
    load(false);
  };
  const retry = (): void => load(false);

  const back = <button type="button" className="btn btn-small btn-ghost" onClick={onBack}>← Projets</button>;
  const state = projectPage({ summary, detail, failed });
  if (state === 'not-found') {
    return <div className="page"><div className="page-head">{back}</div><p className="dim">Projet introuvable.</p></div>;
  }
  if (state === 'failed') {
    return (
      <div className="page">
        <div className="page-head">{back}</div>
        {summary && <h1>{summary.title}</h1>}
        <p className="dim">Impossible de charger le projet</p>
        <button type="button" className="btn" disabled={busy} onClick={retry}>Réessayer</button>
      </div>
    );
  }
  if (!summary) {
    return <div className="page"><div className="page-head">{back}</div><p className="dim">Chargement…</p></div>;
  }

  const d = summary.deadline;
  const score = scoreLine(summary.lastResult);
  const teamsUrl = settings ? resolveLink(settings.projectTeamsLinks, summary, isTeamsUrl) : summary.teamsUrl;
  const shareUrl = d?.url ?? summary.lastResult?.url ?? null;
  const linked = summary.repo;
  const myepitechUrl = summary.lastResult?.url ?? null;
  const subject = detail?.subject;
  const repo = detail?.repo;
  const results = detail?.results;

  return (
    <div className="page">
      <div className="page-head">
        {back}
        <button type="button" className="btn" disabled={busy} onClick={() => load(true)}>{busy ? 'Rafraîchissement…' : 'Rafraîchir'}</button>
      </div>
      <header className="project-head">
        <h1>{summary.title}</h1>
        <div className="dim small">
          <span className="tag">{summary.moduleCode}</span>{' '}
          {d && <strong>{relativeTime(d.end, new Date())}</strong>}
          {score && <span>{d ? ' · ' : ''}{score}</span>}
          {d?.alert && <span className={`badge badge-${d.alert === 'urgent' ? 'danger' : 'warn'}`}>{d.alert === 'urgent' ? 'Urgent' : 'Attention'}</span>}
        </div>
        <div className="form-row wrap">
          {d && <button type="button" className="btn btn-small" onClick={() => open('intra', d.url)}>Ouvrir sur l'intranet</button>}
          {myepitechUrl && <button type="button" className="btn btn-small" onClick={() => open('myepitech', myepitechUrl)}>Ouvrir sur My Epitech</button>}
        </div>
      </header>

      <div className="grid">
        <Card title="Sujet" badge={<SectionBadge section={subject} service="intra" open={open} retry={retry} />}>
          {subject?.state === 'unavailable' && <p className="dim">Pas de sujet sur l'intranet pour ce projet</p>}
          {subject?.state === 'ok' && subject.data && (
            <>
              {subject.data.description && <p className="description">{subject.data.description}</p>}
              {subject.data.files.length > 0 && (
                <ul className="list">
                  {subject.data.files.map((f) => (
                    <li key={f.url} className="row"><button type="button" className="link" onClick={() => open('intra', f.url)}>{f.title}</button></li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        <Card title="Repo" badge={<SectionBadge section={repo} service="github" open={open} retry={retry} />}>
          <div className="small">
            {linked ? (
              <>
                <button type="button" className="link" onClick={() => open('github', linked.url)}>{linked.fullName}</button>{' '}
                <button type="button" className="link" onClick={() => setPicking(true)}>modifier</button>
              </>
            ) : (
              <>
                {repo?.state === 'unavailable' && <span className="dim">Aucun repo lié </span>}
                <button type="button" className="btn btn-small" onClick={() => setPicking(true)}>Lier un repo</button>
              </>
            )}
          </div>
          {repo?.state === 'ok' && repo.data && (
            <>
              <h3 className="sub">Derniers commits</h3>
              {repo.data.commits.length === 0 ? <p className="dim">Aucun commit récent.</p> : (
                <ul className="list">
                  {repo.data.commits.slice(0, 5).map((c) => (
                    <li key={c.sha} className="row">
                      <div className="row-main">
                        <button type="button" className="link" onClick={() => open('github', c.url)}>{c.message.split('\n')[0]}</button>
                        <div className="dim small">{c.author} · {relativeTime(c.date, new Date())}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="sub">PR ouvertes</h3>
              {repo.data.pulls.length === 0 ? <p className="dim">Aucune PR ouverte.</p> : (
                <ul className="list">
                  {repo.data.pulls.map((p) => (
                    <li key={p.number} className="row">
                      <div className="row-main">
                        <button type="button" className="link" onClick={() => open('github', p.url)}>#{p.number} {p.title}</button>
                        <div className="dim small">{p.author} · {relativeTime(p.updatedAt, new Date())}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        <Card title="My Epitech" wide badge={<SectionBadge section={results} service="myepitech" open={open} retry={retry} />}>
          {results?.state === 'unavailable' && <p className="dim">Aucun résultat My Epitech</p>}
          {results?.state === 'ok' && results.data && (
            <>
              <ScoreChart runs={results.data.runs} />
              {results.data.latestError && <p className="dim small" title={results.data.latestError}>Détail des tests indisponible</p>}
              <ul className="list">
                {results.data.latest.map((s) => (
                  <li key={s.name} className="row">
                    <details className="skill">
                      <summary>
                        <span>{s.name}</span>
                        <strong className={s.passed === s.count ? 'ok' : 'bad'}>{s.passed}/{s.count}</strong>
                      </summary>
                      <ul className="list tests">
                        {s.tests.map((t) => (
                          <li key={t.name} className="small">
                            {t.crashed ? <span className="bad">crash</span> : t.passed ? <span className="ok">✓</span> : <span className="bad">✗</span>} {t.name}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Teams" wide>
          <TeamsLinkEditor
            key={`${key}:${teamsUrl ?? ''}`}
            project={summary}
            url={teamsUrl}
            settings={settings}
            share={shareUrl ? { title: summary.title, url: shareUrl, context: summary.moduleCode } : null}
            open={open}
            toast={toast}
            onSaved={afterLinkChange}
          />
        </Card>
      </div>

      {picking && settings && (
        <RepoPicker
          title={`Lier un repo à « ${summary.title} »`}
          current={resolveLink(settings.projectRepoLinks, summary)}
          repos={repos}
          settings={settings}
          onSelect={async (fullName) => {
            // Écrit sous chaque alias : l'accueil (clé intranet) et la page projet voient le même repo.
            afterLinkChange(await window.epihub.updateSettings({ projectRepoLinks: linkPatch(settings.projectRepoLinks, summary, fullName) }));
          }}
          onSaved={onSettings}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
