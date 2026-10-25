import type { TestRun } from '../../../shared/types';
import { scorePoints } from '../chart';

const W = 480;
const H = 140;
const M = { top: 10, right: 14, bottom: 10, left: 34 };

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Évolution du score My Epitech : SVG en ligne, couleurs par variables CSS (thèmes sombre et clair). */
export function ScoreChart({ runs }: { runs: TestRun[] }): JSX.Element | null {
  if (runs.length === 0) return null;
  const sorted = [...runs].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const points = scorePoints(sorted, innerW, innerH);
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <svg className="score-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Évolution du score My Epitech">
      {[0, 50, 100].map((v) => {
        const y = M.top + innerH - (v / 100) * innerH;
        return (
          <g key={v}>
            <line className="chart-grid" x1={M.left} x2={W - M.right} y1={y} y2={y} />
            <text className="chart-label" x={M.left - 6} y={y + 4} textAnchor="end">{v} %</text>
          </g>
        );
      })}
      <g transform={`translate(${M.left} ${M.top})`}>
        {points.length > 1 && <polyline className="chart-line" points={line} />}
        {points.map((p) => (
          <circle key={p.run.id} className="chart-dot" cx={p.x} cy={p.y} r={4}>
            <title>{`${fmtDate(p.run.date)} : ${Math.round(p.run.percent)} %`}</title>
          </circle>
        ))}
      </g>
    </svg>
  );
}
