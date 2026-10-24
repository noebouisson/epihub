import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, test } from 'vitest'
import { createIntraService, parseIntraDate, parseTitleLink } from '../../src/main/services/intra'
import { NeedsLoginError, type FetchLike } from '../../src/main/services/types'

const fx = (n: string): string => readFileSync(`tests/fixtures/intra/${n}`, 'utf8')

let serveLoginHtml: boolean
let status: number
const fakeFetch: FetchLike = async (url) => {
  const body = serveLoginHtml ? fx('login.html') : url.includes('/user/') ? fx('user.json') : fx('board.json')
  return { status, ok: status < 400, headers: { get: () => null }, text: async () => body }
}

let intra: ReturnType<typeof createIntraService>
beforeEach(() => {
  serveLoginHtml = false
  status = 200
  intra = createIntraService(fakeFetch)
})

describe('intra helpers', () => {
  test('parseIntraDate en heure locale', () => expect(new Date(parseIntraDate('24/10/2026, 23:42')).getHours()).toBe(23))
  test('parseIntraDate format ISO intranet', () => expect(new Date(parseIntraDate('2026-10-24 08:00:00')).getMinutes()).toBe(0))
  test('parseIntraDate format inconnu → erreur', () => expect(() => parseIntraDate('demain')).toThrow())
  test('parseTitleLink', () => expect(parseTitleLink('/module/2026/G-CPE-100/LYN-0-1/acti-1/project/').moduleCode).toBe('G-CPE-100'))
  test('parseTitleLink sans module → vide', () => {
    expect(parseTitleLink('/planning/')).toEqual({ moduleCode: '', projectCode: '' })
  })
})

describe('intra service', () => {
  test('refresh intranet assemble profil et rendus', async () => {
    const d = await intra.refresh()
    expect(d).toMatchObject({ login: 'jane.doe@epitech.eu', credits: 42, promo: 2028, gpa: '3.42' })
    expect(d.deadlines[0]).toMatchObject({
      id: 'acti-123',
      moduleCode: 'G-CPE-100',
      projectCode: 'c-pool-day-01',
      url: 'https://intra.epitech.eu/module/2026/G-CPE-100/LYN-0-1/acti-123/project/'
    })
    expect(d.deadlines[1]).toMatchObject({ id: 'acti-456', moduleCode: '' })
    expect(d.events[0].title).toBe('Kick-off Piscine')
    expect(d.notifications[0].title).not.toContain('<')
    expect(d.notifications[0].title).toContain('Jean')
  })
  test('page HTML de connexion → NeedsLoginError', async () => {
    serveLoginHtml = true
    await expect(intra.refresh()).rejects.toBeInstanceOf(NeedsLoginError)
  })
  test('statut 403 → NeedsLoginError', async () => {
    status = 403
    await expect(intra.refresh()).rejects.toBeInstanceOf(NeedsLoginError)
  })
})
