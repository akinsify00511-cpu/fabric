/**
 * Image utilities for Avenize — fully local, zero external services.
 * Avatars and placeholders are generated as SVG data URIs (deterministic
 * per seed), so no DiceBear / ui-avatars / picsum / unsplash calls.
 */

/** @deprecated External avatar styles no longer apply; kept for call-site compat. */
export type DiceBearStyle = string

const AVATAR_COLORS = [
  '#155BB4', // brand primary
  '#157342', // success
  '#845400', // amber
  '#B3261E', // danger
  '#5B4BC4', // violet
  '#C2185B', // pink
  '#007B83', // cyan
  '#B06000', // orange
]

export function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((n) => n[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  )
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * Deterministic initials avatar as an SVG data URI.
 * The style/size params are accepted for call-site compatibility; size only
 * affects the intrinsic SVG canvas (rendering is controlled by the <img>).
 */
export function getAvatarUrl(seed: string, _style?: DiceBearStyle, size: number = 80): string {
  const initials = getInitials(seed)
  const bg = stringToColor(seed)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${bg}"/><text x="50%" y="50%" dy="0.36em" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(size * 0.42)}" font-weight="600" fill="#ffffff">${initials}</text></svg>`
  return svgDataUri(svg)
}

/** Initials-based avatar (same generator; separate entry point kept for compat). */
export function getInitialsAvatarUrl(name: string, size: number = 80): string {
  return getAvatarUrl(name, undefined, size)
}

/**
 * Local placeholder image as an SVG data URI — a soft brand gradient with
 * deterministic geometric accents derived from the seed. grayscale/blur
 * options are accepted for compatibility and ignored.
 */
export function getPlaceholderImage(
  width: number = 800,
  height: number = 600,
  options?: { seed?: string; grayscale?: boolean; blur?: number },
): string {
  const seed = options?.seed ?? 'avenize'
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h1 = Math.abs(hash) % 360
  const h2 = (h1 + 40) % 360
  const cx = 20 + (Math.abs(hash >> 3) % 60)
  const cy = 20 + (Math.abs(hash >> 5) % 60)
  const r = 30 + (Math.abs(hash >> 7) % 40)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1},45%,88%)"/><stop offset="1" stop-color="hsl(${h2},45%,78%)"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><circle cx="${cx}%" cy="${cy}%" r="${r}" fill="hsl(${h1},50%,70%)" opacity="0.5"/></svg>`
  return svgDataUri(svg)
}
