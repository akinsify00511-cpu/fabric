type LogoProps = {
  size?: number
  variant?: 'default' | 'mono' | 'gradient'
  // default: solid black logo (primary)
  // mono: single-color (for dark backgrounds)
  // gradient: signature gradient version (premium moments only)
}

export default function FabricMark({ size = 32, variant = 'default' }: LogoProps) {
  const dark = '#111111'
  const light = '#FFFFFF'
  const stone = '#F7F7F5'

  // Signature gradient: Deep Blue → Indigo → Violet
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="avenize-signature-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="50%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      
      {/* top-left: dark (primary) */}
      <path d="M4 4h11v7a4 4 0 0 1-4 4H4V4z" 
        fill={variant === 'mono' ? light : variant === 'gradient' ? 'url(#avenize-signature-grad)' : dark} />
      
      {/* top-right: gradient or dark */}
      <path d="M36 4H21v7a4 4 0 0 0 4 4h11V4z" 
        fill={variant === 'mono' ? light : variant === 'gradient' ? '#4F46E5' : 'url(#avenize-signature-grad)'} />
      
      {/* bottom-left: gradient or dark */}
      <path d="M4 36h11v-7a4 4 0 0 0-4-4H4v11z" 
        fill={variant === 'mono' ? light : variant === 'gradient' ? '#8B5CF6' : 'url(#avenize-signature-grad)'} />
      
      {/* bottom-right: dark (primary) */}
      <path d="M36 36H21v-7a4 4 0 0 1 4-4h11v11z" 
        fill={variant === 'mono' ? light : dark} />
    </svg>
  )
}
