import { expect, test } from 'vitest'
import { isTeamsUrl, projectKey } from '../../src/shared/projects'

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
