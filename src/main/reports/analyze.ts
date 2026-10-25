import { allPassed, scoreOf, verdictOf } from '../../shared/score'
import type { Report, ReportAdvice, RunDetail, RunSummary } from '../../shared/types'

const NO_TEST_PASSED = 'Aucun test ne passe : le binaire ne compile pas, ne s’appelle pas comme attendu ou ne produit aucune sortie'

interface Blocker { text: string; advice: ReportAdvice }
const p1 = (title: string, text: string): ReportAdvice => ({ priority: 1, title, text, tests: [] })

function blockersOf(summary: RunSummary, detail: RunDetail): Blocker[] {
  const out: Blocker[] = []
  if (detail.deliveryError) out.push({ text: `Erreur de livraison : ${detail.deliveryError}`, advice: p1('Erreur de livraison', 'Vérifie que les fichiers attendus sont à la racine du dépôt, que le binaire porte exactement le nom du sujet et que rien d’interdit n’est poussé (binaires, .o).') })
  if (detail.makeError) out.push({ text: `Erreur de compilation : ${detail.makeError}`, advice: p1('Erreur de compilation', 'Lance `make re` sur une copie propre du dépôt (git clone) : le Makefile doit compiler sans erreur avec les flags du sujet.') })
  if (detail.bannedFunctions.length > 0) out.push({ text: `Fonctions interdites : ${detail.bannedFunctions.join(', ')}`, advice: p1('Fonctions interdites', 'Remplace les fonctions listées par tes propres implémentations ou par les fonctions autorisées du sujet.') })
  for (const f of summary.failureFlags) {
    if (f === 'no-test-passed') out.push({ text: NO_TEST_PASSED, advice: p1('Aucun test ne passe', 'Vérifie que le projet compile, que le binaire a le bon nom et qu’il produit une sortie sur un cas simple.') })
    else out.push({ text: `Indicateur moulinette : ${f}`, advice: p1('Indicateur moulinette', 'Consulte le détail du passage sur My Epitech pour cet indicateur.') })
  }
  return out
}

function adviceFor(
  blockerAdvice: ReportAdvice[], failed: Report['failedTests'], categories: Report['categories'],
  style: Report['style'], coverage: Report['coverage']
): ReportAdvice[] {
  const advice: ReportAdvice[] = []
  advice.push(...blockerAdvice)
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
      for (const c of d.categories) for (const t of c.tests) if (!t.skipped) m.set(`${c.name}/${t.name}`, t.passed)
      return m
    }
    const before = state(previous.detail)
    const now = state(detail)
    const fixed: string[] = []
    const broken: string[] = []
    for (const [name, passed] of now) {
      const was = before.get(name)
      if (was === undefined) continue
      const label = name.slice(name.indexOf('/') + 1)
      if (!was && passed) fixed.push(label)
      if (was && !passed) broken.push(label)
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
  const blockerList = blockersOf(summary, detail)
  const blockers = blockerList.map((b) => b.text)
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
  const advice = adviceFor(blockerList.map((b) => b.advice), failedTests, categories, summary.style, coverage)

  const total = categories.reduce((n, c) => n + c.count, 0)
  const passed = categories.reduce((n, c) => n + c.passed, 0)
  let text = `${passed} tests sur ${total} passent.`
  const firstP1 = advice.find((a) => a.priority === 1)
  if (allPassed(summary.categories)) text += ' Tous les tests passent.'
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
