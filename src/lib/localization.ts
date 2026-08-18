export type SupportedLocale = 'en' | 'fr' | 'es' | 'pt' | 'de' | 'ar'

export type RegionalSettings = {
  locale: SupportedLocale
  countryCode: string
  currency: string
  currencyDisplay: 'symbol' | 'code'
  timezone: string
  dateFormat: string
  firstDayOfWeek: 0 | 1
  numberSystem: string
}

export const DEFAULT_REGIONAL_SETTINGS: RegionalSettings = {
  locale: 'en',
  countryCode: 'NG',
  currency: 'NGN',
  currencyDisplay: 'symbol',
  timezone: 'Africa/Lagos',
  dateFormat: 'dd/MM/yyyy',
  firstDayOfWeek: 1,
  numberSystem: 'latn',
}

export function formatLocalizedCurrency(amount: number, settings: RegionalSettings) {
  return new Intl.NumberFormat(`${settings.locale}-${settings.countryCode}`, {
    style: 'currency',
    currency: settings.currency,
    currencyDisplay: settings.currencyDisplay,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatLocalizedNumber(amount: number, settings: RegionalSettings) {
  return new Intl.NumberFormat(`${settings.locale}-${settings.countryCode}`, {
    maximumFractionDigits: 2,
  }).format(amount)
}
