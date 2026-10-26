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
