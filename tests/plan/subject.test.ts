import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseSubject } from '../../src/main/plan/subject'

const read = (f: string) => readFileSync(join(__dirname, '../fixtures/subjects', f), 'utf8')
const en = parseSubject(read('my_ls_en.txt'))

test('champs clé', () => expect(en).toMatchObject({ binaryName: 'my_ls', language: 'C', repoName: 'B-PSU-100-my_ls' }))
test('compilation et règles Makefile', () => {
  expect(en.compilation).toBe('via Makefile, including re, clean and fclean rules')
  expect(en.makefileRules).toEqual(['re', 'clean', 'fclean'])
})
test('fonctions autorisées sur plusieurs lignes', () => {
  expect(en.authorizedFunctions).toContain('opendir')
  expect(en.authorizedFunctions).toContain('exit')
  expect(en.authorizedFunctions).toHaveLength(16)
})
test('fonctions interdites', () => expect(en.forbidden).toEqual(['printf']))
test('options dans l’ordre, avec description', () => {
  expect(en.options.map((o) => o.flag)).toEqual(['-a', '-l', '-R', '-d', '-r', '-t'])
  expect(en.options[1].description).toBe('use a long listing format')
})
test('les lignes de sortie d’exemple ne sont pas des options', () => expect(en.options.some((o) => o.flag.startsWith('-rw'))).toBe(false))
test('84, tests unitaires, exemples, bonus', () => {
  expect(en.errorCode84).toBe(true)
  expect(en.unitTests).toBe(true)
  expect(en.examples).toHaveLength(2)
  expect(en.examples[0].split('\n')[0]).toBe('∼/B-PSU-100> ./my_ls -l')
  expect(en.bonus).toHaveLength(3)
  expect(en.bonus[1]).toBe('Support the -h option for human readable sizes.')
})
test('exigences « must »', () => {
  expect(en.requirements.some((r) => /must/i.test(r))).toBe(true)
  expect(en.requirements.some((r) => /should sort/i.test(r))).toBe(true)
  expect(en.requirements.some((r) => /colors/i.test(r))).toBe(false)
})
test('exigence sur plusieurs lignes recomposée', () => expect(en.requirements[0]).toBe('Your program must list the content of the given directories, or of the current directory when no argument is given.'))
test('rien ne manque sur le sujet complet', () => expect(en.missing).toEqual([]))
test('français', () => {
  const fr = parseSubject(read('extrait_fr.txt'))
  expect(fr).toMatchObject({ binaryName: 'my_sudo', language: 'C', errorCode84: true })
  expect(fr.authorizedFunctions).toEqual(['setuid', 'setgid', 'execvp', 'getpwnam', 'crypt', 'getpass'])
  expect(fr.requirements.some((r) => /doit vérifier/.test(r))).toBe(true)
  expect(fr.options).toEqual([])
  expect(fr.missing).toContain('Nom du dépôt non trouvé')
})
test('texte vide → tout manquant, sans plantage', () => {
  const e = parseSubject('')
  expect(e.binaryName).toBeNull()
  expect(e.missing.length).toBeGreaterThanOrEqual(4)
  expect(e).toMatchObject({ options: [], examples: [], bonus: [], errorCode84: false, unitTests: false })
})
test('le texte reste brut', () => expect(parseSubject('Binary name: <script>x</script>').binaryName).toBe('<script>x</script>'))
test('84 seul sans contexte d’erreur est ignoré', () => expect(parseSubject('The file has 84 lines.').errorCode84).toBe(false))
test('options : dédupliquées, formes longues, séparateur', () => {
  const o = parseSubject('-l  long\n--all - show all\n-l  again\n- not an option\n-rw-r--r-- 1 x').options
  expect(o).toEqual([{ flag: '-l', description: 'long' }, { flag: '--all', description: 'show all' }])
})
test('bonus : arrêt au titre suivant et limite 30', () => {
  expect(parseSubject('Bonus\nA\nB\nREADME\nC').bonus).toEqual(['A', 'B'])
  const many = 'Bonus\n' + Array.from({ length: 40 }, (_, i) => `ligne ${i}`).join('\n')
  expect(parseSubject(many).bonus).toHaveLength(30)
})

test('interdits : liste après deux-points, jamais de mots courants', () => {
  expect(parseSubject('The use of the following functions is forbidden: printf, puts.').forbidden).toEqual(['printf', 'puts'])
  expect(parseSubject('Forbidden functions: `foo`, bar(), my_func').forbidden).toEqual(['foo', 'bar', 'my_func'])
  expect(parseSubject('Les fonctions printf et puts sont interdites.').forbidden).toEqual(['printf', 'puts'])
  expect(parseSubject('printf is forbidden: use write instead.').forbidden).toEqual(['printf'])
})
test('interdits : « Global variables are forbidden » → aucune fonction, mais une exigence', () => {
  for (const t of ['Global variables are forbidden.', 'Les variables globales sont interdites.']) {
    const i = parseSubject(t)
    expect(i.forbidden).toEqual([])
    expect(i.requirements).toEqual([t])
  }
})
test('bonus numéroté conservé', () => {
  expect(parseSubject('Bonus\n1. Colors\n2. Sizes').bonus).toEqual(['1. Colors', '2. Sizes'])
  expect(parseSubject('Bonus\n1. Handle colors.\n\n2. Show sizes.').bonus).toEqual(['1. Handle colors.', '2. Show sizes.'])
  // la suite de la numérotation n'est jamais un titre
  expect(parseSubject('Bonus\n1. Colors\n2. Output Format\n\nSome text.').bonus).toEqual(['1. Colors', '2. Output Format', 'Some text.'])
  // un titre numéroté qui ne suit pas la liste ferme la section
  expect(parseSubject('Bonus\n1. Colors\n\n3. Output Format\n\nSome text.').bonus).toEqual(['1. Colors'])
})
test('bonus : fin au titre en majuscules ou # mais pas aux lignes ordinaires', () => {
  expect(parseSubject('Bonus\nA\nB\n\nEXAMPLES\nC').bonus).toEqual(['A', 'B'])
  expect(parseSubject('Bonus\nA\n## Notes\nC').bonus).toEqual(['A'])
  expect(parseSubject('Bonus\nHandle Colors\nEXTRA FEATURE.').bonus).toEqual(['Handle Colors', 'EXTRA FEATURE.'])
})
test('options : formes -l, --long, puces, drapeau seul', () => {
  const o = parseSubject('-l, --long   long format\n* -a  all entries\n• -r reverse\n-t\nsort by time\n--human-readable  sizes').options
  expect(o).toEqual([
    { flag: '-l', description: '--long: long format' },
    { flag: '-a', description: 'all entries' },
    { flag: '-r', description: 'reverse' },
    { flag: '-t', description: 'sort by time' },
    { flag: '--human-readable', description: 'sizes' }
  ])
})
test('fonctions écrites name()', () => expect(parseSubject('Authorized functions: open(), read(), close()').authorizedFunctions).toEqual(['open', 'read', 'close']))
test('un bloc d’exemple n’est jamais fondu dans une phrase', () => {
  const i = parseSubject('The program must work\n\n~/x> ./a\nok\nmust not appear\n\nIt should end.')
  expect(i.requirements).toEqual(['The program must work', 'It should end.'])
  expect(i.examples).toEqual(['~/x> ./a\nok\nmust not appear'])
})

test('interdits : un nom de la libc courant seul n’est pas une fonction', () => {
  for (const t of ['Any use of time is forbidden.', 'Free software is forbidden.', 'free software is forbidden.', 'Global_variables are forbidden.']) expect(parseSubject(t).forbidden).toEqual([])
  expect(parseSubject('printf, puts and write are forbidden.').forbidden).toEqual(['printf', 'puts', 'write'])
  expect(parseSubject('Les fonctions printf et write sont interdites.').forbidden).toEqual(['printf', 'write'])
  expect(parseSubject('Forbidden: free.').forbidden).toEqual(['free'])
  expect(parseSubject('The use of time() is forbidden.').forbidden).toEqual(['time'])
  expect(parseSubject('The function my_strlen is forbidden.').forbidden).toEqual(['my_strlen'])
})
test('bonus numéroté en majuscules conservé', () => {
  expect(parseSubject('Bonus\n1. COLORS\n2. SIZES').bonus).toEqual(['1. COLORS', '2. SIZES'])
  expect(parseSubject('Bonus\n1. COLORS\n\n2. SIZES\n\nEXAMPLES\nx').bonus).toEqual(['1. COLORS', '2. SIZES'])
  expect(parseSubject('Bonus\n3. COLORS\n4. SIZES').bonus).toEqual(['3. COLORS', '4. SIZES'])
})
