import { describe, expect, test } from 'vitest'
import type { Deadline, Repo } from '../../src/shared/types'
import { matchRepo, normalize } from '../../src/main/links/repoMatcher'

const d = (o: Partial<Deadline> = {}): Deadline => ({ id: 'acti-1', moduleCode: 'G-CPE-100', projectCode: 'cpoolday01', title: 'Day 01', end: '2026-10-25T23:42:00.000Z', url: 'u', ...o })
const r = (name: string, pushedAt = '2026-10-01T00:00:00Z'): Repo => ({ fullName: `me/${name}`, name, url: `https://github.com/me/${name}`, pushedAt, defaultBranch: 'main' })

describe('normalize', () => {
  test('minuscules, _ et espaces → -', () => expect(normalize('My_Project Name')).toBe('my-project-name'))
})

describe('matchRepo', () => {
  test('correspond sur le code projet', () => expect(matchRepo(d(), [r('foo'), r('CPoolDay01')], {}).repo?.name).toBe('CPoolDay01'))
  test('normalise _ et -', () => expect(matchRepo(d({ projectCode: 'my_sokoban' }), [r('B-PSU-100-my-sokoban')], {}).repo?.name).toBe('B-PSU-100-my-sokoban'))
  test('formes compactes : tirets ignorés (R1)', () => expect(matchRepo(d({ projectCode: 'c-pool-day-01' }), [r('cpoolday01')], {}).repo?.name).toBe('cpoolday01'))
  test('égalité → le plus récent', () => expect(matchRepo(d(), [r('cpoolday01-old', '2026-01-01T00:00:00Z'), r('cpoolday01', '2026-10-20T00:00:00Z')], {}).repo?.name).toBe('cpoolday01'))
  test('le lien manuel l’emporte', () => expect(matchRepo(d(), [r('cpoolday01'), r('autre')], { 'acti-1': 'me/autre' })).toEqual({ repo: r('autre'), manual: true }))
  test('lien manuel vers un repo disparu → auto', () => expect(matchRepo(d(), [r('cpoolday01')], { 'acti-1': 'me/supprime' }).repo?.name).toBe('cpoolday01'))
  test('aucun code → null sans planter', () => expect(matchRepo(d({ projectCode: '', moduleCode: '' }), [r('x')], {}).repo).toBeNull())
  test('aucun repo → null', () => expect(matchRepo(d(), [], {}).repo).toBeNull())
  test('résultat auto : manual=false', () => expect(matchRepo(d(), [r('cpoolday01')], {}).manual).toBe(false))
})
