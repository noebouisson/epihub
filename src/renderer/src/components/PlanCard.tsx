import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlanStep, PlanView, SubjectInfo } from '../../../shared/types';
import { formatTarget, groupByPriority, PRIORITY_LABEL, SOURCE_LABEL } from '../planView';

interface Props {
  projectKey: string;
  toast(message: string): void;
}

/** Lignes « Ce que le sujet demande » ; tout est du texte React (le sujet n'est jamais interprété). */
function subjectRows(info: SubjectInfo): [string, string][] {
  const rows: [string, string | null][] = [
    ['Binaire', info.binaryName],
    ['Langage', info.language],
    ['Compilation et règles', [info.compilation, info.makefileRules.length ? `règles : ${info.makefileRules.join(', ')}` : null].filter(Boolean).join(' · ') || null],
    ['Fonctions autorisées', info.authorizedFunctions.length ? info.authorizedFunctions.join(', ') : null],
    ['Interdit', info.forbidden.length ? info.forbidden.join(', ') : null],
    ['Options', info.options.length ? info.options.map((o) => (o.description ? `${o.flag} (${o.description})` : o.flag)).join(' ; ') : null],
    ['Code d’erreur 84', info.errorCode84 ? 'Oui' : null],
    ['Tests unitaires', info.unitTests ? 'Oui' : null],
    ['Bonus', info.bonus.length ? info.bonus.join(' ; ') : null],
  ];
  return rows.filter((r): r is [string, string] => r[1] !== null && r[1] !== '');
}

export function PlanCard({ projectKey: key, toast }: Props): JSX.Element {
  const [plan, setPlan] = useState<PlanView | null | undefined>(undefined);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const alive = useRef(true);
  const seq = useRef(0);

  const reload = useCallback((): void => {
    const n = ++seq.current;
    void window.epihub.plan(key)
      .then((p) => {
        if (!alive.current || seq.current !== n) return;
        setPlan(p);
        setDone(new Set(p?.done ?? []));
      })
      .catch(() => alive.current && seq.current === n && setPlan((c) => (c === undefined ? null : c)));
  }, [key]);

  useEffect(() => {
    alive.current = true;
    setPlan(undefined);
    reload();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = window.epihub.onChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(reload, 1000);
    });
    const offReports = window.epihub.onReportsChanged(reload);
    return () => {
      alive.current = false;
      clearTimeout(timer);
      off();
      offReports();
    };
  }, [key, reload]);

  const importSubject = async (): Promise<void> => {
    setImporting(true);
    try {
      const r = await window.epihub.importSubject(key);
      if (!r.ok && r.error !== 'annulé') toast(r.error);
      if (r.ok) reload();
    } catch {
      toast("L'import du sujet a échoué");
    } finally {
      if (alive.current) setImporting(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!window.confirm('Retirer le sujet et la marche à suivre de ce projet ?')) return;
    try {
      await window.epihub.removeSubject(key);
    } catch {
      toast('Impossible de retirer le sujet');
    }
    reload();
  };

  const toggle = (itemId: string, checked: boolean): void => {
    const before = done;
    const next = new Set(before);
    if (checked) next.add(itemId);
    else next.delete(itemId);
    setDone(next);
    window.epihub.togglePlanItem(key, itemId, checked).then(reload).catch(() => {
      if (!alive.current) return;
      setDone(before);
      toast("Impossible d'enregistrer la case");
    });
  };

  const exportPlan = async (): Promise<void> => {
    const path = await window.epihub.exportPlan(key).catch(() => null);
    toast(path ? `Exporté : ${path}` : "L'export n'a pas abouti");
  };

  let body: JSX.Element;
  if (plan === undefined) {
    body = <p className="dim">Chargement…</p>;
  } else if (plan === null || !plan.subject) {
    body = (
      <div className="stack-sm">
        <p className="dim">La marche à suivre se construit à partir du sujet. Ajoute le PDF du sujet (téléchargé depuis l'intranet ou My Epitech).</p>
        <div className="form-row">
          <button type="button" className="btn" disabled={importing} onClick={() => void importSubject()}>{importing ? 'Lecture du sujet…' : 'Ajouter le sujet (PDF)'}</button>
        </div>
      </div>
    );
  } else {
    const current = plan.status.current?.id ?? null;
    const lateIds = new Set(plan.status.late.map((s) => s.id));
    const total = plan.steps.reduce((n, s) => n + s.items.length, 0);
    const checked = plan.steps.reduce((n, s) => n + s.items.filter((i) => done.has(i.id)).length, 0);
    const progress = total > 0 ? Math.round((checked / total) * 100) : plan.status.progress;
    const rows = subjectRows(plan.subject.info);
    const groups = groupByPriority(plan.improvements);
    const stepView = (s: PlanStep): JSX.Element => (
      <details key={s.id} className="plan-step" open={s.id === current}>
        <summary>
          <span className="plan-step-title">{s.title}</span>
          {s.target && <span className="dim small"> · avant le {formatTarget(s.target)}</span>}
          {lateIds.has(s.id) && <span className="badge badge-danger">En retard</span>}
        </summary>
        {s.details && <p className="dim small plan-details">{s.details}</p>}
        <ul className="list plan-items">
          {s.items.map((i) => (
            <li key={i.id} className="row">
              <label className="plan-item">
                <input type="checkbox" checked={done.has(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} />
                <span className={done.has(i.id) ? 'plan-done' : undefined}>{i.text}</span>
              </label>
            </li>
          ))}
        </ul>
      </details>
    );
    body = (
      <>
        <h3 className="sub">Ce que le sujet demande</h3>
        <p className="dim small">{plan.subject.fileName}</p>
        <dl className="plan-info">
          {rows.map(([label, value]) => (
            <div key={label} className="plan-info-row"><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
        {plan.subject.info.missing.length > 0 && <p className="dim small">Non trouvé dans le sujet : {plan.subject.info.missing.join(', ')}</p>}
        <div className="form-row wrap">
          <button type="button" className="btn btn-small" disabled={importing} onClick={() => void importSubject()}>{importing ? 'Lecture du sujet…' : 'Remplacer'}</button>
          <button type="button" className="btn btn-small" onClick={() => void remove()}>Retirer le sujet</button>
          <button type="button" className="btn btn-small" onClick={() => void exportPlan()}>Exporter</button>
        </div>
        <div className="progress-row plan-progress">
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <span className="small">{progress} %</span>
        </div>
        <div className="plan-steps">{plan.steps.map(stepView)}</div>
        {groups.length > 0 && (
          <>
            <h3 className="sub">Pistes d'amélioration</h3>
            {groups.map(([priority, list]) => (
              <div key={priority}>
                <h4 className="sub">{PRIORITY_LABEL[priority]}</h4>
                <ul className="list">
                  {list.map((i, n) => (
                    <li key={n} className="row">
                      <span className="badge badge-dim">{SOURCE_LABEL[i.source]}</span>
                      <span className="row-main">{i.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </>
    );
  }

  return (
    <section id="plan" className="card card-wide">
      <header className="card-head"><h2>Marche à suivre</h2></header>
      <div className="card-body">{body}</div>
    </section>
  );
}
