// Avenize mobile theme — mirrors the web brand tokens (Google Standard).
// Single source of truth for colors so mobile and web stay in sync.

export const colors = {
  primary: '#4285F4',
  primaryHover: '#3367D6',
  primaryActive: '#2A5DB0',
  primarySoft: 'rgba(66, 133, 244, 0.08)',

  surface: '#FFFFFF',
  surface2: '#F8F9FA',
  surface3: '#F1F3F4',
  surfaceInverse: '#202124',

  text: '#202124',
  textSecondary: '#5F6368',
  textTertiary: '#9AA0A6',
  textDisabled: '#DADCE0',

  border: '#E8EAED',
  borderStrong: '#DADCE0',

  success: '#34A853',
  successSoft: 'rgba(52, 168, 83, 0.08)',
  warning: '#FBBC05',
  warningSoft: 'rgba(251, 188, 5, 0.08)',
  danger: '#EA4335',
  dangerSoft: 'rgba(234, 67, 53, 0.08)',
  info: '#4285F4',

  accent: '#8B5CF6',
  accentHr: '#8B5CF6',
  accentSales: '#4285F4',
  accentFinance: '#34A853',
  accentProjects: '#FBBC05',
  accentComms: '#EC4899',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 1,
  },
  elevation2: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  elevation3: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
}
