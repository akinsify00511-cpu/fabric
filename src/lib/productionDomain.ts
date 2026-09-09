const CANONICAL_PRODUCTION_ORIGIN = 'https://avenize.com'

/**
 * Returns the canonical public origin used for authentication callbacks and
 * other browser redirects. Production must never inherit a legacy/preview
 * hostname from window.location.origin.
 */
export function getCanonicalProductionOrigin(): string {
  if (import.meta.env.PROD) return CANONICAL_PRODUCTION_ORIGIN

  const configured = String(import.meta.env.VITE_SITE_URL ?? '').trim().replace(/\/$/, '')
  if (configured) return configured

  return window.location.origin
}

export function getCanonicalAuthRedirect(path = '/auth/callback'): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getCanonicalProductionOrigin()}${normalizedPath}`
}
