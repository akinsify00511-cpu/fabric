import { useState, useEffect } from 'react'
import { getAvatarUrl, getInitials, stringToColor, type DiceBearStyle } from '../lib/images'

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
  showInitialsFallback = true,
}: AvatarProps) {
  const [imgSrc, setImgSrc] = useState<string>('')
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    // Uploaded image wins; otherwise a locally generated initials avatar.
    setImgSrc(src || getAvatarUrl(name, style, size * 2)) // 2x for retina
    setHasError(false)
  }, [name, src, style, size])

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
        {getInitials(name)}
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
