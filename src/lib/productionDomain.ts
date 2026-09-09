const CANONICAL_PRODUCTION_ORIGIN = 'https://avenize.com'

export function getCanonicalProductionOrigin(): string {
  if (import.meta.env.PROD) return CANONICAL_PRODUCTION_ORIGIN
  const configured = String(import.meta.env.VITE_SITE_URL ?? '').trim().replace(/\/$/, '')
  return configured || window.location.origin
}

export function getCanonicalAuthRedirect(path = '/auth/callback'): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getCanonicalProductionOrigin()}${normalizedPath}`
}
