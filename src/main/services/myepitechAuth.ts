/** Préfixe des requêtes dont le jeton est capturé. */
export const MYEPITECH_API_PREFIX = 'https://my.epitech.eu/api/'

export interface MyEpitechAuthDeps {
  /** Branche l'écouteur sur les en-têtes envoyés par les pages de la partition My Epitech. */
  onRequestHeaders(listener: (url: string, headers: Record<string, string>) => void): void
  /** Ouvre une page My Epitech cachée (le site rafraîchit alors son jeton) ; renvoie de quoi la fermer. */
  openHiddenPage(): Promise<() => void>
  now(): number
  /** Attente maximale d'un jeton après l'ouverture de la page cachée (15 s par défaut). */
  waitMs?: number
}

export interface GetTokenOptions {
  /** Ignore la pause qui suit un renouvellement raté (action explicite de l'utilisateur). */
  force?: boolean
}

export interface MyEpitechAuth {
  getToken(opts?: GetTokenOptions): Promise<string | null>
  invalidate(): void
}

/** Marge : un jeton qui expire dans moins de 30 s est déjà considéré expiré. */
export const EXPIRY_MARGIN_MS = 30_000
/** Après un renouvellement raté, aucune fenêtre cachée n'est rouverte pendant 10 min (sauf `force`). */
export const RENEW_COOLDOWN_MS = 10 * 60_000

/** Pause en cours : un renouvellement a échoué il y a moins de `RENEW_COOLDOWN_MS`. */
export function inCooldown(lastFailedAt: number | null, nowMs: number): boolean {
  return lastFailedAt !== null && nowMs - lastFailedAt < RENEW_COOLDOWN_MS
}

/** true si le jeton est un JWT dont `exp` est dépassé ou à moins de 30 s (un jeton opaque n'expire jamais ici). */
export function isExpiredJwt(token: string, nowMs: number): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: unknown }
    return typeof payload.exp === 'number' && payload.exp * 1000 - EXPIRY_MARGIN_MS <= nowMs
  } catch {
    return false
  }
}

function bearerOf(headers: Record<string, string>): string | null {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== 'authorization' || typeof value !== 'string') continue
    const m = /^Bearer\s+(\S+)\s*$/i.exec(value)
    if (m) return m[1]
  }
  return null
}

/**
 * Jeton My Epitech capturé dans les en-têtes des requêtes API du site (jamais lu dans son stockage).
 * Il reste en mémoire seulement ; aucune fonction ici ne le journalise.
 */
export function createMyEpitechAuth(deps: MyEpitechAuthDeps): MyEpitechAuth {
  const waitMs = deps.waitMs ?? 15_000
  let token: string | null = null
  let renewing: Promise<string | null> | null = null
  /** Date du dernier renouvellement raté (null : aucun, ou un jeton a été capturé depuis). */
  let lastFailedAt: number | null = null
  const waiters = new Set<() => void>()

  const usable = (): string | null => (token && !isExpiredJwt(token, deps.now()) ? token : null)

  deps.onRequestHeaders((url, headers) => {
    if (!url.startsWith(MYEPITECH_API_PREFIX)) return
    const t = bearerOf(headers)
    if (!t) return
    token = t
    // Jeton vu (onglet ou page cachée) : l'utilisateur est connecté, la pause est levée.
    lastFailedAt = null
    for (const w of [...waiters]) w()
  })

  async function renew(): Promise<string | null> {
    let close: (() => void) | undefined
    try {
      close = await deps.openHiddenPage()
    } catch {
      return null
    }
    try {
      const now = usable()
      if (now) return now
      return await new Promise<string | null>((resolve) => {
        const done = (value: string | null): void => {
          clearTimeout(timer)
          waiters.delete(check)
          resolve(value)
        }
        const check = (): void => {
          const t = usable()
          if (t) done(t)
        }
        const timer = setTimeout(() => done(null), waitMs)
        waiters.add(check)
      })
    } finally {
      close()
    }
  }

  return {
    getToken(opts?: GetTokenOptions): Promise<string | null> {
      const t = usable()
      if (t) return Promise.resolve(t)
      // Déconnecté : pas de fenêtre cachée à chaque cycle (elle gênerait aussi la connexion dans l'onglet).
      if (!renewing && !opts?.force && inCooldown(lastFailedAt, deps.now())) return Promise.resolve(null)
      // Les appels simultanés partagent un seul renouvellement.
      renewing ??= renew()
        .then((value) => {
          lastFailedAt = value ? null : deps.now()
          return value
        })
        .finally(() => {
          renewing = null
        })
      return renewing
    },
    invalidate(): void {
      token = null
    }
  }
}
