import { describe, expect, test } from 'vitest'
import { createTeamsService, isLoginUrl, parseUnread } from '../../src/main/services/teams'
import { NeedsLoginError, NotReadyError } from '../../src/main/services/types'

describe('teams', () => {
  test('parseUnread nombre', () => expect(parseUnread('(3) Chat | Microsoft Teams')).toBe(3))
  test('parseUnread 99+', () => expect(parseUnread('(99+) Chat | Microsoft Teams')).toBe(99))
  test('parseUnread sans nombre', () => expect(parseUnread('Chat | Microsoft Teams')).toBe(0))
  test('isLoginUrl', () => {
    expect(isLoginUrl('https://login.microsoftonline.com/common/oauth2')).toBe(true)
    expect(isLoginUrl('https://login.live.com/x')).toBe(true)
    expect(isLoginUrl('https://teams.microsoft.com/v2/')).toBe(false)
    expect(isLoginUrl('not a url')).toBe(false)
  })
  test('refresh après titre', async () => {
    const t = createTeamsService()
    t.onNavigate('https://teams.microsoft.com/v2/')
    t.onTitle('(2) Chat')
    expect(await t.refresh()).toEqual({ unread: 2 })
  })
  test('refresh sur page de connexion → NeedsLoginError', async () => {
    const t = createTeamsService()
    t.onNavigate('https://login.microsoftonline.com/x')
    await expect(t.refresh()).rejects.toBeInstanceOf(NeedsLoginError)
  })
  test('refresh sans page vue → NotReadyError (état loading)', async () => {
    const p = createTeamsService().refresh()
    await expect(p).rejects.toBeInstanceOf(NotReadyError)
    await expect(createTeamsService().refresh()).rejects.toThrow('Teams pas encore ouvert')
  })
  test('signale seulement les changements de non-lus ou de connexion', () => {
    const t = createTeamsService()
    expect(t.onNavigate('https://teams.cloud.microsoft/')).toBe(true)
    expect(t.onTitle('Chat | Microsoft Teams')).toBe(false) // toujours 0 non-lu
    expect(t.onTitle('(2) Chat | Microsoft Teams')).toBe(true)
    expect(t.onTitle('(2) Activité | Microsoft Teams')).toBe(false)
    expect(t.onNavigate('https://teams.cloud.microsoft/v2/chat')).toBe(false)
    expect(t.onNavigate('https://login.microsoftonline.com/x')).toBe(true)
    expect(t.onNavigate('https://login.microsoftonline.com/y')).toBe(false)
    expect(t.onNavigate('https://teams.cloud.microsoft/')).toBe(true)
  })
})
