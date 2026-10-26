import type { Improvement, PlanStep, SubjectInfo } from '../../shared/types'
import { esc } from '../reports/markdown'
import { dayLabel, planStatus } from './plan'

const PRIORITY = { 1: 'Priorité haute', 2: 'Priorité moyenne', 3: 'Priorité basse' } as const
const SOURCE = { moulinette: 'moulinette', repo: 'repo', temps: 'temps' } as const

const pad = (n: number) => String(n).padStart(2, '0')

function summary(info: SubjectInfo): string[] {
  const out: string[] = []
  const line = (label: string, value: string | null) => { if (value) out.push(`- ${label} : ${esc(value)}`) }
  line('Binaire', info.binaryName)
  line('Langage', info.language)
  line('Dépôt', info.repoName)
  line('Compilation', info.compilation)
  if (info.makefileRules.length > 0) line('Règles du Makefile', info.makefileRules.join(', '))
  if (info.authorizedFunctions.length > 0) line('Fonctions autorisées', info.authorizedFunctions.join(', '))
  if (info.forbidden.length > 0) line('Fonctions interdites', info.forbidden.join(', '))
  if (info.options.length > 0) {
    out.push('- Options :')
    for (const o of info.options) out.push(`  - ${esc(o.flag)} : ${esc(o.description)}`)
  }
  if (info.errorCode84) out.push('- Code de retour 84 en cas d\'erreur')
  if (info.unitTests) out.push('- Tests unitaires demandés')
  if (info.bonus.length > 0) out.push(`- Bonus : ${info.bonus.length} ligne(s)`)
  if (info.requirements.length > 0) {
    out.push('- Exigences :')
    for (const r of info.requirements) out.push(`  - ${esc(r)}`)
  }
  if (info.missing.length > 0) out.push('', `Non trouvé dans le sujet : ${info.missing.map(esc).join(', ')}`)
  return out
}

function stepLines(steps: PlanStep[], done: Set<string>, lateIds: Set<string>): string[] {
  const out: string[] = []
  for (const s of steps) {
    out.push(`### ${esc(s.title)}`, '')
    const meta = [s.target ? `Date cible : ${dayLabel(s.target)}` : '', lateIds.has(s.id) ? 'En retard' : ''].filter(Boolean)
    if (meta.length > 0) out.push(meta.join(' — '), '')
    if (s.details) out.push(esc(s.details), '')
    for (const it of s.items) out.push(`- [${done.has(it.id) ? 'x' : ' '}] ${esc(it.text)}`)
    out.push('')
  }
  return out
}

export function renderPlanMarkdown(v: {
  title: string; unitCode: string; info: SubjectInfo; steps: PlanStep[]; done: string[]; improvements: Improvement[]; now: Date
}): string {
  const out: string[] = []
  out.push(`# ${esc(v.title)} — ${esc(v.unitCode)}`, '', `Généré le ${pad(v.now.getDate())}/${pad(v.now.getMonth() + 1)}/${v.now.getFullYear()}`, '')
  out.push('## Ce que le sujet demande', '', ...summary(v.info), '')
  const status = planStatus(v.steps, v.done, v.now)
  out.push('## Marche à suivre', '', `Avancement : ${status.progress} %`, '')
  out.push(...stepLines(v.steps, new Set(v.done), new Set(status.late.map((s) => s.id))))
  out.push('## Pistes d\'amélioration', '')
  if (v.improvements.length === 0) out.push('Aucune piste pour le moment.', '')
  for (const p of [1, 2, 3] as const) {
    const items = v.improvements.filter((x) => x.priority === p)
    if (items.length === 0) continue
    out.push(`### ${PRIORITY[p]}`, '')
    for (const x of items) out.push(`- ${esc(x.text)} (${SOURCE[x.source]})`)
    out.push('')
  }
  return out.join('\n')
}
