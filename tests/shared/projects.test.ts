import { describe, expect, test } from 'vitest'
import { findProject, isTeamsUrl, linkPatch, projectKey, resolveLink } from '../../src/shared/projects'

test('clé : accents, espaces, _ et -', () => expect(projectKey('g-cpe-100', 'Mini Shéll_2 - v')).toBe('G-CPE-100/minishell2v'))
test('clé identique des deux côtés', () => expect(projectKey('B-PSU-100', 'My Sokoban')).toBe(projectKey('B-PSU-100', 'my_sokoban')))
test('lien Teams valide', () => {
  expect(isTeamsUrl('https://teams.microsoft.com/l/chat/19:abc/0')).toBe(true)
  expect(isTeamsUrl('https://teams.cloud.microsoft/l/channel/x')).toBe(true)
})
test('lien Teams refusé', () => {
  for (const u of ['http://teams.microsoft.com/l/chat/x', 'https://evil.com/teams.microsoft.com', 'https://teams.microsoft.com.evil.com/x', 'javascript:alert(1)', ''])
    expect(isTeamsUrl(u)).toBe(false)
})

describe('alias de projet', () => {
  const s = { key: 'G-CPE-100/cpoolday01', aliases: ['G-CPE-100/cpoolday01b', 'G-CPE-100/day01'] }
  test('findProject : par clé canonique ou par alias', () => {
    const list = [{ key: 'X/a', aliases: ['X/a'] }, s]
    expect(findProject(list, 'G-CPE-100/day01')).toBe(s)
    expect(findProject(list, 'G-CPE-100/cpoolday01')).toBe(s)
    expect(findProject(list, 'X/b')).toBeUndefined()
  })
  test('resolveLink : clé canonique d’abord, puis alias dans l’ordre', () => {
    expect(resolveLink({ 'G-CPE-100/day01': 'b', 'G-CPE-100/cpoolday01b': 'a' }, s)).toBe('a')
    expect(resolveLink({ 'G-CPE-100/day01': 'b', 'G-CPE-100/cpoolday01': 'c' }, s)).toBe('c')
    expect(resolveLink({}, s)).toBeNull()
  })
  test('resolveLink : valeur refusée ignorée', () =>
    expect(resolveLink({ 'G-CPE-100/cpoolday01': 'gone', 'G-CPE-100/day01': 'ok' }, s, (v) => v === 'ok')).toBe('ok'))
  test('linkPatch : écrit et retire sous chaque alias, garde les autres liens', () => {
    const written = linkPatch({ 'Y/z': 'keep', 'G-CPE-100/day01': 'old' }, s, 'new')
    expect(written).toEqual({ 'Y/z': 'keep', 'G-CPE-100/cpoolday01': 'new', 'G-CPE-100/cpoolday01b': 'new', 'G-CPE-100/day01': 'new' })
    expect(linkPatch(written, s, null)).toEqual({ 'Y/z': 'keep' })
  })
})
