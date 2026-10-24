import { beforeEach, expect, test } from 'vitest'
import type { ServiceId } from '../../src/shared/types'
import { createNotificationHub } from '../../src/main/notify/notificationHub'

let t: number
let shown: { title: string; body: string; target: { service: ServiceId | 'app'; url?: string } }[]
let saved: Record<string, number>
let enabled: Record<ServiceId, boolean>
let hub: ReturnType<typeof createNotificationHub>

beforeEach(() => {
  t = 1_000_000
  shown = []
  saved = {}
  enabled = { github: true, intra: true, myepitech: true, teams: true }
  hub = createNotificationHub({ show: (n) => shown.push(n), load: () => ({ ...saved }), save: (s) => { saved = { ...s } }, now: () => t, enabled: (s) => enabled[s] })
})

test('affiche une fois par clé', () => { expect(hub.push('github:1', 'github', 't', 'b')).toBe(true); expect(hub.push('github:1', 'github', 't', 'b')).toBe(false); expect(shown).toHaveLength(1) })
test('service désactivé → rien', () => { enabled.github = false; expect(hub.push('github:2', 'github', 't', 'b')).toBe(false); expect(shown).toHaveLength(0) })
test('service désactivé → la clé n’est pas consommée', () => { enabled.github = false; hub.push('k', 'github', 't', 'b'); enabled.github = true; expect(hub.push('k', 'github', 't', 'b')).toBe(true) })
test('clé oubliée après 7 jours', () => { hub.push('k', 'intra', 't', 'b'); t += 7 * 864e5 + 1; expect(hub.push('k', 'intra', 't', 'b')).toBe(true) })
test('clé conservée avant 7 jours', () => { hub.push('k', 'intra', 't', 'b'); t += 7 * 864e5 - 1; expect(hub.push('k', 'intra', 't', 'b')).toBe(false) })
test('persiste les clés vues', () => { hub.push('k', 'intra', 't', 'b'); expect(saved.k).toBe(t) })
test('purge les clés périmées à chaque push', () => { hub.push('old', 'intra', 't', 'b'); t += 8 * 864e5; hub.push('new', 'intra', 't', 'b'); expect(saved).toEqual({ new: t }) })
test('cible : service et url', () => { hub.push('k', 'github', 't', 'b', 'https://u'); expect(shown[0].target).toEqual({ service: 'github', url: 'https://u' }) })

test('prime marque sans afficher', () => { hub.prime(['a', 'b']); expect(shown).toHaveLength(0); expect(Object.keys(saved)).toEqual(['a', 'b']); expect(hub.push('a', 'github', 't', 'b')).toBe(false) })
