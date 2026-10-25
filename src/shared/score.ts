import type { RunDetail, RunSummary, SkillBreakdown, Verdict } from './types'

/** Σ passed / Σ count des catégories, en % arrondi ; null sans test. */
export function scoreOf(categories: Record<string, SkillBreakdown>): number | null {
  let count = 0
  let passed = 0
  for (const c of Object.values(categories)) { count += c.count; passed += c.passed }
  return count === 0 ? null : Math.round((passed / count) * 100)
}

/** Tous les tests passent (exact, sans arrondi) et il y en a au moins un. */
export function allPassed(categories: Record<string, SkillBreakdown>): boolean {
  const all = Object.values(categories)
  return all.reduce((n, c) => n + c.count, 0) > 0 && all.every((c) => c.passed === c.count)
}

export function verdictOf(summary: RunSummary, detail: RunDetail | null): Verdict {
  const score = scoreOf(summary.categories)
  const flags = summary.failureFlags
  const hasError = !!(detail && (detail.deliveryError || detail.makeError))
  if (score === null || score < 50 || hasError || flags.includes('no-test-passed')) return 'echoue'
  if (allPassed(summary.categories) && flags.length === 0) return 'reussi'
  return 'partiel'
}
