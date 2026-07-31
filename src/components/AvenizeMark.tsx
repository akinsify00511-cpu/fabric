type LogoProps = {
  size?: number
  mono?: boolean // true = single-color (for dark backgrounds), false = gradient piece
}

export default function AvenizeMark({ size = 32, mono = false }: LogoProps) {
  const dark = '#111111'
  const light = '#F7F7F8'

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fabric-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF7A59" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      {/* top-left: dark */}
      <path d="M4 4h11v7a4 4 0 0 1-4 4H4V4z" fill={mono ? light : dark} />
      {/* top-right: gradient */}
      <path d="M36 4H21v7a4 4 0 0 0 4 4h11V4z" fill={mono ? light : 'url(#fabric-grad)'} />
      {/* bottom-left: gradient */}
      <path d="M4 36h11v-7a4 4 0 0 0-4-4H4v11z" fill={mono ? light : 'url(#fabric-grad)'} />
      {/* bottom-right: dark */}
      <path d="M36 36H21v-7a4 4 0 0 1 4-4h11v11z" fill={mono ? light : dark} />
    </svg>
  )
}
