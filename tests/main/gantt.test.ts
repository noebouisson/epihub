import { describe, expect, test } from 'vitest'
import { buildGantt, fromMyEpitech, ganttLayout, mergeGantt, parseCsv, parseDate } from '../../src/shared/gantt'
import type { MyProject } from '../../src/shared/types'

describe('parseCsv', () => {
  test('guillemets, virgules et retours à la ligne', () => {
    const rows = parseCsv('﻿Projet,Avec\r\n"a, b","dit ""oui""\nfin"\r\n')
    expect(rows).toEqual([{ Projet: 'a, b', Avec: 'dit "oui"\nfin' }])
  })
  test('lignes vides ignorées', () => expect(parseCsv('A,B\n\n1,2\n\n')).toEqual([{ A: '1', B: '2' }]))
  test('fichier vide', () => expect(parseCsv('')).toEqual([]))
})

describe('parseDate', () => {
  test.each([
    ['2026-11-02', '2026-11-02'],
    ['2026/11/13', '2026-11-13'],
    ['02/11/2026', '2026-11-02'],
    ['11/13/2026', '2026-11-13'],
    ['Nov 2, 2026', '2026-11-02'],
    ['2 nov. 2026', '2026-11-02'],
    ['Friday, November 13, 2026', '2026-11-13'],
    ['13 décembre 2026', '2026-12-13'],
    ['Nov 2, 2026 → Nov 13, 2026', '2026-11-02']
  ])('%s', (input, out) => expect(parseDate(input)).toBe(out))
  test('vide → null', () => expect(parseDate('  ')).toBeNull())
  test('illisible → undefined', () => expect(parseDate('bientôt')).toBeUndefined())
  test('date impossible → undefined', () => expect(parseDate('2026-02-31')).toBeUndefined())
})

const CSV = `Projet,Statut,Début,Fin,Catégorie,Module,Avec,Dates à vérifier
my_ls,En cours,2026-11-02,,Epitech,G-PSU-100,,Yes
SettingUp,En cours,2026-11-02,2026-11-13,Epitech,G-CPE-110,,No
Vieux,Rendu,2026-10-01,2026-10-10,Epitech,,,
Sans début,À faire,,2026-12-01,Perso,,,
101pong,À faire,2026-11-02,bientôt,Epitech,,Baptiste Orta,Yes`

describe('buildGantt', () => {
  const g = buildGantt(CSV)
  test('ignore les projets rendus', () => expect(g.projects.map((p) => p.name)).not.toContain('Vieux'))
  test('projets sans début mis de côté', () => expect(g.skipped).toEqual(['Sans début']))
  test('dates illisibles signalées', () => expect(g.unreadable).toEqual(['bientôt']))
  test('en cours d’abord, puis par date de rendu', () => expect(g.projects.map((p) => p.name)).toEqual(['SettingUp', 'my_ls', '101pong']))
  test('champs lus', () => expect(g.projects[0]).toEqual({ name: 'SettingUp', status: 'En cours', start: '2026-11-02', end: '2026-11-13', category: 'Epitech', module: 'G-CPE-110', with: '', verify: false, source: 'csv', key: null }))
  test('colonnes sans accents ni casse', () => expect(buildGantt('projet,statut,debut\nA,En cours,2026-11-02').projects[0].start).toBe('2026-11-02'))
})

describe('ganttLayout', () => {
  const { projects } = buildGantt(CSV)
  const l = ganttLayout(projects, '2026-11-09')
  test('commence 2 jours avant le premier début', () => expect(l.start).toBe('2026-10-31'))
  test('aujourd’hui placé dans la plage', () => expect(l.today).toBe(9))
  test('au moins 3 semaines après aujourd’hui', () => expect(l.days).toBeGreaterThanOrEqual(9 + 21))
  test('barre fermée : du début au rendu inclus', () => expect(l.bars[0]).toMatchObject({ from: 2, span: 12, open: false, left: 4 }))
  test('barre ouverte : jusqu’à aujourd’hui + 7', () => expect(l.bars[1]).toMatchObject({ from: 2, span: 15, open: true, left: null }))
})

const my = (name: string, start: string, end: string, unitCode = 'G-CPE-110'): MyProject =>
  ({ id: name, name, unitCode, unitName: '', description: '', start: `${start}T10:00:00.000Z`, end: `${end}T16:00:00.000Z`, url: '' })

describe('fromMyEpitech', () => {
  const list = fromMyEpitech([
    my('SettingUp', '2026-10-24', '2026-11-13'),
    my('my_ls', '2026-10-24', '2026-11-06', 'G-PSU-100'),
    my('my_sudo', '2026-11-14', '2026-12-04', 'G-PSU-100'),
    my('Student Engagement', '2026-09-01', '2027-08-31', 'S-EPI-000'),
    { ...my('Cassé', '2026-11-01', '2026-11-30'), end: '' }
  ], '2026-11-09')
  test('garde les projets pas encore finis, sans les inscriptions longues', () => expect(list.map((p) => p.name)).toEqual(['SettingUp', 'my_sudo']))
  test('statut selon le début', () => expect(list.map((p) => p.status)).toEqual(['En cours', 'À venir']))
  test('dates et clé EpiHub', () => expect(list[0]).toMatchObject({ start: '2026-10-24', end: '2026-11-13', module: 'G-CPE-110', source: 'myepitech', key: 'G-CPE-110/settingup' }))
  test('rendu le jour même encore affiché', () => expect(fromMyEpitech([my('X', '2026-11-01', '2026-11-09')], '2026-11-09')).toHaveLength(1))
})

describe('mergeGantt', () => {
  test('le CSV n’ajoute que les projets hors Epitech', () => {
    const csv = buildGantt('Projet,Statut,Début,Catégorie\nSettingUp,En cours,2026-11-02,Epitech\nPortfolio,En cours,2026-11-01,Perso').projects
    const merged = mergeGantt(fromMyEpitech([my('SettingUp', '2026-10-24', '2026-11-13')], '2026-11-09'), csv)
    expect(merged.map((p) => `${p.name}:${p.source}`)).toEqual(['SettingUp:myepitech', 'Portfolio:csv'])
  })
})
