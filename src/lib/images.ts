/**
 * Image utilities for Avenize
 * Provides consistent avatar, placeholder, and image optimization helpers
 */

// ============================================================================
// AVATARS
// ============================================================================

export type DiceBearStyle = 
  | 'adventurer'      // Cartoon adventurer
  | 'adventurer-neutral' // Neutral cartoon
  | 'avataaars'       // Pixar-style
  | 'avataaars-neutral' // Neutral Pixar
  | 'big-ears'        // Cute with big ears
  | 'big-smile'       // Big smile
  | 'bottts'          // Robots
  | 'bottts-neutral'  // Neutral robots
  | 'croodles'        // Doodle style
  | 'croodles-neutral' // Neutral doodle
  | 'dylan'           // Professional
  | 'fun-emoji'       // Emoji style
  | 'glass'           // Glass morphism
  | 'icons'           // Minimal icons
  | 'identicon'       // Geometric
  | 'lorelei'         // Natural style
  | 'lorelei-neutral' // Neutral natural
  | 'micah'           // Illustrated
  | 'miniavs'         // Mini avatars
  | 'notionists'      // Notion-style
  | 'open-peeps'      // Diverse people
  | 'personas'        // Character faces
  | 'pixel-art'       // 8-bit style
  | 'rings'           // Ring patterns
  | 'shapes'          // Abstract shapes
  | 'thumbs'          // Thumb icons

/**
 * Generate a DiceBear avatar URL
 */
export function getAvatarUrl(
  seed: string, 
  style: DiceBearStyle = 'adventurer',
  size: number = 80
): string {
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&size=${size}`
}

/**
 * Generate initials-based avatar (simple)
 */
export function getInitialsAvatarUrl(name: string, size: number = 80): string {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('+')
    .toUpperCase()
    .slice(0, 2)
  
  return `https://ui-avatars.com/api/?name=${initials}&size=${size}&background=4285F4&color=ffffff&bold=true`
}

/**
 * Generate Multiavatar URL (diverse, multicultural)
 */
export function getMultiavatarUrl(seed: string, size: number = 80): string {
  return `https://api.multiavatar.com/${encodeURIComponent(seed)}.png?size=${size}`
}

// ============================================================================
// PLACEHOLDER IMAGES
// ============================================================================

/**
 * Lorem Picsum - Real photos from Unsplash
 */
export function getPlaceholderImage(
  width: number = 800,
  height: number = 600,
  options?: {
    seed?: string        // Stable image (same every time)
    grayscale?: boolean   // Black & white
    blur?: number         // 1-10 blur amount
  }
): string {
  let url = `https://picsum.photos/${width}/${height}`
  const params: string[] = []
  
  if (options?.seed) {
    url = `https://picsum.photos/seed/${options.seed}/${width}/${height}`
  }
  if (options?.grayscale) {
    params.push('grayscale')
  }
  if (options?.blur) {
    params.push(`blur=${Math.min(10, Math.max(1, options.blur))}`)
  }
  
  if (params.length > 0) {
    url += '?' + params.join('&')
  }
  
  return url
}

/**
 * Get Unsplash source URL (hotlinking, for development)
 * Note: For production, download and serve from your CDN
 */
export function getUnsplashUrl(
  keyword: string,
  width: number = 800,
  height: number = 600
): string {
  return `https://source.unsplash.com/${width}x${height}/?${encodeURIComponent(keyword)}`
}

/**
 * Abstract backgrounds for cards and sections
 */
export function getAbstractBackground(seed: string = 'avenize'): string {
  return `https://picsum.photos/seed/${seed}/1200/800`
}

// ============================================================================
// IMAGE SIZES
// ============================================================================

export const IMAGE_SIZES = {
  thumbnail: { width: 64, height: 64 },
  avatar: { width: 80, height: 80 },
  avatarLarge: { width: 120, height: 120 },
  card: { width: 400, height: 300 },
  hero: { width: 1200, height: 800 },
  banner: { width: 1920, height: 400 },
} as const

// ============================================================================
// STOCK PHOTO CATEGORIES
// ============================================================================

export const STOCK_PHOTOS = {
  team: ['teamwork', 'business meeting', 'office collaboration'],
  office: ['modern office', 'workspace', 'business'],
  technology: ['technology', 'computer', 'digital'],
  abstract: ['abstract', 'geometric', 'gradient'],
  people: ['business person', 'professional', 'portrait'],
  nature: ['nature', 'outdoor', 'environment'],
} as const

/**
 * Get a random stock photo URL
 */
export function getStockPhotoUrl(category: keyof typeof STOCK_PHOTOS): string {
  const keywords = STOCK_PHOTOS[category]
  const keyword = keywords[Math.floor(Math.random() * keywords.length)]
  return getPlaceholderImage(800, 600, { seed: keyword })
}

// ============================================================================
// FALLBACK IMAGES
// ============================================================================

export const FALLBACK_IMAGES = {
  avatar: '/images/default-avatar.svg',
  company: '/images/default-company.svg',
  product: '/images/default-product.svg',
  cover: '/images/default-cover.svg',
} as const

/**
 * Get image with error handling
 */
export function getImageWithFallback(
  src: string | null | undefined,
  fallback: string = FALLBACK_IMAGES.avatar
): string {
  return src || fallback
}
