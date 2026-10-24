/** Regroupe les appels rapprochés : `fn` ne s'exécute qu'une fois, `ms` après le dernier appel. */
export function debounce(fn: () => void, ms: number): (() => void) & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const call = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      fn()
    }, ms)
  }
  return Object.assign(call, { cancel: () => clearTimeout(timer) })
}
