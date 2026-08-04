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
    enabled: true, // ✅ Implemented - TOTP via otpauth library
    status: 'production',
    description: 'Time-based 2FA with authenticator apps (Google Authenticator, Authy)',
    note: 'Setup in Security Settings. Requires user_mfa table in Supabase.',
  },
  sso: {
    enabled: false,
    status: 'contact_sales',
    description: 'SAML/OIDC single sign-on for enterprise (Okta, Azure AD, Google Workspace)',
    setupRequired: 'Configure SAML in Supabase Auth + IdP setup. Contact sales for setup.',
    note: 'Enterprise feature requiring manual configuration',
  },
  webhooks: {
    enabled: true, // ✅ Implemented - UI and storage working, needs Edge Function for dispatch
    status: 'beta',
    description: 'Real-time event webhooks to external services (Zapier, Make, custom endpoints)',
    note: 'Webhook configs are saved. Dispatch requires supabase/functions/dispatch-webhooks edge function + pg_net extension.',
  },
  automations: {
    enabled: true, // ✅ Implemented - UI and storage working, needs Edge Function for execution
    status: 'beta',
    description: 'Workflow automation (when X happens, do Y)',
    note: 'Automation rules are saved. Execution requires supabase/functions/execute-automation edge function + pg_cron.',
  },
  paystackDirect: {
    enabled: false,
    status: 'coming_soon',
    description: 'Direct Paystack API integration for payments',
    setupRequired: 'Implement paystack-initialize Edge Function + webhook endpoint',
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
    description: 'WhatsApp Business integration for notifications',
    setupRequired: 'WhatsApp Business API approval + Meta costs',
  },
  sms: {
    enabled: false,
    status: 'coming_soon',
    description: 'SMS notifications via Termii or Africa\'s Talking',
    setupRequired: 'SMS provider account + Edge Function integration',
  },
  openBanking: {
    enabled: false,
    status: 'coming_soon',
    description: 'Bank feed auto-reconciliation via Mono/Okra',
    setupRequired: 'Mono/Okra integration + per-connection costs',
  },
  nrsCompliance: {
    enabled: false,
    status: 'coming_soon',
    description: 'NRS/FIRS e-invoicing compliance for Nigeria',
    setupRequired: 'NRS accreditation application',
  },
  invoiceFactoring: {
    enabled: false,
    status: 'planning',
    description: 'Embedded invoice factoring for working capital',
    setupRequired: 'Lender partnership required',
  },
  aiCopilot: {
    enabled: false,
    status: 'coming_soon',
    description: 'AI bookkeeping assistant for expense categorization',
    setupRequired: 'LLM integration (OpenAI/Anthropic) + per-call costs',
  },
  receiptOcr: {
    enabled: false,
    status: 'coming_soon',
    description: 'Receipt scanning with OCR for expense tracking',
    setupRequired: 'Vision API integration (Google Cloud Vision) + per-call costs',
  },
  offlineMode: {
    enabled: false,
    status: 'coming_soon',
    description: 'Offline-first mode with background sync',
    setupRequired: 'IndexedDB + service worker improvements',
  },
  mobileApp: {
    enabled: false,
    status: 'planning',
    description: 'Native iOS/Android mobile application',
    setupRequired: 'React Native build + app store submission',
  },
  multiLanguage: {
    enabled: false,
    status: 'coming_soon',
    description: 'Multi-language support (English, Yoruba, Hausa, Igbo, French, Spanish, Arabic, Portuguese, Chinese, Hindi)',
    setupRequired: 'Wire i18n system + translations in all pages',
  },
  nigeriaMode: {
    enabled: true,
    status: 'production',
    description: 'Nigeria-specific features (₦ Naira, PAYE, WHT, multi-bank transfers)',
    note: 'Production-ready for Nigerian market',
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
