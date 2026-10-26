import type { Report } from '../../shared/types'

const VERDICT = { reussi: 'Réussi', partiel: 'Partiel', echoue: 'Échoué' } as const
const PRIORITY = { 1: 'Priorité haute', 2: 'Priorité moyenne', 3: 'Priorité basse' } as const

/** Texte issu des données : une seule ligne, caractères Markdown échappés. */
export const esc = (s: string) => s.replace(/\s*[\r\n]+\s*/g, ' ').replace(/[\\`*_[\]<>#]/g, (c) => `\\${c}`)

function fence(comment: string): string {
  const longest = Math.max(0, ...(comment.match(/`+/g) ?? []).map((m) => m.length))
  const f = '`'.repeat(Math.max(3, longest + 1))
  return `${f}\n${comment}\n${f}`
}

const pad = (n: number) => String(n).padStart(2, '0')

function sanitize(s: string): string { return s.replace(/[^A-Za-z0-9_-]/g, '').replace(/^-+|-+$/g, '') }

export function reportPath(r: Report): { dir: string; file: string } {
  const d = new Date(r.date)
  const stamp = Number.isNaN(d.getTime())
    ? '0000-00-00_00-00'
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`
  return { dir: `${sanitize(r.unitCode) || 'projet'}-${sanitize(r.projectCode) || 'projet'}`, file: `${stamp}-${sanitize(r.runId)}.md` }
}

export function renderMarkdown(r: Report): string {
  const out: string[] = []
  out.push(`# ${esc(r.projectTitle)} — ${esc(r.unitCode)}`, '')
  out.push('## Résumé', '')
  const score = r.score === null ? 'aucun test' : `${r.score} %`
  const delta = r.delta === null ? '' : ` (${r.delta >= 0 ? '+' : ''}${r.delta} points)`
  out.push(`- Verdict : ${VERDICT[r.verdict]}`, `- Score : ${score}${delta}`, `- Passage : ${esc(r.date)}`)
  if (r.commit) out.push(`- Commit : ${esc(r.commit)}`)
  if (r.members.length > 0) out.push(`- Équipe : ${r.members.map(esc).join(', ')}`)
  out.push('', esc(r.summary), '')

  if (r.blockers.length > 0 || r.failedTests.length > 0 || r.categories.length > 0) {
    out.push('## Pourquoi', '')
    if (r.blockers.length > 0) { out.push('### Blocages', ''); for (const b of r.blockers) out.push(`- ${esc(b)}`); out.push('') }
    if (r.categories.length > 0) {
      out.push('### Catégories', '')
      for (const c of r.categories) {
        const extra = [c.crashed ? `${c.crashed} crash` : '', c.mandatoryFailed ? `${c.mandatoryFailed} obligatoire(s) en échec` : ''].filter(Boolean)
        out.push(`- ${esc(c.name)} : ${c.passed}/${c.count}${extra.length ? ` (${extra.join(', ')})` : ''}`)
      }
      out.push('')
    }
    if (r.failedTests.length > 0) {
      out.push('### Tests échoués', '')
      for (const t of r.failedTests) {
        const tags = [t.mandatory ? 'obligatoire' : '', t.crashed ? 'crash' : ''].filter(Boolean)
        out.push(`#### ${esc(t.name)}${tags.length ? ` (${tags.join(', ')})` : ''}`, '', `Catégorie : ${esc(t.category)}`, '')
        if (t.comment) out.push(fence(t.comment), '')
      }
    }
    const s = r.style
    if (s.fatal + s.major + s.minor + s.info > 0) out.push(`Coding style : ${s.fatal} fatal, ${s.major} major, ${s.minor} minor, ${s.info} info`, '')
    if (r.coverage.lines !== null || r.coverage.branches !== null) {
      out.push(`Couverture : lignes ${r.coverage.lines ?? '?'} %, branches ${r.coverage.branches ?? '?'} %`, '')
    }
  }

  if (r.advice.length > 0) {
    out.push('## Comment s’améliorer', '')
    for (const p of [1, 2, 3] as const) {
      const items = r.advice.filter((a) => a.priority === p)
      if (items.length === 0) continue
      out.push(`### ${PRIORITY[p]}`, '')
      for (const a of items) {
        out.push(`- **${esc(a.title)}** : ${esc(a.text)}`)
        if (a.tests.length > 0) out.push(`  - Tests : ${a.tests.map(esc).join(', ')}`)
      }
      out.push('')
    }
  }

  if (r.evolution) {
    out.push('## Évolution', '')
    out.push(r.evolution.byCategory ? 'Comparaison par catégorie avec le passage précédent.' : 'Comparaison test par test avec le passage précédent.', '')
    if (r.evolution.fixed.length === 0 && r.evolution.broken.length === 0) out.push('Aucun changement.', '')
    if (r.evolution.fixed.length > 0) { out.push('Corrigés :'); for (const f of r.evolution.fixed) out.push(`- ${esc(f)}`); out.push('') }
    if (r.evolution.broken.length > 0) { out.push('Régressions :'); for (const f of r.evolution.broken) out.push(`- ${esc(f)}`); out.push('') }
  }

  if (r.working.length > 0) {
    out.push('## Ce qui marche', '')
    for (const w of r.working) out.push(`- ${esc(w)}`)
    out.push('')
  }
  return out.join('\n')
}
