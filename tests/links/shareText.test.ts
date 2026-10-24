import { expect, test } from 'vitest'
import { shareText } from '../../src/main/links/shareText'

test('format avec contexte', () => expect(shareText({ title: 'Fix parser', url: 'https://github.com/me/r/pull/3', context: 'PR' })).toBe('PR — Fix parser\nhttps://github.com/me/r/pull/3'))
test('format sans contexte', () => expect(shareText({ title: 'Fix parser', url: 'https://x' })).toBe('Fix parser\nhttps://x'))
