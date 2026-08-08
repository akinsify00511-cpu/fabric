import { useState, useEffect, type ImgHTMLAttributes } from 'react'
import { getAvatarUrl, getInitialsAvatarUrl, getPlaceholderImage, type DiceBearStyle } from '../lib/images'

// ============================================================================
// AVATAR COMPONENTS
// ============================================================================

interface AvatarProps {
  name: string
  src?: string
  size?: number
  style?: DiceBearStyle
  className?: string
  showInitialsFallback?: boolean
}

export function Avatar({ 
  name, 
  src, 
  size = 40, 
  style = 'adventurer',
  className = '',
  showInitialsFallback = true 
}: AvatarProps) {
  const [imgSrc, setImgSrc] = useState<string>('')
  const [hasError, setHasError] = useState(false)
  
  useEffect(() => {
    // Use uploaded image or generate from name
    if (src) {
      setImgSrc(src)
    } else {
      setImgSrc(getAvatarUrl(name, style, size * 2)) // 2x for retina
    }
    setHasError(false)
  }, [name, src, style, size])
  
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  
  if (hasError && showInitialsFallback) {
    return (
      <div 
        className={`rounded-full flex items-center justify-center font-medium text-white ${className}`}
        style={{ 
          width: size, 
          height: size, 
          fontSize: size * 0.4,
          backgroundColor: stringToColor(name),
        }}
      >
        {initials}
      </div>
    )
  }
  
  return (
    <img
      src={imgSrc}
      alt={name}
      width={size}
      height={size}
      className={`rounded-full object-cover ${className}`}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  )
}

interface AvatarGroupProps {
  users: Array<{ name: string; src?: string }>
  max?: number
  size?: number
  className?: string
}

export function AvatarGroup({ users, max = 4, size = 32, className = '' }: AvatarGroupProps) {
  const visible = users.slice(0, max)
  const remaining = users.length - max
  
  return (
    <div className={`flex -space-x-2 ${className}`}>
      {visible.map((user, i) => (
        <Avatar
          key={i}
          name={user.name}
          src={user.src}
          size={size}
          className="ring-2 ring-white"
        />
      ))}
      {remaining > 0 && (
        <div 
          className="rounded-full bg-gray-100 flex items-center justify-center font-medium text-gray-600 ring-2 ring-white"
          style={{ width: size, height: size, fontSize: size * 0.35 }}
        >
          +{remaining}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// IMAGE COMPONENTS
// ============================================================================

interface OptimizedImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  placeholderSrc?: string
  blurHash?: string
}

export function OptimizedImage({ 
  src, 
  placeholderSrc,
  className = '',
  alt,
  ...props 
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [currentSrc, setCurrentSrc] = useState(placeholderSrc || getPlaceholderImage(10, 10, { blur: 10 }))
  
  useEffect(() => {
    if (src) {
      // Start loading the real image
      const img = new Image()
      img.src = src
      img.onload = () => {
        setCurrentSrc(src)
        setIsLoaded(true)
      }
    }
  }, [src])
  
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Blur placeholder */}
      {!isLoaded && placeholderSrc && (
        <img
          src={placeholderSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover blur-lg scale-110"
          aria-hidden="true"
        />
      )}
      {/* Loading skeleton */}
      {!isLoaded && !placeholderSrc && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}
      {/* Main image */}
      <img
        src={currentSrc}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        loading="lazy"
        {...props}
      />
    </div>
  )
}

interface CardImageProps {
  src?: string
  alt?: string
  aspectRatio?: 'video' | 'square' | 'portrait' | 'wide'
  className?: string
}

export function CardImage({ 
  src, 
  alt = '', 
  aspectRatio = 'video',
  className = '' 
}: CardImageProps) {
  const aspectClasses = {
    video: 'aspect-video',
    square: 'aspect-square',
    portrait: 'aspect-[3/4]',
    wide: 'aspect-[16/9]',
  }
  
  const placeholderSrc = getPlaceholderImage(800, 600, { seed: alt || 'image' })
  
  return (
    <div className={`relative ${aspectClasses[aspectRatio]} overflow-hidden rounded-t-xl bg-gray-100 ${className}`}>
      <OptimizedImage
        src={src}
        placeholderSrc={placeholderSrc}
        alt={alt}
        className="w-full h-full"
      />
    </div>
  )
}

// ============================================================================
// TEAM PHOTOS
// ============================================================================

interface TeamPhotoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function TeamPhotoPlaceholder({ size = 'md', className = '' }: TeamPhotoProps) {
  const sizes = {
    sm: { width: 400, height: 300 },
    md: { width: 600, height: 400 },
    lg: { width: 800, height: 600 },
  }
  
  const { width, height } = sizes[size]
  
  return (
    <img
      src={getPlaceholderImage(width, height, { seed: 'team,meeting' })}
      alt="Team collaboration"
      className={`rounded-xl object-cover ${className}`}
      loading="lazy"
    />
  )
}

// ============================================================================
// ICON PLACEHOLDERS
// ============================================================================

interface IconPlaceholderProps {
  icon: 'user' | 'company' | 'document' | 'image' | 'folder'
  size?: number
  className?: string
}

export function IconPlaceholder({ icon, size = 24, className = '' }: IconPlaceholderProps) {
  const colors = {
    user: 'bg-blue-100 text-blue-500',
    company: 'bg-purple-100 text-purple-500',
    document: 'bg-amber-100 text-amber-500',
    image: 'bg-green-100 text-green-500',
    folder: 'bg-indigo-100 text-indigo-500',
  }
  
  const icons = {
    user: (
      <svg className="w-1/2 h-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    company: (
      <svg className="w-1/2 h-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    document: (
      <svg className="w-1/2 h-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    image: (
      <svg className="w-1/2 h-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    folder: (
      <svg className="w-1/2 h-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  }
  
  return (
    <div 
      className={`rounded-lg flex items-center justify-center ${colors[icon]} ${className}`}
      style={{ width: size, height: size }}
    >
      {icons[icon]}
    </div>
  )
}

// ============================================================================
// UTILITIES
// ============================================================================

function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  const colors = [
    '#4285F4', // Blue
    '#34A853', // Green
    '#FBBC05', // Yellow
    '#EA4335', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
  ]
  
  return colors[Math.abs(hash) % colors.length]
}
