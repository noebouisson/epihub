import type { PlanItem, PlanStatus, PlanStep, SubjectInfo } from '../../shared/types'

const DAY = 86_400_000
const MAX_FEATURES = 12
const MAX_BONUS = 10

const WEIGHTS = { setup: 1, base: 2, option: 1.5, features: 3, errors: 1, tests: 1.5, finish: 0.5, bonus: 1 }

/** Jour calendaire local de `d`, en millisecondes UTC (minuit) : l'arithmétique en jours évite les décalages d'heure d'été. */
const localDay = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
const ymd = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** `YYYY-MM-DD` → JJ/MM. */
export const dayLabel = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}`

function parseDay(s: string | null): number | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3])
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : localDay(d)
}

const mk = (id: string, title: string, details: string, texts: string[]): PlanStep & { weight: number } => ({
  id, title, details, items: texts.map((text, i): PlanItem => ({ id: `${id}#${i}`, text })), target: null, weight: 0
})

export function buildPlan(info: SubjectInfo, w: { start: string | null; end: string | null; now: Date }): PlanStep[] {
  const steps: (PlanStep & { weight: number })[] = []
  const add = (s: PlanStep & { weight: number }, weight: number) => { if (s.items.length > 0) steps.push({ ...s, weight }) }

  add(mk('setup', 'Mise en place', 'Prépare le dépôt et le squelette du projet.', [
    info.repoName ? `Créer le dépôt ${info.repoName}` : 'Créer le dépôt Git du projet',
    info.makefileRules.length > 0 ? `Écrire le Makefile avec les règles ${info.makefileRules.join(', ')}` : 'Écrire le Makefile',
    info.binaryName ? `Nommer le binaire exactement ${info.binaryName}` : 'Nommer le binaire comme le demande le sujet',
    'Ajouter un .gitignore (binaires, *.o, vgcore.*)'
  ]), WEIGHTS.setup)

  add(mk('base', 'Cas de base', 'Un premier exemple qui fonctionne de bout en bout.', [
    'Faire fonctionner le premier exemple du sujet',
    ...(info.authorizedFunctions.length > 0 ? [`Respecter les fonctions autorisées : ${info.authorizedFunctions.join(', ')}`] : [])
  ]), WEIGHTS.base)

  if (info.options.length > 0) {
    for (const o of info.options) {
      add(mk(`option:${o.flag}`, `Option ${o.flag}`, o.description, [`Implémenter ${o.flag} : ${o.description}`, `Tester ${o.flag} seule puis combinée aux autres options`]), WEIGHTS.option)
    }
  } else {
    const reqs = info.requirements.slice(0, MAX_FEATURES)
    add(mk('features', 'Fonctionnalités demandées', 'Les exigences relevées dans le sujet.', reqs.length > 0 ? reqs : ['Implémenter les fonctionnalités décrites dans le sujet']), WEIGHTS.features)
  }

  add(mk('errors', 'Gestion des erreurs', 'Un programme robuste échoue proprement.', [
    ...(info.errorCode84 ? ['Retourner 84 en cas d\'erreur'] : []),
    'Écrire les messages d\'erreur sur la sortie d\'erreur',
    'Gérer les cas limites : fichier inexistant, arguments invalides'
  ]), WEIGHTS.errors)

  const tests = [
    ...info.examples.map((_, i) => `Reproduire l'exemple ${i + 1} du sujet`),
    ...(info.unitTests ? ['Écrire des tests unitaires avec Criterion', 'Ajouter la règle tests_run au Makefile'] : [])
  ]
  add(mk('tests', 'Tests', 'Vérifie ton programme avant la moulinette.', tests.length > 0 ? tests : ['Tester le programme sur plusieurs cas']), WEIGHTS.tests)

  add(mk('finish', 'Finition', 'Dernières vérifications avant le rendu.', [
    'Respecter le coding style',
    'Lancer make re sur un clone propre du dépôt',
    'Vérifier qu\'aucun binaire ni fichier .o n\'est poussé'
  ]), WEIGHTS.finish)

  add(mk('bonus', 'Bonus', 'Seulement quand tout le reste est fait', info.bonus.slice(0, MAX_BONUS)), WEIGHTS.bonus)

  const startDay = parseDay(w.start)
  const nowDay = localDay(w.now)
  const endMs = w.end ? new Date(w.end).getTime() : NaN
  const open = Number.isFinite(endMs) && endMs > w.now.getTime()
  const from = Math.max(startDay ?? nowDay, nowDay)
  const to = open ? Math.max(localDay(new Date(endMs - DAY)), from) : from
  const span = Math.round((to - from) / DAY)
  const total = steps.reduce((n, s) => n + s.weight, 0)
  let cum = 0
  return steps.map(({ weight, ...s }) => {
    cum += weight
    return { ...s, target: open ? ymd(from + Math.round((span * cum) / total) * DAY) : null }
  })
}

export function planStatus(steps: PlanStep[], done: string[], now: Date): PlanStatus {
  const doneSet = new Set(done)
  const ids = steps.flatMap((s) => s.items.map((i) => i.id))
  const checked = ids.filter((id) => doneSet.has(id)).length
  const unfinished = steps.filter((s) => s.items.some((i) => !doneSet.has(i.id)))
  const today = ymd(localDay(now))
  return {
    progress: ids.length === 0 ? 0 : Math.round((checked / ids.length) * 100),
    current: unfinished[0] ?? null,
    late: unfinished.filter((s) => s.target !== null && s.target < today)
  }
}
