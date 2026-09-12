// Avenize mobile theme — high-contrast light system shared with the web product.
// White is the canvas/elevated surface; standard cards use ash so content never
// disappears into the page. Customer branding can still customize the brand
// accent, but core readability is protected by these defaults.

export const colors = {
  primary: '#155BB4',
  primaryHover: '#1247A0',
  primaryActive: '#0F3B86',
  primarySoft: 'rgba(21, 91, 180, 0.10)',

  background: '#F7F9FC',
  surface: '#FFFFFF',
  surface2: '#F3F4F6',
  surface3: '#E5E7EB',
  surfaceCard: '#F3F4F6',
  surfaceCardHover: '#EEF0F3',
  surfaceInfo: '#EFF6FF',
  surfaceInverse: '#111827',

  text: '#111827',
  textSecondary: '#374151',
  textTertiary: '#6B7280',
  textDisabled: '#9CA3AF',
  textOnPrimary: '#FFFFFF',

  border: '#D1D5DB',
  borderStrong: '#9CA3AF',

  success: '#15803D',
  successSoft: 'rgba(21, 128, 61, 0.10)',
  warning: '#A16207',
  warningSoft: 'rgba(161, 98, 7, 0.12)',
  danger: '#B91C1C',
  dangerSoft: 'rgba(185, 28, 28, 0.10)',
  info: '#155BB4',

  accent: '#7C3AED',
  accentHr: '#7C3AED',
  accentSales: '#155BB4',
  accentFinance: '#15803D',
  accentProjects: '#A16207',
  accentComms: '#BE185D',
} as const

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
} as const

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 24, pill: 9999,
} as const

export const fontSize = {
  xs: 11, sm: 13, md: 15, lg: 18, xl: 22, xxl: 28,
} as const

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
}

export const shadows = {
  elevation1: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  elevation2: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 2,
  },
  elevation3: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
}
