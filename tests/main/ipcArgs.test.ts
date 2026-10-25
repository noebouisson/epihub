import { expect, test } from 'vitest'
import { refreshArgs } from '../../src/main/ipcArgs'

test('refreshArgs : force accepté pour My Epitech seulement, argument validé', () => {
  expect(refreshArgs('myepitech', { force: true })).toEqual({ id: 'myepitech', opts: { force: true } })
  expect(refreshArgs('github', { force: true })).toEqual({ id: 'github', opts: undefined })
  expect(refreshArgs('myepitech', { force: 'yes' })).toEqual({ id: 'myepitech', opts: undefined })
  expect(refreshArgs('myepitech', null)).toEqual({ id: 'myepitech', opts: undefined })
  // Tout rafraîchir : force transmis (le registre ne l'applique qu'à My Epitech)
  expect(refreshArgs(undefined, { force: true })).toEqual({ id: undefined, opts: { force: true } })
  expect(refreshArgs('nope', { force: true })).toEqual({ id: undefined, opts: undefined })
  expect(refreshArgs(undefined, undefined)).toEqual({ id: undefined, opts: undefined })
})
