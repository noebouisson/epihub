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
const FLAG_PAIR = /^\s*(-[A-Za-z]{1,2}),\s*(--[A-Za-z][A-Za-z0-9-]+)(?:\s*[:–—-]?\s+(\S.*))?$/
const BARE_FLAG = /^\s*(?:[*•·]\s+)?(--[A-Za-z][A-Za-z0-9-]+|-[A-Za-z]{1,2})\s*$/
const BULLET = /^\s*[*•·]\s+(?=-)/
const PROMPT = /^\s*(?:[>$]|[∼~]\/)/
const BONUS_TITLE = /^\s*(?:#+\s*|\d+(?:\.\d+)*[.)]?\s+)?(?:partie\s+)?bonus(?:es)?(?:\s+part)?\s*:?\s*$/i
const MUST = /\b(must|should|have to|has to|doit|doivent|il faut)\b/i
const TRIGGER = /forbidden|interdit/i
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/
const MAX_BONUS = 30

/** Fonctions C courantes : seules celles-ci (ou `nom()`, `nom` entre accents graves, ou avec `_`) comptent comme fonctions interdites. */
const LIBC = new Set(('printf fprintf sprintf snprintf dprintf vprintf vfprintf vsprintf scanf fscanf sscanf puts putchar fputs gets fgets getchar getline ' +
  'malloc calloc realloc free write read open close lseek stat lstat fstat strlen strcpy strncpy strcat strncat strcmp strncmp strdup strchr strrchr strstr strtok ' +
  'memset memcpy memmove memcmp system exec execl execlp execle execv execvp execve fork wait waitpid kill signal atoi atol atof strtol qsort ' +
  'exit abort sleep usleep fopen fclose fread fwrite fflush perror strerror time ctime opendir readdir closedir getenv setenv pipe dup dup2 ' +
  'pthread_create mmap munmap isalpha isdigit toupper tolower').split(' '))

/** Noms de la libc qui sont aussi des mots courants : acceptés seulement en liste (voir `cFunctions`). */
const COMMON = new Set('free time system read write open close exit wait signal sleep kill pipe dup stat exec fork abort getline access link select'.split(' '))

const isTitle = (l: string): boolean => {
  const t = l.trim()
  if (/^#+\s+\S/.test(t) || /^\d+(\.\d+)*[.)]?\s+\S/.test(t)) return true
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '')
  return letters.length >= 3 && t.length <= 40 && t === t.toUpperCase()
}

/** Vrai titre de section (fin de la partie Bonus) : `#`, MAJUSCULES sans ponctuation finale, ou titre numéroté court suivi d'une ligne vide. */
function isSectionTitle(lines: string[], i: number): boolean {
  const t = lines[i].trim()
  if (/^#+\s+\S/.test(t)) return true
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '')
  if (letters.length >= 3 && t.length <= 40 && t === t.toUpperCase() && !/[.:;,!?]$/.test(t)) return true
  const m = /^\d+(?:\.\d+)*[.)]?\s+(\S.*)$/.exec(t)
  if (!m || lines[i + 1] === undefined || lines[i + 1].trim() !== '' || /[.:;,!?]/.test(m[1])) return false
  const words = m[1].split(/\s+/)
  return words.length <= 6 && words.every((w) => w.length <= 3 || /^[A-ZÀ-Ý]/.test(w)) && /^[A-ZÀ-Ý]/.test(words[0])
}

const optionOf = (l: string): { flag: string; description: string } | null => {
  const s = l.replace(BULLET, '')
  const p = FLAG_PAIR.exec(s)
  if (p) return { flag: p[1], description: p[3] ? `${p[2]}: ${p[3].trim()}` : p[2] }
  const m = FLAG.exec(s)
  return m ? { flag: m[1], description: m[2].trim() } : null
}
const isOptionLine = (l: string): boolean => optionOf(l) !== null || BARE_FLAG.test(l)

/** Lignes d'un bloc d'exemple : de l'invite jusqu'à la ligne vide suivante. */
function exampleMask(lines: string[]): boolean[] {
  let inside = false
  return lines.map((l) => {
    if (l.trim() === '') { inside = false; return false }
    if (PROMPT.test(l)) inside = true
    return inside
  })
}

/** Regroupe les lignes d'une même phrase (retour à la ligne du PDF) ; invites, exemples, options, titres et champs restent seuls. */
function paragraphs(lines: string[], skipSpecial = false): string[] {
  const out: string[] = []
  const mask = exampleMask(lines)
  let cur: string | null = null
  const flush = () => { if (cur) out.push(cur); cur = null }
  lines.forEach((l, i) => {
    const t = l.trim()
    const special = mask[i] || isOptionLine(l)
    if (t === '' || special || isTitle(l) || FIELD_START.test(l)) {
      flush()
      if (t !== '' && !(special && skipSpecial)) out.push(t)
      return
    }
    cur = cur !== null && !/[.:;!?]$/.test(cur) ? `${cur} ${t}` : (flush(), t)
  })
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
    const t = raw.replace(/\.$/, '').replace(/\(\)$/, '')
    if (IDENT.test(t)) out.push(t)
  }
  return uniq(out)
}

const CONNECTOR = new Set(['and', 'et', 'or', 'ou', '&'])
const STRONG_UNDERSCORE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/

/**
 * Noms de fonctions C d'un morceau de phrase. Toujours acceptés : `nom()`, `nom` entre accents graves, identifiants en minuscules avec `_`.
 * Un nom de la libc qui est aussi un mot courant (free, time, read…) n'est accepté qu'en liste : après un deux-points, ou dans une suite de 2 noms ou plus (virgules, and, et).
 */
function cFunctions(side: string): string[] {
  const colon = side.indexOf(':')
  type W = { name: string | null; strong: boolean; connector: boolean; afterColon: boolean }
  const words: W[] = [...side.matchAll(/\S+/g)].map((m) => {
    const t = m[0].replace(/^[("'“]+/, '').replace(/[.:,;"'”]+$/, '')
    const id = /^(`?)([A-Za-z_][A-Za-z0-9_]*)(\(\))?\1$/.exec(t)
    const name = id ? id[2] : null
    const strong = !!id && (!!id[1] || !!id[3] || STRONG_UNDERSCORE.test(id[2]) || (LIBC.has(id[2]) && !COMMON.has(id[2])))
    const bare = !!name && !strong && LIBC.has(name)
    return { name: strong || bare ? name : null, strong, connector: CONNECTOR.has(t.toLowerCase()), afterColon: colon >= 0 && (m.index ?? 0) > colon }
  })
  const out: string[] = []
  let i = 0
  while (i < words.length) {
    if (words[i].name === null) { i++; continue }
    let j = i
    let last = i
    while (j < words.length && (words[j].name !== null || words[j].connector)) { if (words[j].name !== null) last = j; j++ }
    const run = words.slice(i, last + 1).filter((w) => w.name !== null)
    for (const w of run) if (w.strong || run.length >= 2 || w.afterColon) out.push(w.name!)
    i = j
  }
  return out
}

/** Fonctions citées dans une phrase interdisant quelque chose : avant le mot déclencheur, à défaut après (« interdit : printf, puts »). */
function forbiddenIn(s: string): string[] {
  const m = TRIGGER.exec(s)
  if (!m) return []
  const before = cFunctions(s.slice(0, m.index))
  return before.length > 0 ? before : cFunctions(s.slice(m.index + m[0].length))
}

function optionsOf(lines: string[]): { flag: string; description: string }[] {
  const seen = new Set<string>()
  const out: { flag: string; description: string }[] = []
  const mask = exampleMask(lines)
  const add = (flag: string, description: string) => {
    if (seen.has(flag)) return
    seen.add(flag)
    out.push({ flag, description })
  }
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue
    const o = optionOf(lines[i])
    if (o) { add(o.flag, o.description); continue }
    const b = BARE_FLAG.exec(lines[i])
    const next = lines[i + 1]
    if (b && next && next.trim() !== '' && !isOptionLine(next) && !PROMPT.test(next) && !isTitle(next)) {
      add(b[1], next.trim())
      i++
    }
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
  let lastNum: number | null = null
  for (let i = s + 1; i < lines.length; i++) {
    // Règle de numérotation d'abord : la première ligne numérotée, ou le numéro suivant, est un élément de liste (jamais un titre).
    const n = /^(\d+)(?:\.\d+)*[.)]?\s+\S/.exec(lines[i].trim())
    if (n && (lastNum === null || Number(n[1]) === lastNum + 1)) { lastNum = Number(n[1]); continue }
    if (isSectionTitle(lines, i)) { e = i; break }
    if (n) lastNum = Number(n[1])
  }
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

  const sents = sentences(body, true)
  const forbidden = uniq(sents.flatMap(forbiddenIn))
  // Une interdiction sans fonction nommée (« Global variables are forbidden. ») reste une exigence, en texte.
  const requirements = uniq(sents.filter((s) => MUST.test(s) || (TRIGGER.test(s) && forbiddenIn(s).length === 0)))
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
    authorizedFunctions, forbidden,
    options: optionsOf(body), requirements, errorCode84, unitTests,
    examples: examplesOf(body), bonus, missing
  }
}
