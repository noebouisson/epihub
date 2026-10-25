import type { RunDetail, RunSummary, SkillBreakdown, Verdict } from './types'

/** Σ passed / Σ count des catégories, en % arrondi ; null sans test. */
export function scoreOf(categories: Record<string, SkillBreakdown>): number | null {
  let count = 0
  let passed = 0
  for (const c of Object.values(categories)) { count += c.count; passed += c.passed }
  return count === 0 ? null : Math.round((passed / count) * 100)
}

export function verdictOf(summary: RunSummary, detail: RunDetail | null): Verdict {
  const score = scoreOf(summary.categories)
  const flags = summary.failureFlags
  const hasError = !!(detail && (detail.deliveryError || detail.makeError))
  if (score === null || score < 50 || hasError || flags.includes('no-test-passed')) return 'echoue'
  if (score === 100 && flags.length === 0) return 'reussi'
  return 'partiel'
}
