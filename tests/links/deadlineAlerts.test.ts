import { describe, expect, test } from 'vitest'
import type { Commit, Deadline, DeadlineView, Repo } from '../../src/shared/types'
import { alertKey, alertLevel, buildDeadlineViews } from '../../src/main/links/deadlineAlerts'

const now = new Date('2026-10-24T12:00:00Z')
const h = (n: number) => new Date(now.getTime() + n * 3600e3)
const c = (hoursAgo: number): Commit => ({ sha: 's', message: 'm', author: 'a', date: h(-hoursAgo).toISOString(), url: 'u' })
const dl = (id: string, end: Date, o: Partial<Deadline> = {}): Deadline => ({ id, moduleCode: 'G-CPE-100', projectCode: `proj-${id}`, title: id, end: end.toISOString(), url: 'u', ...o })
const view: DeadlineView = { ...dl('x', h(1)), repo: null, lastCommit: null, alert: null, manual: false }
const repo = (name: string): Repo => ({ fullName: `me/${name}`, name, url: 'u', pushedAt: '2026-10-01T00:00:00Z', defaultBranch: 'main' })

describe('alertLevel', () => {
  test('> 48 h → aucune', () => expect(alertLevel(h(49), null, false, now)).toBeNull())
  test('< 48 h sans repo → warning', () => expect(alertLevel(h(30), null, false, now)).toBe('warning'))
  test('< 48 h, commit récent → aucune', () => expect(alertLevel(h(30), c(2), true, now)).toBeNull())
  test('< 48 h, commit vieux de 25 h → warning', () => expect(alertLevel(h(30), c(25), true, now)).toBe('warning'))
  test('< 6 h, sans commit → urgent', () => expect(alertLevel(h(5), null, true, now)).toBe('urgent'))
  test('date passée → aucune', () => expect(alertLevel(h(-1), null, false, now)).toBeNull())
  test('bornes : exactement 48 h → aucune, exactement 6 h → warning', () => {
    expect(alertLevel(h(48), null, false, now)).toBeNull()
    expect(alertLevel(h(6), null, false, now)).toBe('warning')
  })
  test('commit vieux d’exactement 24 h → pas d’alerte', () => expect(alertLevel(h(30), c(24), true, now)).toBeNull())
})

describe('buildDeadlineViews', () => {
  test('exclut le passé et trie', () => {
    const v = buildDeadlineViews([dl('b', h(10)), dl('past', h(-2)), dl('a', h(3))], [], {}, {}, now)
    expect(v.map((x) => x.id)).toEqual(['a', 'b'])
    expect(v[0].alert).toBe('urgent')
  })
  test('repo lié avec commit récent → pas d’alerte', () => {
    const v = buildDeadlineViews([dl('a', h(10), { projectCode: 'foo' })], [repo('foo')], { 'me/foo': c(1) }, {}, now)
    expect(v[0]).toMatchObject({ repo: repo('foo'), lastCommit: c(1), alert: null, manual: false })
  })
  test('repo lié sans commit connu → alerte', () => {
    const v = buildDeadlineViews([dl('a', h(10), { projectCode: 'foo' })], [repo('foo')], {}, {}, now)
    expect(v[0].lastCommit).toBeNull()
    expect(v[0].alert).toBe('warning')
  })
  test('lien manuel signalé', () => {
    const v = buildDeadlineViews([dl('a', h(30))], [repo('z')], { 'me/z': c(1) }, { a: 'me/z' }, now)
    expect(v[0].manual).toBe(true)
  })
})

describe('alertKey', () => {
  test('dépend du niveau', () => expect(alertKey({ ...view, id: 'mye-1', alert: 'urgent' })).toBe('myepitech:deadline:mye-1:urgent'))
  test('sans alerte → null', () => expect(alertKey(view)).toBeNull())
})
