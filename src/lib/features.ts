/**
 * AVENIZE FEATURE FLAGS
 * Gate features that aren't production-ready
 */

export interface Feature {
  enabled: boolean
  status: 'production' | 'beta' | 'coming_soon' | 'contact_sales' | 'planning'
  description: string
  setupRequired?: string
  note?: string
}

export const FEATURES: Record<string, Feature> = {
  twoFactor: {
    enabled: false,
    status: 'coming_soon',
    description: 'Time-based 2FA with authenticator apps',
    setupRequired: 'Implement verify-2fa Edge Function with otpauth',
  },
  sso: {
    enabled: false,
    status: 'contact_sales',
    description: 'SAML/OIDC single sign-on',
    setupRequired: 'Configure SAML in Supabase Auth + IdP setup',
  },
  webhooks: {
    enabled: false,
    status: 'coming_soon',
    description: 'Real-time event webhooks',
    setupRequired: 'Implement Edge Function dispatcher + pg_net extension',
  },
  paystackDirect: {
    enabled: false,
    status: 'coming_soon',
    description: 'Direct Paystack API integration',
    setupRequired: 'Implement paystack-initialize Edge Function',
  },
  pushNotifications: {
    enabled: false,
    status: 'coming_soon',
    description: 'Browser push notifications',
    setupRequired: 'Generate VAPID keys + implement push backend',
  },
  whatsapp: {
    enabled: false,
    status: 'coming_soon',
    description: 'WhatsApp Business integration',
    setupRequired: 'WhatsApp Business API approval + Meta costs',
  },
  sms: {
    enabled: false,
    status: 'coming_soon',
    description: 'SMS notifications',
    setupRequired: 'SMS provider (Termii/Africa\'s Talking) setup',
  },
  openBanking: {
    enabled: false,
    status: 'coming_soon',
    description: 'Bank feed auto-reconciliation',
    setupRequired: 'Mono/Okra integration + per-connection costs',
  },
  nrsCompliance: {
    enabled: false,
    status: 'coming_soon',
    description: 'NRS/FIRS e-invoicing compliance',
    setupRequired: 'NRS accreditation application',
  },
  invoiceFactoring: {
    enabled: false,
    status: 'planning',
    description: 'Embedded invoice factoring',
    setupRequired: 'Lender partnership required',
  },
  aiCopilot: {
    enabled: false,
    status: 'coming_soon',
    description: 'AI bookkeeping assistant',
    setupRequired: 'LLM integration + per-call costs',
  },
  receiptOcr: {
    enabled: false,
    status: 'coming_soon',
    description: 'Receipt scanning with OCR',
    setupRequired: 'Vision API integration + per-call costs',
  },
  offlineMode: {
    enabled: false,
    status: 'coming_soon',
    description: 'Offline-first with sync',
    setupRequired: 'IndexedDB + service worker improvements',
  },
  mobileApp: {
    enabled: false,
    status: 'planning',
    description: 'Native mobile application',
    setupRequired: 'React Native build + app store submission',
  },
  multiLanguage: {
    enabled: false,
    status: 'coming_soon',
    description: 'Multi-language support (10 languages)',
    setupRequired: 'Wire t() function + translations in all pages',
  },
  nigeriaMode: {
    enabled: true,
    status: 'production',
    description: 'Nigeria-specific features (NGN, PAYE, etc.)',
    note: 'Consolidate Nigeria/Global variants into single localized component',
  },
}

export function isFeatureEnabled(feature: keyof typeof FEATURES): boolean {
  return FEATURES[feature]?.enabled ?? false
}

export function getFeatureStatus(feature: keyof typeof FEATURES): Feature['status'] {
  return FEATURES[feature]?.status ?? 'coming_soon'
}

export function getFeatureSetup(feature: keyof typeof FEATURES): string {
  return FEATURES[feature]?.setupRequired ?? ''
}

export function isComingSoon(feature: keyof typeof FEATURES): boolean {
  return FEATURES[feature]?.status === 'coming_soon'
}

export function requiresSalesContact(feature: keyof typeof FEATURES): boolean {
  return FEATURES[feature]?.status === 'contact_sales'
}

export const FEATURE_STATUS_LIST = Object.entries(FEATURES).map(([key, value]) => ({
  key,
  ...value,
}))
