import type { Report, Verdict } from '../../../shared/types';

export const VERDICT_LABEL: Record<Verdict, string> = { reussi: 'Réussi', partiel: 'Partiel', echoue: 'Échoué' };
export const VERDICT_BADGE: Record<Verdict, string> = { reussi: 'badge-ok', partiel: 'badge-warn', echoue: 'badge-danger' };

const PRIORITY: Record<1 | 2 | 3, string> = { 1: 'Priorité haute', 2: 'Priorité moyenne', 3: 'Priorité basse' };

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Rapport de moulinette : uniquement du texte React (aucun HTML issu des données). */
export function ReportView({ report: r }: { report: Report }): JSX.Element {
  const evo = r.evolution;
  return (
    <div className="report">
      <section>
        <h3 className="sub">Résumé</h3>
        <p className="report-score">
          <strong className="big">{r.score === null ? '—' : `${r.score} %`}</strong>
          <span className={`badge ${VERDICT_BADGE[r.verdict]}`}>{VERDICT_LABEL[r.verdict]}</span>
          {r.delta !== null && r.delta !== 0 && <span className={r.delta > 0 ? 'ok' : 'bad'}>{r.delta > 0 ? `▲ +${r.delta}` : `▼ ${r.delta}`}</span>}
        </p>
        <p>{r.summary}</p>
        <p className="dim small">
          {fmtDate(r.date)}
          {r.commit && <> · commit <code>{r.commit.slice(0, 8)}</code></>}
          {r.members.length > 0 && <> · {r.members.join(', ')}</>}
        </p>
      </section>

      <section>
        <h3 className="sub">Pourquoi</h3>
        {r.blockers.length > 0 && (
          <ul className="report-blockers">{r.blockers.map((b, i) => <li key={i} className="bad">{b}</li>)}</ul>
        )}
        {r.categories.length > 0 && (
          <table className="report-table">
            <thead><tr><th>Catégorie</th><th>Réussis</th><th>Crashs</th><th>Obligatoires échoués</th></tr></thead>
            <tbody>
              {r.categories.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className={c.passed === c.count ? 'ok' : 'bad'}>{c.passed}/{c.count}</td>
                  <td>{c.crashed}</td>
                  <td>{c.mandatoryFailed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="dim small">
          Style : F {r.style.fatal} · M {r.style.major} · m {r.style.minor} · i {r.style.info}
          {r.coverage.lines !== null && <> · Couverture : lignes {r.coverage.lines} %</>}
          {r.coverage.branches !== null && <>, branches {r.coverage.branches} %</>}
        </p>
        {r.failedTests.length > 0 && (
          <>
            <h4 className="sub">Tests échoués ({r.failedTests.length})</h4>
            <ul className="list">
              {r.failedTests.map((t, i) => (
                <li key={i} className="report-test">
                  <details>
                    <summary>
                      <span className="tag">{t.category}</span> {t.name}
                      {t.mandatory && <span className="badge badge-danger">obligatoire</span>}
                      {t.crashed && <span className="badge badge-warn">crash</span>}
                    </summary>
                    {t.comment ? <pre className="report-comment">{t.comment}</pre> : <p className="dim small">Pas de commentaire.</p>}
                  </details>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {r.advice.length > 0 && (
        <section>
          <h3 className="sub">Comment s'améliorer</h3>
          {([1, 2, 3] as const).map((p) => {
            const items = r.advice.filter((a) => a.priority === p);
            return items.length > 0 && (
              <div key={p}>
                <h4 className="sub">{PRIORITY[p]}</h4>
                <ul className="report-advice">
                  {items.map((a, i) => (
                    <li key={i}>
                      <strong>{a.title}</strong>
                      <p>{a.text}</p>
                      {a.tests.length > 0 && <p className="dim small">Tests : {a.tests.join(', ')}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {evo && (
        <section>
          <h3 className="sub">Évolution</h3>
          {evo.fixed.length === 0 && evo.broken.length === 0 ? (
            <p className="dim">Aucun changement depuis le passage précédent.</p>
          ) : (
            <>
              {evo.fixed.length > 0 && <p className="ok">{evo.byCategory ? 'Catégories corrigées' : 'Corrigés'} : {evo.fixed.join(', ')}</p>}
              {evo.broken.length > 0 && <p className="bad">{evo.byCategory ? 'Catégories dégradées' : 'Cassés'} : {evo.broken.join(', ')}</p>}
            </>
          )}
        </section>
      )}

      {r.working.length > 0 && (
        <section>
          <h3 className="sub">Ce qui marche</h3>
          <ul className="report-working">{r.working.map((w, i) => <li key={i} className="ok">{w}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
