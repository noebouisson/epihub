import type { TestRun } from '../../shared/types';

export interface ScorePoint { x: number; y: number; run: TestRun }

/** Points du graphique : x réparti uniformément (un seul passage → centré), y de 0 % (bas) à 100 % (haut). */
export function scorePoints(runs: TestRun[], width: number, height: number): ScorePoint[] {
  return runs.map((run, i) => {
    const x = runs.length === 1 ? width / 2 : (i * width) / (runs.length - 1);
    const percent = Math.min(100, Math.max(0, Number.isFinite(run.percent) ? run.percent : 0));
    return { x, y: height - (percent / 100) * height, run };
  });
}
