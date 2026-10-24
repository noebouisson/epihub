import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, test } from 'vitest'
import { createIntraService, parseIntraDate, parseTitleLink } from '../../src/main/services/intra'
import { NeedsLoginError, type FetchLike } from '../../src/main/services/types'

const fx = (n: string): string => readFileSync(`tests/fixtures/intra/${n}`, 'utf8')

let serveLoginHtml: boolean
let boardOverride: string | null
let status: number
const fakeFetch: FetchLike = async (url) => {
  const body = serveLoginHtml
    ? fx('login.html')
    : url.includes('/file/')
      ? fx('project-files.json')
      : url.includes('/project/')
        ? fx('project.json')
        : url.includes('/user/') ? fx('user.json')
          : (boardOverride ?? fx('board.json'))
  return { status, ok: status < 400, headers: { get: () => null }, text: async () => body }
}

let intra: ReturnType<typeof createIntraService>
beforeEach(() => {
  serveLoginHtml = false
  boardOverride = null
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
  test('entités : invalides laissées telles quelles, hexadécimales décodées, refresh intact', async () => {
    const titles = ['a &#1114112; b', 'a &constructor; &__proto__; b', 'l&#x27;&#xE9;']
    boardOverride = JSON.stringify({
      board: { projets: [], activites: [] },
      history: titles.map((title, i) => ({ id: i, title, date: '2026-10-24 08:00:00' }))
    })
    const n = (await intra.refresh()).notifications.map((x) => x.title)
    expect(n).toEqual(['a &#1114112; b', 'a &constructor; &__proto__; b', "l'é"])
  })
  test('page HTML de connexion → NeedsLoginError', async () => {
    serveLoginHtml = true
    await expect(intra.refresh()).rejects.toBeInstanceOf(NeedsLoginError)
  })
  test('statut 403 → NeedsLoginError', async () => {
    status = 403
    await expect(intra.refresh()).rejects.toBeInstanceOf(NeedsLoginError)
  })
  test('projets présents mais aucune date lisible → erreur explicite', async () => {
    boardOverride = JSON.stringify({ board: { projets: [{ title: 'X', title_link: '/planning/', timeline_end: 'demain', id_activite: '1' }], activites: [] }, history: [] })
    await expect(intra.refresh()).rejects.toThrow('Format de date intranet inconnu')
  })
  test('aucun projet → pas d’erreur', async () => {
    boardOverride = JSON.stringify({ board: { projets: [], activites: [] }, history: [] })
    expect((await intra.refresh()).deadlines).toEqual([])
  })
})

const PROJECT_URL = 'https://intra.epitech.eu/module/2026/G-CPE-100/LYN-0-1/acti-123/project/'
describe('intra projectDetails', () => {
  test('projectDetails : description sans balises et fichiers absolus', async () => {
    const s = await intra.projectDetails(PROJECT_URL)
    expect(s.description).not.toContain('<p>')
    expect(s.description).not.toContain('&nbsp;')
    expect(s.description).toBe('Écrire cinq fonctions en C & <stdio.h> "ok" l\'aé. my_putchar')
    expect(s.files[0].url).toBe('https://intra.epitech.eu/module/2026/G-CPE-100/LYN-0-1/acti-123/project/file/sujet.pdf')
    expect(s.files.every((f) => f.url.startsWith('https://intra.epitech.eu/'))).toBe(true) // fullpath relatif ignoré
    expect(s.files).toHaveLength(1)
  })
  test('projectDetails : URLs demandées', async () => {
    const urls: string[] = []
    const f: FetchLike = async (url) => {
      urls.push(url)
      return { status: 200, ok: true, headers: { get: () => null }, text: async () => (url.includes('/file/') ? '[]' : fx('project.json')) }
    }
    await createIntraService(f).projectDetails(PROJECT_URL)
    expect(urls.sort()).toEqual([PROJECT_URL + '?format=json', PROJECT_URL + 'file/?format=json'].sort())
  })
  test('projectDetails : hôte déguisé refusé', async () => {
    await expect(intra.projectDetails('https://intra.epitech.eu.evil.com/x')).rejects.toThrow('URL intranet invalide')
  })
  test('projectDetails : URL hors intranet refusée', async () => {
    await expect(intra.projectDetails('https://evil.com/x')).rejects.toThrow('URL intranet invalide')
  })
  test('projectDetails : page de connexion → NeedsLoginError', async () => {
    serveLoginHtml = true
    await expect(intra.projectDetails(PROJECT_URL)).rejects.toBeInstanceOf(NeedsLoginError)
  })
  test('projectDetails : fichiers non tableau → []', async () => {
    const f: FetchLike = async (url) => ({
      status: 200, ok: true, headers: { get: () => null },
      text: async () => (url.includes('/file/') ? '{"a":1}' : fx('project.json'))
    })
    expect((await createIntraService(f).projectDetails(PROJECT_URL)).files).toEqual([])
  })
})
