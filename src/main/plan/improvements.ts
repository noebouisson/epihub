import type { Improvement, PlanStep, Report, RepoCheck, SubjectInfo } from '../../shared/types'
import { dayLabel, planStatus } from './plan'

const DAY = 86_400_000
/** Au-delà, les étapes en retard sont regroupées en une seule piste. */
const MAX_LATE_DETAILED = 3
const SOURCE_ORDER = { moulinette: 0, repo: 1, temps: 2 } as const

const isForbidden = (name: string, binaryName: string | null): boolean =>
  /\.o$/.test(name) || /\.a$/.test(name) || name === 'a.out' || /^vgcore\./.test(name) || (binaryName !== null && name === binaryName)

/** Contrôle de la racine d'un dépôt (noms et types seulement). */
export function evaluateRepo(entries: { name: string; type: 'file' | 'dir' }[], pushedAt: string | null, binaryName: string | null): RepoCheck {
  return {
    lastPush: pushedAt,
    hasMakefile: entries.some((e) => e.type === 'file' && e.name === 'Makefile'),
    forbiddenFiles: entries.filter((e) => e.type === 'file' && isForbidden(e.name, binaryName)).map((e) => e.name),
    hasTests: entries.some((e) => e.type === 'dir' && e.name === 'tests')
  }
}

export function improvements(i: {
  info: SubjectInfo | null; steps: PlanStep[]; done: string[]; report: Report | null
  repo: RepoCheck | null | 'not-linked'; end: string | null; now: Date
}): Improvement[] {
  const out: Improvement[] = []

  for (const a of i.report?.advice ?? []) {
    out.push({ source: 'moulinette', priority: a.priority, text: a.tests.length > 0 ? `${a.title} (tests : ${a.tests.join(', ')})` : a.title })
  }

  if (i.repo === 'not-linked') {
    out.push({ source: 'repo', priority: 3, text: 'Lie le repo GitHub du projet pour des conseils sur ton code' })
  } else if (i.repo) {
    const push = i.repo.lastPush ? new Date(i.repo.lastPush).getTime() : NaN
    const end = i.end ? new Date(i.end).getTime() : NaN
    const now = i.now.getTime()
    if (Number.isFinite(push) && Number.isFinite(end)) {
      const days = Math.floor((now - push) / DAY)
      if (days >= 3 && end >= now && end - now <= 14 * DAY) out.push({ source: 'repo', priority: 2, text: `Rien n'a été poussé depuis ${days} jours` })
    }
    if (!i.repo.hasMakefile) out.push({ source: 'repo', priority: 1, text: 'Ajoute un Makefile à la racine du dépôt' })
    if (i.repo.forbiddenFiles.length > 0) out.push({ source: 'repo', priority: 1, text: `Retire du dépôt les fichiers qui ne doivent pas être poussés : ${i.repo.forbiddenFiles.join(', ')}` })
    if (i.info?.unitTests && !i.repo.hasTests) out.push({ source: 'repo', priority: 2, text: 'Ajoute un dossier tests à la racine pour tes tests unitaires' })
  }

  if (!i.info) {
    out.push({ source: 'temps', priority: 1, text: 'Ajoute le sujet (PDF) pour obtenir la marche à suivre' })
  } else {
    const status = planStatus(i.steps, i.done, i.now)
    if (status.late.length > MAX_LATE_DETAILED) {
      out.push({ source: 'temps', priority: 2, text: `${status.late.length} étapes en retard : ${status.late.slice(0, MAX_LATE_DETAILED).map((s) => s.title).join(', ')}…` })
    } else {
      for (const s of status.late) out.push({ source: 'temps', priority: 2, text: `Étape « ${s.title} » en retard (prévue le ${dayLabel(s.target!)})` })
    }
    const done = new Set(i.done)
    const bi = i.steps.findIndex((s) => s.id === 'bonus')
    if (bi > 0 && i.steps[bi].items.some((it) => done.has(it.id)) && i.steps.slice(0, bi).some((s) => s.items.some((it) => !done.has(it.id)))) {
      out.push({ source: 'temps', priority: 3, text: 'Termine la partie obligatoire avant le bonus' })
    }
  }

  return out
    .map((x, n) => ({ x, n }))
    .sort((a, b) => a.x.priority - b.x.priority || SOURCE_ORDER[a.x.source] - SOURCE_ORDER[b.x.source] || a.n - b.n)
    .map(({ x }) => x)
}
