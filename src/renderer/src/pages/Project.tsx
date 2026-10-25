import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectDetail, ProjectSummary, Repo, Report, ReportEntry, Section, ServiceId, Settings } from '../../../shared/types';
import type { OpenFn } from '../App';
import { Card } from '../components/Card';
import { ReportView, VERDICT_BADGE, VERDICT_LABEL } from '../components/ReportView';
import { RepoPicker } from '../components/RepoPicker';
import { ScoreChart } from '../components/ScoreChart';
import { TeamsLinkEditor } from '../components/TeamsLinkEditor';
import { findProject, isTeamsUrl, linkPatch, resolveLink } from '../../../shared/projects';
import { projectPage, scoreLine } from '../projectView';
import { relativeTime } from '../time';
import { SERVICE_HOMES } from '../../../shared/domains';

const MYEPITECH_HOME = SERVICE_HOMES.myepitech;

interface Props {
  projectKey: string;
  /** Ancre à faire défiler à l'ouverture (`rapport` : carte Moulinette). */
  anchor?: string;
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

export function Project({ projectKey: key, anchor, settings, repos, open, toast, onSettings, onBack }: Props): JSX.Element {
  const [listSummary, setListSummary] = useState<ProjectSummary | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const seq = useRef(0);
  const [entries, setEntries] = useState<ReportEntry[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [reportFailed, setReportFailed] = useState(false);

  // Liste des rapports : à l'ouverture et quand un nouveau passage arrive.
  useEffect(() => {
    let live = true;
    setEntries(null);
    setChosen(null);
    const load = (): void => void window.epihub.reports(key).then((l) => live && setEntries(l)).catch(() => live && setEntries((c) => c ?? []));
    load();
    const off = window.epihub.onChanged(load);
    // Rapport enregistré après le rafraîchissement : affiché sans rouvrir la page.
    const offReports = window.epihub.onReportsChanged(load);
    return () => {
      live = false;
      off();
      offReports();
    };
  }, [key]);

  const shownId = (chosen && entries?.some((e) => e.runId === chosen) ? chosen : entries?.[0]?.runId) ?? null;
  useEffect(() => {
    let live = true;
    setReport(null);
    setReportFailed(false);
    if (shownId) window.epihub.report(shownId).then((r) => live && (r ? setReport(r) : setReportFailed(true))).catch(() => live && setReportFailed(true));
    return () => {
      live = false;
    };
  }, [shownId]);

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
  const ready = !!summary && entries !== null;
  useEffect(() => {
    if (ready && anchor) document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
  }, [ready, anchor]);
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
  const myepitechUrl = d?.url ?? (summary.projectId ? MYEPITECH_HOME : null);
  const shareUrl = myepitechUrl;
  const linked = summary.repo;
  const subject = detail?.subject;
  const repo = detail?.repo;
  const results = detail?.results;
  const shownEntry = entries?.find((e) => e.runId === shownId) ?? null;
  const openFile = async (): Promise<void> => {
    if (shownId) toast((await window.epihub.openReportFile(shownId).catch(() => false)) ? 'Rapport ouvert' : 'Fichier introuvable');
  };
  const exportPdf = async (): Promise<void> => {
    if (!shownId) return;
    const path = await window.epihub.exportReportPdf(shownId).catch(() => null);
    toast(path ? `PDF exporté : ${path}` : "L'export PDF n'a pas abouti");
  };

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
          {myepitechUrl && <button type="button" className="btn btn-small" onClick={() => open('myepitech', myepitechUrl)}>Ouvrir sur My Epitech</button>}
        </div>
      </header>

      <div className="grid">
        <Card title="Sujet" badge={<SectionBadge section={subject} service="myepitech" open={open} retry={retry} />}>
          {subject?.state === 'unavailable' && <p className="dim">Pas de description sur My Epitech pour ce projet</p>}
          {subject?.state === 'ok' && subject.data && (
            <>
              {subject.data.description && <p className="description">{subject.data.description}</p>}
              {subject.data.files.length > 0 && (
                <ul className="list">
                  {subject.data.files.map((f) => (
                    <li key={f.url} className="row"><button type="button" className="link" onClick={() => open('myepitech', f.url)}>{f.title}</button></li>
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

        <section id="rapport" className="card card-wide">
          <header className="card-head">
            <h2>Moulinette</h2>
            <SectionBadge section={results} service="myepitech" open={open} retry={retry} />
          </header>
          <div className="card-body">
            {results?.state === 'ok' && results.data && <ScoreChart runs={results.data.runs} />}
            {entries === null ? (
              <p className="dim">Chargement…</p>
            ) : entries.length === 0 ? (
              <p className="dim">{summary.lastResult ? 'Rapport en cours de génération…' : 'Pas encore de rapport — il sera généré au prochain passage de la moulinette'}</p>
            ) : (
              <>
                <div className="form-row wrap">
                  <button type="button" className="btn btn-small" disabled={!shownEntry?.file} onClick={() => void openFile()}>Ouvrir le fichier</button>
                  <button type="button" className="btn btn-small" onClick={() => void exportPdf()}>Exporter en PDF</button>
                </div>
                {report ? <ReportView report={report} /> : <p className="dim">{reportFailed ? 'Rapport indisponible' : 'Chargement…'}</p>}
                {entries.length > 1 && (
                  <>
                    <h3 className="sub">Rapports précédents</h3>
                    <ul className="list">
                      {entries.map((e) => (
                        <li key={e.runId} className="row">
                          <button type="button" className={`link${e.runId === shownId ? ' selected' : ''}`} aria-current={e.runId === shownId} onClick={() => setChosen(e.runId)}>
                            {new Date(e.date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </button>
                          <strong>{e.score === null ? '—' : `${e.score} %`}</strong>
                          <span className={`badge ${VERDICT_BADGE[e.verdict]}`}>{VERDICT_LABEL[e.verdict]}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </section>

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
            // Écrit sous chaque alias : l'accueil (clé du rendu) et la page projet voient le même repo.
            afterLinkChange(await window.epihub.updateSettings({ projectRepoLinks: linkPatch(settings.projectRepoLinks, summary, fullName) }));
          }}
          onSaved={onSettings}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
