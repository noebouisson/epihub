import type { Report } from '../../shared/types'
import { PRIORITY } from './markdown'

const VERDICT = { reussi: 'Réussi', partiel: 'Partiel', echoue: 'Échoué' } as const
const COLOR = { reussi: '#1a7f37', partiel: '#9a6700', echoue: '#cf222e' } as const

const e = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)
const list = (items: string[]) => `<ul>${items.map((i) => `<li>${e(i)}</li>`).join('')}</ul>`

/** Document HTML autonome (styles inline, aucun script) ; tout texte issu des données est échappé. */
export function renderHtml(r: Report): string {
  const score = r.score === null ? 'aucun test' : `${r.score} %`
  const delta = r.delta === null ? '' : ` (${r.delta >= 0 ? '+' : ''}${r.delta} points)`
  const parts: string[] = []
  parts.push(`<h1>${e(r.projectTitle)} — ${e(r.unitCode)}</h1>`)
  parts.push(`<p><strong style="color:${COLOR[r.verdict]}">${VERDICT[r.verdict]}</strong> · ${e(score + delta)} · ${e(r.date)}${r.commit ? ` · ${e(r.commit)}` : ''}</p>`)
  if (r.members.length > 0) parts.push(`<p>Équipe : ${e(r.members.join(', '))}</p>`)
  parts.push(`<h2>Résumé</h2><p>${e(r.summary)}</p>`)
  if (r.blockers.length > 0) parts.push(`<h2>Blocages</h2>${list(r.blockers)}`)
  if (r.categories.length > 0) {
    parts.push(`<h2>Catégories</h2>${list(r.categories.map((c) => {
      const extra = [c.crashed ? `${c.crashed} crash` : '', c.mandatoryFailed ? `${c.mandatoryFailed} obligatoire(s) en échec` : ''].filter(Boolean)
      return `${c.name} : ${c.passed}/${c.count}${extra.length ? ` (${extra.join(', ')})` : ''}`
    }))}`)
  }
  if (r.failedTests.length > 0) {
    parts.push('<h2>Tests échoués</h2>')
    for (const t of r.failedTests) {
      const tags = [t.mandatory ? 'obligatoire' : '', t.crashed ? 'crash' : ''].filter(Boolean)
      parts.push(`<h3>${e(t.name)}${tags.length ? ` (${e(tags.join(', '))})` : ''}</h3><p>Catégorie : ${e(t.category)}</p>`)
      if (t.comment) parts.push(`<pre>${e(t.comment)}</pre>`)
    }
  }
  const st = r.style
  if (st.fatal + st.major + st.minor + st.info > 0) parts.push(`<p>Coding style : ${st.fatal} fatal, ${st.major} major, ${st.minor} minor, ${st.info} info</p>`)
  if (r.coverage.lines !== null || r.coverage.branches !== null) parts.push(`<p>Couverture : lignes ${r.coverage.lines ?? '?'} %, branches ${r.coverage.branches ?? '?'} %</p>`)
  if (r.advice.length > 0) {
    parts.push('<h2>Comment s’améliorer</h2>')
    for (const p of [1, 2, 3] as const) {
      const items = r.advice.filter((a) => a.priority === p)
      if (items.length === 0) continue
      parts.push(`<h3>${PRIORITY[p]}</h3><ul>${items.map((a) => `<li><strong>${e(a.title)}</strong> : ${e(a.text)}${a.tests.length ? ` Tests : ${e(a.tests.join(', '))}` : ''}</li>`).join('')}</ul>`)
    }
  }
  if (r.evolution) {
    parts.push('<h2>Évolution</h2>')
    if (r.evolution.fixed.length > 0) parts.push(`<p>Corrigés :</p>${list(r.evolution.fixed)}`)
    if (r.evolution.broken.length > 0) parts.push(`<p>Régressions :</p>${list(r.evolution.broken)}`)
    if (r.evolution.fixed.length + r.evolution.broken.length === 0) parts.push('<p>Aucun changement.</p>')
  }
  if (r.working.length > 0) parts.push(`<h2>Ce qui marche</h2>${list(r.working)}`)
  const style = 'body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;color:#1f2328;line-height:1.5}pre{background:#f6f8fa;padding:.75rem;border-radius:6px;white-space:pre-wrap;word-break:break-word}h2{border-bottom:1px solid #d0d7de;padding-bottom:.25rem}'
  return `<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><title>${e(r.projectTitle)} — rapport</title><style>${style}</style></head><body>${parts.join('')}</body></html>\n`
}
