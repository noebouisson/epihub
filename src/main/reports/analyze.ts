import { scoreOf, verdictOf } from '../../shared/score'
import type { Report, ReportAdvice, RunDetail, RunSummary } from '../../shared/types'

const NO_TEST_PASSED = 'Aucun test ne passe : le binaire ne compile pas, ne s’appelle pas comme attendu ou ne produit aucune sortie'

function blockersOf(summary: RunSummary, detail: RunDetail): string[] {
  const out: string[] = []
  if (detail.deliveryError) out.push(`Erreur de livraison : ${detail.deliveryError}`)
  if (detail.makeError) out.push(`Erreur de compilation : ${detail.makeError}`)
  if (detail.bannedFunctions.length > 0) out.push(`Fonctions interdites : ${detail.bannedFunctions.join(', ')}`)
  for (const f of summary.failureFlags) out.push(f === 'no-test-passed' ? NO_TEST_PASSED : `Indicateur moulinette : ${f}`)
  return out
}

function adviceFor(
  blockers: string[], failed: Report['failedTests'], categories: Report['categories'],
  style: Report['style'], coverage: Report['coverage']
): ReportAdvice[] {
  const advice: ReportAdvice[] = []
  for (const b of blockers) {
    const i = b.indexOf(' : ')
    advice.push({ priority: 1, title: i < 0 ? b : b.slice(0, i), text: b, tests: [] })
  }
  const mandatory = failed.filter((t) => t.mandatory)
  if (mandatory.length > 0) {
    advice.push({ priority: 1, title: 'Tests obligatoires', text: 'Ces tests sont obligatoires : tant qu’ils échouent, le projet ne peut pas être validé. Corrige-les avant tout le reste.', tests: mandatory.map((t) => t.name) })
  }
  const crashed = failed.filter((t) => t.crashed)
  if (crashed.length > 0) {
    advice.push({ priority: 1, title: 'Crashs', text: 'Lance ton programme avec valgrind ou compile avec -g3 -fsanitize=address ; vérifie les pointeurs NULL, les dépassements de tableau et les free en double.', tests: crashed.map((t) => t.name) })
  }
  const lower = (c: { name: string }) => c.name.toLowerCase()
  const incomplete = (c: { passed: number; count: number }) => c.passed < c.count
  const baseIncomplete = categories.some((c) => /base|easy/.test(lower(c)) && !lower(c).includes('format') && incomplete(c))
  const higher = categories.some((c) => /medium|hard/.test(lower(c)) && c.count > 0)
  if (baseIncomplete && higher) {
    advice.push({ priority: 2, title: 'Tests de base d’abord', text: 'Des tests de base échouent alors que des tests plus difficiles sont à faire : termine d’abord les catégories base/easy.', tests: [] })
  }
  if (categories.some((c) => lower(c).includes('format') && incomplete(c))) {
    advice.push({ priority: 2, title: 'Format de sortie', text: 'Compare ta sortie caractère par caractère : espaces, retours à la ligne, sortie d’erreur et code de retour.', tests: [] })
  }
  if (style.fatal + style.major > 0) {
    advice.push({ priority: 3, title: 'Coding style', text: `${style.fatal} fatal, ${style.major} major : traite d’abord les fautes fatal, puis major.`, tests: [] })
  }
  if (coverage.lines !== null && coverage.lines < 50) {
    advice.push({ priority: 3, title: 'Couverture', text: `La couverture des lignes est de ${coverage.lines} % : ajoute des tests unitaires Criterion.`, tests: [] })
  }
  return advice.sort((a, b) => a.priority - b.priority) // sort stable : ordre d'ajout conservé
}

function evolutionOf(summary: RunSummary, detail: RunDetail, previous: { summary: RunSummary; detail: RunDetail | null }): Report['evolution'] {
  if (previous.detail) {
    const state = (d: RunDetail) => {
      const m = new Map<string, boolean>()
      for (const c of d.categories) for (const t of c.tests) if (!t.skipped) m.set(t.name, t.passed)
      return m
    }
    const before = state(previous.detail)
    const now = state(detail)
    const fixed: string[] = []
    const broken: string[] = []
    for (const [name, passed] of now) {
      const was = before.get(name)
      if (was === undefined) continue
      if (!was && passed) fixed.push(name)
      if (was && !passed) broken.push(name)
    }
    return { fixed, broken, byCategory: false }
  }
  const fixed: string[] = []
  const broken: string[] = []
  for (const [name, c] of Object.entries(summary.categories).sort(([a], [b]) => a.localeCompare(b))) {
    const diff = c.passed - (previous.summary.categories[name]?.passed ?? 0)
    if (diff > 0) fixed.push(`${name} : +${diff}`)
    if (diff < 0) broken.push(`${name} : ${diff}`)
  }
  return { fixed, broken, byCategory: true }
}

export function buildReport(summary: RunSummary, detail: RunDetail, previous?: { summary: RunSummary; detail: RunDetail | null }): Report {
  const score = scoreOf(summary.categories)
  const blockers = blockersOf(summary, detail)
  const categories = Object.entries(summary.categories)
    .map(([name, c]) => ({ name, passed: c.passed, count: c.count, crashed: c.crashed, mandatoryFailed: c.mandatoryFailed }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const failed: Report['failedTests'] = []
  for (const c of detail.categories) {
    for (const t of c.tests) {
      if (!t.passed && !t.skipped) failed.push({ category: c.name, name: t.name, mandatory: t.mandatory, crashed: t.crashed, comment: t.comment })
    }
  }
  const urgent = (t: Report['failedTests'][number]) => t.mandatory || t.crashed
  const failedTests = [...failed.filter(urgent), ...failed.filter((t) => !urgent(t))]

  const coverage = { lines: detail.coverage.lines ?? summary.coverage.lines, branches: detail.coverage.branches ?? summary.coverage.branches }
  const advice = adviceFor(blockers, failedTests, categories, summary.style, coverage)

  const total = categories.reduce((n, c) => n + c.count, 0)
  const passed = categories.reduce((n, c) => n + c.passed, 0)
  let text = `${passed} tests sur ${total} passent.`
  const firstP1 = advice.find((a) => a.priority === 1)
  if (score === 100) text += ' Tous les tests passent.'
  else if (firstP1) text += ` Priorité : ${firstP1.title}.`

  const prevScore = previous ? scoreOf(previous.summary.categories) : null
  return {
    runId: summary.id, projectTitle: summary.title, unitCode: summary.unitCode, projectCode: summary.projectCode,
    date: summary.date, commit: summary.commit, members: summary.members,
    score, verdict: verdictOf(summary, detail),
    delta: score !== null && prevScore !== null ? score - prevScore : null,
    summary: text, blockers, categories, failedTests,
    style: summary.style, coverage, advice,
    evolution: previous ? evolutionOf(summary, detail, previous) : null,
    working: categories.filter((c) => c.count > 0 && c.passed === c.count).map((c) => c.name)
  }
}
