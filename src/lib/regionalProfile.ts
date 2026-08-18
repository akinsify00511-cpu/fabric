import type { RegionalSettings, SupportedLocale } from './localization'

export type RegionalBusinessProfile = RegionalSettings & {
  organizationId: string
  subsidiaryId: string
  countryName: string
  supportedLocales: SupportedLocale[]
  fiscalYearStartMonth: number
  taxName?: string
  taxRate?: number
  measurementSystem: 'metric' | 'imperial'
  defaultPaymentCurrency: string
}

export function validateRegionalProfile(profile: RegionalBusinessProfile) {
  if (!profile.organizationId || !profile.subsidiaryId) throw new Error('Business scope is required')
  if (!profile.countryCode || !profile.currency || !profile.locale) throw new Error('Country, currency and locale are required')
  if (profile.fiscalYearStartMonth < 1 || profile.fiscalYearStartMonth > 12) throw new Error('Fiscal year month must be between 1 and 12')
  if (profile.taxRate !== undefined && (profile.taxRate < 0 || profile.taxRate > 100)) throw new Error('Tax rate must be between 0 and 100')
  if (!profile.supportedLocales.includes(profile.locale)) throw new Error('Default locale must be supported by the business')
  return true
}
