import { describe, expect, test } from 'vitest'
import type { GithubData, IntraData, Repo } from '../../src/shared/types'
import { buildSearchItems, search } from '../../src/main/links/searchIndex'

const intraEmpty: IntraData = { login: 'me', promo: 2028, credits: 0, gpa: '0', deadlines: [], events: [], notifications: [] }
const ghEmpty: GithubData = { login: 'me', notifications: [], reviewRequests: [], assignedIssues: [], repos: [] }
const repo = (name: string, pushedAt = '2026-10-01T00:00:00Z'): Repo => ({ fullName: `me/${name}`, name, url: `https://github.com/me/${name}`, pushedAt, defaultBranch: 'main' })

describe('buildSearchItems', () => {
  test('les pages fixes sont toujours présentes', () => {
    const items = buildSearchItems({})
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining(['page:home', 'page:github', 'page:intra', 'page:myepitech', 'page:teams', 'page:settings']))
    expect(items.find((i) => i.id === 'page:intra')?.title).toBe('Intranet')
  })
  test('ids et sous-titre des éléments', () => {
    const items = buildSearchItems({
      github: { ...ghEmpty, repos: [repo('r')], reviewRequests: [{ id: 7, title: 'Fix', repo: 'me/r', url: 'u', updatedAt: '2026-10-02T00:00:00Z', kind: 'pr' }], assignedIssues: [{ id: 9, title: 'Bug', repo: 'me/r', url: 'u', updatedAt: '2026-10-02T00:00:00Z', kind: 'issue' }] },
      intra: { ...intraEmpty, deadlines: [{ id: 'acti-1', moduleCode: 'G-CPE-100', projectCode: 'cpoolday01', title: 'Day 01', end: '2026-10-25T00:00:00Z', url: 'x' }] }
    })
    const ids = items.map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['repo:me/r', 'pr:7', 'issue:9', 'deadline:acti-1']))
    expect(items.find((i) => i.id === 'deadline:acti-1')?.subtitle).toBe('G-CPE-100 · cpoolday01')
  })
  test('les éléments retournés n’exposent pas `codes`', () => {
    expect(buildSearchItems({ github: { ...ghEmpty, repos: [repo('r')] } }).every((i) => !('codes' in i))).toBe(true)
  })
  test('snapshot null toléré', () => expect(buildSearchItems({ github: null, intra: null }).length).toBe(6))
})

describe('projets', () => {
  const summary = { key: 'G-CPE-100/cpoolday01', title: 'Day 01', moduleCode: 'G-CPE-100', deadline: null, lastResult: null, repo: null, teamsUrl: null, status: 'en-cours' } as const
  test('recherche : élément projet', () => {
    const items = buildSearchItems({}, [summary])
    expect(search(items, 'cpoolday')[0].id).toBe('project:G-CPE-100/cpoolday01')
    expect(items.find((i) => i.kind === 'project')).toMatchObject({ title: 'Day 01', subtitle: 'G-CPE-100', service: 'app', url: '' })
  })
})

describe('search', () => {
  test('trouve un rendu par code module', () => {
    const items = buildSearchItems({ intra: { ...intraEmpty, deadlines: [{ id: 'acti-1', moduleCode: 'G-CPE-100', projectCode: 'cpoolday01', title: 'Day 01', end: '2026-10-25T00:00:00Z', url: 'https://intra.epitech.eu/x' }] } })
    expect(search(items, 'cpe100')[0].id).toBe('deadline:acti-1')
  })
  test('trouve avec tirets / underscores dans la requête', () => {
    const items = buildSearchItems({ github: { ...ghEmpty, repos: [repo('my_sokoban')] } })
    expect(search(items, 'my sokoban')[0].id).toBe('repo:me/my_sokoban')
  })
  test('tolère une faute de frappe', () => expect(search(buildSearchItems({ github: { ...ghEmpty, repos: [repo('my_sokoban')] } }), 'sokoban')[0].id).toBe('repo:me/my_sokoban'))
  test('requête vide → pages fixes', () => expect(search(buildSearchItems({}), '').every((i) => i.kind === 'page')).toBe(true))
  test('requête de ponctuation seule → pages fixes', () => expect(search(buildSearchItems({}), ' - ').every((i) => i.kind === 'page')).toBe(true))
  test('limite respectée', () => expect(search(buildSearchItems({ github: { ...ghEmpty, repos: [repo('abc1'), repo('abc2'), repo('abc3')] } }), 'abc', 2)).toHaveLength(2))
  test('score égal → le plus récent d’abord', () => {
    const dd = (id: string, end: string) => ({ id, moduleCode: 'G-CPE-100', projectCode: 'pool', title: 'Day', end, url: 'u' })
    const items = buildSearchItems({ intra: { ...intraEmpty, deadlines: [dd('old', '2026-01-01T00:00:00Z'), dd('new', '2026-10-01T00:00:00Z')] } })
    expect(search(items, 'day').map((i) => i.id)).toEqual(['deadline:new', 'deadline:old'])
  })
})
