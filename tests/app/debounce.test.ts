import { afterEach, expect, test, vi } from 'vitest'
import { debounce } from '../../src/main/app/debounce'

afterEach(() => vi.useRealTimers())

test('un seul appel pour une rafale', () => {
  vi.useFakeTimers()
  const fn = vi.fn()
  const d = debounce(fn, 500)
  d(); d(); d()
  vi.advanceTimersByTime(499)
  expect(fn).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(fn).toHaveBeenCalledTimes(1)
  d()
  vi.advanceTimersByTime(500)
  expect(fn).toHaveBeenCalledTimes(2)
})
test('cancel annule l’appel en attente', () => {
  vi.useFakeTimers()
  const fn = vi.fn()
  const d = debounce(fn, 100)
  d()
  d.cancel()
  vi.advanceTimersByTime(200)
  expect(fn).not.toHaveBeenCalled()
})
