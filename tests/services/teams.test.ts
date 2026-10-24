import { describe, expect, test } from 'vitest'
import { createTeamsService, isLoginUrl, parseUnread } from '../../src/main/services/teams'
import { NeedsLoginError } from '../../src/main/services/types'

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
  test('refresh sans page vue → erreur', async () => {
    await expect(createTeamsService().refresh()).rejects.toThrow('Teams pas encore ouvert')
  })
})
