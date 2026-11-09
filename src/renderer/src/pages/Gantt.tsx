import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, ganttLayout, type GanttBar, type GanttResult } from '../../../shared/gantt';

const DAY_PX = 30;
const LABEL_PX = 190;

const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const asDate = (iso: string): Date => new Date(`${iso}T12:00:00`);
const short = (iso: string): string => asDate(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

function deadline(b: GanttBar): { text: string; tone: '' | 'warn' | 'danger' } {
  if (b.left === null) return { text: 'date de rendu ?', tone: 'warn' };
  if (b.left < 0) return { text: `rendu dépassé (${short(b.project.end as string)})`, tone: 'danger' };
  if (b.left === 0) return { text: "rendu aujourd'hui", tone: 'danger' };
  return { text: `rendu ${short(b.project.end as string)} · J-${b.left}`, tone: b.left <= 3 ? 'danger' : b.left <= 7 ? 'warn' : '' };
}

export function Gantt(): JSX.Element {
  const [data, setData] = useState<GanttResult | null>(null);
  const [today, setToday] = useState(localToday);

  const load = useCallback(() => {
    setToday(localToday());
    void window.epihub.gantt().then(setData).catch(() => setData((d) => d));
  }, []);

  // Rechargé à l'ouverture et quand la fenêtre reprend le focus (après un export depuis AppFlowy).
  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  const layout = useMemo(() => (data && data.projects.length ? ganttLayout(data.projects, today) : null), [data, today]);

  const days = useMemo(() => {
    if (!layout) return [];
    return Array.from({ length: layout.days }, (_, i) => {
      const d = asDate(addDays(layout.start, i));
      return { i, day: d.getDate(), weekend: d.getDay() === 0 || d.getDay() === 6, month: i === 0 || d.getDate() === 1 ? d.toLocaleDateString('fr-FR', { month: 'long' }) : null };
    });
  }, [layout]);

  const next = layout?.bars.filter((b) => b.left !== null && b.left >= 0).sort((a, b) => (a.left as number) - (b.left as number))[0];
  const noEnd = layout?.bars.filter((b) => b.left === null).length ?? 0;
  const width = (layout?.days ?? 0) * DAY_PX;
  const modified = data?.modified ? new Date(data.modified) : null;
  const stale = modified ? (Date.now() - modified.getTime()) / 86_400_000 > 7 : false;

  return (
    <div className="page">
      <div className="page-head">
        <div className="stack-sm">
          <h1>Gantt</h1>
          <span className="dim small">
            Source : export CSV d'AppFlowy
            {modified && <> · exporté le {modified.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à {modified.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</>}
          </span>
        </div>
        <div className="form-row">
          <button type="button" className="btn btn-small" onClick={load}>Recharger</button>
          <button type="button" className="btn btn-small" onClick={() => void window.epihub.showGanttFile()}>Ouvrir le dossier</button>
        </div>
      </div>

      {data === null ? (
        <p className="dim">Chargement…</p>
      ) : data.error === 'missing' ? (
        <div className="card stack-sm">
          <h2>Aucun export trouvé</h2>
          <p className="dim">Dans AppFlowy, ouvre ta base Projets, puis ⋯ → Exporter → CSV, et enregistre-la ici :</p>
          <code className="gantt-path">{data.path}</code>
        </div>
      ) : data.error === 'read' ? (
        <div className="card"><p className="bad">Impossible de lire {data.path}. Réexporte le fichier depuis AppFlowy.</p></div>
      ) : (
        <div className="stack gantt">
          {stale && <div className="banner">L'export a plus de 7 jours. Réexporte la base depuis AppFlowy pour mettre le Gantt à jour.</div>}
          {data.unreadable.length > 0 && <div className="banner">Dates illisibles : {data.unreadable.join(', ')}. Utilise le format AAAA-MM-JJ dans AppFlowy.</div>}

          <div className="stat-band">
            <div className="card"><span className="dim small">Projets en cours</span><span className="big">{data.projects.length}</span></div>
            <div className="card"><span className="dim small">Prochain rendu</span><span className="stat-next">{next ? `${next.project.name} · ${next.left === 0 ? "aujourd'hui" : `J-${next.left}`}` : '—'}</span></div>
            <div className="card"><span className="dim small">Sans date de rendu</span><span className="big">{noEnd}</span></div>
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
                    const dl = deadline(b);
                    const sub = [b.project.module, b.project.with && `avec ${b.project.with}`].filter(Boolean).join(' · ');
                    const tone = b.project.status.toLowerCase().startsWith('en cours') ? '' : ' gantt-bar-todo';
                    return (
                      <div key={b.project.name} className="gantt-row">
                        <div className="gantt-label">
                          <strong>{b.project.name}</strong>
                          <span className={`small ${dl.tone === 'danger' ? 'bad' : dl.tone === 'warn' ? 'gantt-warn' : 'dim'}`}>{dl.text}</span>
                          {b.project.verify && <span className="small gantt-warn">dates à vérifier</span>}
                          {sub && <span className="dim small">{sub}</span>}
                        </div>
                        <div className="gantt-track" style={{ width }}>
                          {days.filter((d) => d.weekend).map((d) => <div key={d.i} className="gantt-day gantt-we" style={{ left: d.i * DAY_PX }} />)}
                          <div className={`gantt-bar${tone}${b.open ? ' gantt-bar-open' : ''}`} style={{ left: b.from * DAY_PX, width: b.span * DAY_PX }} title={`${b.project.name} · ${b.project.status}`}>
                            {b.project.name}
                          </div>
                          {b.left !== null && b.left >= 0 && <div className="gantt-flag" style={{ left: (b.from + b.span) * DAY_PX - 3 }} title={`Rendu ${short(b.project.end as string)}`} />}
                        </div>
                      </div>
                    );
                  })}
                  <div className="gantt-today" style={{ left: LABEL_PX + layout.today * DAY_PX + DAY_PX / 2 }} aria-hidden="true" />
                </div>
              </div>
            </div>
          ) : (
            <p className="dim">Aucun projet en cours avec une date de début.</p>
          )}

          {data.skipped.length > 0 && <p className="dim small">Sans date de début (absents du diagramme) : {data.skipped.join(', ')}</p>}
          <div className="gantt-legend dim small">
            <span><i className="gantt-key" /> En cours</span>
            <span><i className="gantt-key gantt-bar-todo" /> À faire</span>
            <span><i className="gantt-key gantt-key-today" /> Aujourd'hui</span>
            <span><i className="gantt-key gantt-bar-open" /> Date de rendu inconnue</span>
          </div>
          <p className="dim small">Pour mettre à jour : dans AppFlowy, ⋯ → Exporter → CSV vers <code>{data.path}</code>. EpiHub relit le fichier quand tu reviens dans la fenêtre.</p>
        </div>
      )}
    </div>
  );
}
