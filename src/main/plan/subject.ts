import type { SubjectInfo } from '../../shared/types'

/** Analyse locale du texte d'un sujet : tout reste du texte brut, rien n'est interprété. */

const FIELD_START = /^\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' ]{1,40}\s*:(\s|$)/
const field = (labels: string): RegExp => new RegExp(`^\\s*(?:${labels})\\s*:\\s*(.*)$`, 'i')
const BINARY = field('binary name|nom du binaire')
const LANGUAGE = field('language|langage')
const REPO = field('repository name|nom du d[eé]p[oô]t')
const COMPILATION = field('compilation')
const AUTHORIZED = field('authorized functions|fonctions autoris[eé]es')

const FLAG = /^\s*(--[A-Za-z][A-Za-z0-9-]+|-[A-Za-z]{1,2})(?=\s)\s*[:–—-]?\s+(\S.*)$/
const PROMPT = /^\s*(?:[>$]|[∼~]\/)/
const BONUS_TITLE = /^\s*(?:#+\s*|\d+(?:\.\d+)*[.)]?\s+)?(?:partie\s+)?bonus(?:es)?(?:\s+part)?\s*:?\s*$/i
const MUST = /\b(must|should|have to|has to|doit|doivent|il faut)\b/i
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/
const MAX_BONUS = 30

const STOP = new Set(('the a an of to in on and or but is are be not no use using usage used any all function functions call calls ' +
  'library libraries standard forbidden banned prohibited allowed authorized you your yours it this that these those with without for from as at by ' +
  'le la les un une des du de et ou est sont pas aucun aucune utilisation utiliser fonction fonctions appel appels bibliothèque bibliothèques ' +
  'interdit interdite interdits interdites autorisé autorisée autorisés autorisées vous votre vos ce cette ces avec sans pour dans sur en au aux ' +
  'projet program programme code').split(' '))

const isTitle = (l: string): boolean => {
  const t = l.trim()
  if (/^#+\s+\S/.test(t) || /^\d+(\.\d+)*[.)]?\s+\S/.test(t)) return true
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '')
  return letters.length >= 3 && t.length <= 40 && t === t.toUpperCase()
}

/** Regroupe les lignes d'une même phrase (retour à la ligne du PDF) ; invites, options, titres et champs restent seuls. */
function paragraphs(lines: string[], skipSpecial = false): string[] {
  const out: string[] = []
  let cur: string | null = null
  const flush = () => { if (cur) out.push(cur); cur = null }
  for (const l of lines) {
    const t = l.trim()
    const special = PROMPT.test(l) || FLAG.test(l)
    if (t === '' || special || isTitle(l) || FIELD_START.test(l)) {
      flush()
      if (t !== '' && !(special && skipSpecial)) out.push(t)
      continue
    }
    cur = cur !== null && !/[.:;!?]$/.test(cur) ? `${cur} ${t}` : (flush(), t)
  }
  flush()
  return out
}

const sentences = (lines: string[], skipSpecial = false): string[] =>
  paragraphs(lines, skipSpecial).flatMap((l) => l.split(/(?<=[.;!?])\s+/)).map((s) => s.trim()).filter(Boolean)

const uniq = <T>(a: T[]): T[] => [...new Set(a)]

function fieldValue(lines: string[], re: RegExp): { value: string | null; index: number } {
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i])
    if (m) return { value: m[1].trim() || null, index: i }
  }
  return { value: null, index: -1 }
}

function functionsOf(lines: string[], start: number, first: string): string[] {
  const parts = [first]
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]
    if (l.trim() === '' || FIELD_START.test(l)) break
    parts.push(l)
  }
  const out: string[] = []
  for (const raw of parts.join(' ').split(/[,;\s]+/)) {
    const t = raw.replace(/\.$/, '')
    if (IDENT.test(t)) out.push(t)
  }
  return uniq(out)
}

function forbiddenOf(lines: string[]): string[] {
  const out: string[] = []
  const words = (s: string) => s.split(/[^A-Za-z0-9_]+/).filter((w) => /^[a-z_][a-z0-9_]*$/.test(w) && w.length >= 2 && !STOP.has(w))
  for (const s of sentences(lines)) {
    const m = /forbidden|interdit/i.exec(s)
    if (!m) continue
    let found = words(s.slice(0, m.index))
    if (found.length === 0) found = words(s.slice(m.index + m[0].length))
    out.push(...found)
  }
  return uniq(out)
}

function optionsOf(lines: string[]): { flag: string; description: string }[] {
  const seen = new Set<string>()
  const out: { flag: string; description: string }[] = []
  for (const l of lines) {
    const m = FLAG.exec(l)
    if (!m || seen.has(m[1])) continue
    seen.add(m[1])
    out.push({ flag: m[1], description: m[2].trim() })
  }
  return out
}

function examplesOf(lines: string[]): string[] {
  const out: string[] = []
  let cur: string[] | null = null
  for (const l of lines) {
    if (l.trim() === '') { if (cur) out.push(cur.join('\n')); cur = null; continue }
    if (cur) cur.push(l.trimEnd())
    else if (PROMPT.test(l)) cur = [l.trim()]
  }
  if (cur) out.push(cur.join('\n'))
  return out
}

/** Lignes de la section Bonus (indices des lignes concernées, titre exclu). */
function bonusRange(lines: string[]): [number, number] | null {
  const s = lines.findIndex((l) => BONUS_TITLE.test(l))
  if (s < 0) return null
  let e = lines.length
  for (let i = s + 1; i < lines.length; i++) if (isTitle(lines[i])) { e = i; break }
  return [s, e]
}

export function parseSubject(text: string): SubjectInfo {
  const lines = String(text ?? '').split(/\r?\n/)
  const binary = fieldValue(lines, BINARY).value
  const language = fieldValue(lines, LANGUAGE).value
  const repo = fieldValue(lines, REPO).value
  const compilation = fieldValue(lines, COMPILATION).value
  const auth = fieldValue(lines, AUTHORIZED)

  const makefileRules = uniq([...(compilation ?? '').matchAll(/\b(tests_run|fclean|clean|all|re)\b/gi)].map((m) => m[1].toLowerCase()))
  const authorizedFunctions = auth.index >= 0 ? functionsOf(lines, auth.index, auth.value ?? '') : []

  const bonusAt = bonusRange(lines)
  const bonus: string[] = []
  if (bonusAt) {
    for (const l of lines.slice(bonusAt[0] + 1, bonusAt[1])) {
      const t = l.trim().replace(/^[-*•]\s+/, '')
      if (t) bonus.push(t)
      if (bonus.length >= MAX_BONUS) break
    }
  }
  const body = bonusAt ? [...lines.slice(0, bonusAt[0]), ...lines.slice(bonusAt[1])] : lines

  const requirements = uniq(sentences(body, true).filter((s) => MUST.test(s)))
  const errorCode84 = sentences(lines).some((s) => /\b84\b/.test(s) && /exit|return|code|retour|erreur|error/i.test(s))
  const unitTests = /unit test|tests unitaires|criterion|tests_run/i.test(lines.join('\n'))

  const missing: string[] = []
  if (!binary) missing.push('Nom du binaire non trouvé')
  if (!language) missing.push('Langage non trouvé')
  if (!repo) missing.push('Nom du dépôt non trouvé')
  if (!compilation) missing.push('Compilation non trouvée')
  if (authorizedFunctions.length === 0) missing.push('Fonctions autorisées non trouvées')

  return {
    binaryName: binary, language, repoName: repo, compilation, makefileRules,
    authorizedFunctions, forbidden: forbiddenOf(body),
    options: optionsOf(body), requirements, errorCode84, unitTests,
    examples: examplesOf(body), bonus, missing
  }
}
