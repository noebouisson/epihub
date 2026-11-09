import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, fromMyEpitech, ganttLayout, mergeGantt, type GanttBar, type GanttResult } from '../../../shared/gantt';
import type { OpenFn, Snapshot } from '../App';

const DAY_PX = 30;
const LABEL_PX = 190;

interface Props {
  snapshot: Snapshot | null;
  open: OpenFn;
  openProject(key: string): void;
}

const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const asDate = (iso: string): Date => new Date(`${iso}T12:00:00`);
const short = (iso: string): string => asDate(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const stamp = (d: Date): string => `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

function deadline(b: GanttBar): { text: string; tone: '' | 'warn' | 'danger' } {
  if (b.left === null) return { text: 'date de rendu ?', tone: 'warn' };
  if (b.left < 0) return { text: `rendu dépassé (${short(b.project.end as string)})`, tone: 'danger' };
  if (b.left === 0) return { text: "rendu aujourd'hui", tone: 'danger' };
  if (b.project.status === 'À venir') return { text: `commence ${short(b.project.start)} · rendu ${short(b.project.end as string)}`, tone: '' };
  return { text: `rendu ${short(b.project.end as string)} · J-${b.left}`, tone: b.left <= 3 ? 'danger' : b.left <= 7 ? 'warn' : '' };
}

export function Gantt({ snapshot, open, openProject }: Props): JSX.Element {
  const [csv, setCsv] = useState<GanttResult | null>(null);
  const [today, setToday] = useState(localToday);

  // CSV AppFlowy (projets perso) : relu à l'ouverture et au retour dans la fenêtre.
  const loadCsv = useCallback(() => {
    setToday(localToday());
    void window.epihub.gantt().then(setCsv).catch(() => setCsv((d) => d));
  }, []);
  useEffect(() => {
    loadCsv();
    window.addEventListener('focus', loadCsv);
    return () => window.removeEventListener('focus', loadCsv);
  }, [loadCsv]);

  const my = snapshot?.myepitech;
  const myState = my?.status.state;
  const projects = useMemo(
    () => mergeGantt(fromMyEpitech(my?.data?.projects ?? [], today), csv?.projects ?? []),
    [my?.data?.projects, csv?.projects, today]
  );
  const layout = useMemo(() => (projects.length ? ganttLayout(projects, today) : null), [projects, today]);

  const days = useMemo(() => {
    if (!layout) return [];
    return Array.from({ length: layout.days }, (_, i) => {
      const d = asDate(addDays(layout.start, i));
      return { i, day: d.getDate(), weekend: d.getDay() === 0 || d.getDay() === 6, month: i === 0 || d.getDate() === 1 ? d.toLocaleDateString('fr-FR', { month: 'long' }) : null };
    });
  }, [layout]);

  const refresh = (): void => {
    loadCsv();
    void window.epihub.refresh('myepitech', { force: true });
  };

  const current = layout?.bars.filter((b) => b.project.status !== 'À venir') ?? [];
  const next = current.filter((b) => b.left !== null && b.left >= 0).sort((a, b) => (a.left as number) - (b.left as number))[0];
  const upcoming = layout?.bars.filter((b) => b.project.status === 'À venir').length ?? 0;
  const width = (layout?.days ?? 0) * DAY_PX;
  const myUpdated = my?.status.updatedAt ? new Date(my.status.updatedAt) : null;
  const csvModified = csv?.modified ? new Date(csv.modified) : null;
  const loading = snapshot === null || (myState === 'loading' && !my?.data);

  return (
    <div className="page">
      <div className="page-head">
        <div className="stack-sm">
          <h1>Gantt</h1>
          <span className="dim small">
            My Epitech{myUpdated && <> · mis à jour le {stamp(myUpdated)}</>}
            {csvModified && <> · projets perso : export AppFlowy du {stamp(csvModified)}</>}
          </span>
        </div>
        <div className="form-row">
          <button type="button" className="btn btn-small" onClick={refresh}>Actualiser</button>
          <button type="button" className="btn btn-small" onClick={() => void window.epihub.showGanttFile()} title="Dossier de l'export CSV d'AppFlowy (projets perso)">Projets perso</button>
        </div>
      </div>

      {myState === 'needs-login' && (
        <div className="banner">
          <span>Connecte-toi à My Epitech pour afficher tes projets.</span>
          <button type="button" className="btn btn-small" onClick={() => open('myepitech')}>Ouvrir My Epitech</button>
        </div>
      )}
      {myState === 'error' && <div className="banner">My Epitech est injoignable{my?.status.message ? ` : ${my.status.message}` : ''}. Les dernières données connues restent affichées.</div>}
      {csv && csv.unreadable.length > 0 && <div className="banner">Dates illisibles dans l'export AppFlowy : {csv.unreadable.join(', ')}. Utilise le format AAAA-MM-JJ.</div>}

      {loading ? (
        <p className="dim">Chargement…</p>
      ) : (
        <div className="stack gantt">
          <div className="stat-band">
            <div className="card"><span className="dim small">Projets en cours</span><span className="big">{current.length}</span></div>
            <div className="card"><span className="dim small">Prochain rendu</span><span className="stat-next">{next ? `${next.project.name} · ${next.left === 0 ? "aujourd'hui" : `J-${next.left}`}` : '—'}</span></div>
            <div className="card"><span className="dim small">À venir</span><span className="big">{upcoming}</span></div>
          </div>

          {layout ? (
            <div className="card gantt-card">
              <div className="gantt-scroll" ref={(el) => { if (el && !el.dataset.scrolled) { el.scrollLeft = Math.max(0, (layout.today - 4) * DAY_PX); el.dataset.scrolled = '1'; } }}>
                <div className="gantt-grid" style={{ ['--day' as string]: `${DAY_PX}px`, ['--label' as string]: `${LABEL_PX}px` }}>
                  <div className="gantt-row gantt-head">
                    <div className="gantt-label dim small">Projet</div>
                    <div className="gantt-track" style={{ width }}>
                      {days.map((d) => (
                        <div key={d.i} className={`gantt-day${d.weekend ? ' gantt-we' : ''}`} style={{ left: d.i * DAY_PX }}>
                          {d.month && <span className="gantt-month">{d.month}</span>}
                          <span className={`gantt-num${d.i === layout.today ? ' gantt-num-today' : ''}`}>{d.day}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {layout.bars.map((b) => {
                    const p = b.project;
                    const dl = deadline(b);
                    const sub = [p.module, p.source === 'csv' && (p.category || 'perso'), p.with && `avec ${p.with}`].filter(Boolean).join(' · ');
                    const tone = p.status === 'En cours' ? '' : ' gantt-bar-todo';
                    return (
                      <div key={`${p.source}:${p.key ?? p.name}`} className="gantt-row">
                        <div className="gantt-label">
                          {p.key ? <button type="button" className="link" onClick={() => openProject(p.key as string)}><strong>{p.name}</strong></button> : <strong>{p.name}</strong>}
                          <span className={`small ${dl.tone === 'danger' ? 'bad' : dl.tone === 'warn' ? 'gantt-warn' : 'dim'}`}>{dl.text}</span>
                          {p.verify && <span className="small gantt-warn">dates à vérifier</span>}
                          {sub && <span className="dim small">{sub}</span>}
                        </div>
                        <div className="gantt-track" style={{ width }}>
                          {days.filter((d) => d.weekend).map((d) => <div key={d.i} className="gantt-day gantt-we" style={{ left: d.i * DAY_PX }} />)}
                          <div className={`gantt-bar${tone}${b.open ? ' gantt-bar-open' : ''}${p.source === 'csv' ? ' gantt-bar-perso' : ''}`} style={{ left: b.from * DAY_PX, width: b.span * DAY_PX }} title={`${p.name} · ${p.status}`}>
                            {p.name}
                          </div>
                          {b.left !== null && b.left >= 0 && <div className="gantt-flag" style={{ left: (b.from + b.span) * DAY_PX - 3 }} title={`Rendu ${short(p.end as string)}`} />}
                        </div>
                      </div>
                    );
                  })}
                  <div className="gantt-today" style={{ left: LABEL_PX + layout.today * DAY_PX + DAY_PX / 2 }} aria-hidden="true" />
                </div>
              </div>
            </div>
          ) : (
            <p className="dim">Aucun projet en cours ou à venir sur My Epitech.</p>
          )}

          {csv && csv.skipped.length > 0 && <p className="dim small">Projets perso sans date de début (absents du diagramme) : {csv.skipped.join(', ')}</p>}
          <div className="gantt-legend dim small">
            <span><i className="gantt-key" /> En cours</span>
            <span><i className="gantt-key gantt-bar-todo" /> À venir</span>
            <span><i className="gantt-key gantt-bar-perso" /> Perso (AppFlowy)</span>
            <span><i className="gantt-key gantt-key-today" /> Aujourd'hui</span>
          </div>
          <p className="dim small">Projets Epitech : My Epitech, actualisé toutes les 5 minutes. Projets perso : export CSV d'AppFlowy dans <code>{csv?.path ?? '~/Documents/AppFlowy/Projets.csv'}</code> (catégorie autre qu'« Epitech »).</p>
        </div>
      )}
    </div>
  );
}
