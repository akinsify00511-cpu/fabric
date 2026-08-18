export type SubsidiaryStatus = 'active' | 'paused' | 'archived'

export type SubsidiaryBusinessProfile = {
  id: string
  organizationId: string
  legalName: string
  tradingName: string
  industry: string
  description?: string
  status: SubsidiaryStatus
  countryCode: string
  headquartersLocation?: string
  defaultCurrency: string
  defaultLocale: string
  timezone: string
  crmScopeId: string
  enabledDomains: Array<'marketing' | 'sales' | 'finance' | 'operations' | 'customer-success' | 'intelligence'>
  primaryProducts: string[]
}

export function validateSubsidiaryBusinessProfile(profile: SubsidiaryBusinessProfile) {
  if (!profile.id || !profile.organizationId) throw new Error('Organization and subsidiary IDs are required')
  if (!profile.legalName || !profile.tradingName) throw new Error('Legal and trading names are required')
  if (!profile.industry || !profile.countryCode || !profile.defaultCurrency || !profile.defaultLocale || !profile.timezone) {
    throw new Error('Industry, country, currency, locale and timezone are required')
  }
  if (!profile.crmScopeId) throw new Error('A dedicated CRM scope is required for every subsidiary')
  if (profile.enabledDomains.length === 0) throw new Error('At least one business domain must be enabled')
  return true
}

export function isSubsidiaryActive(profile: SubsidiaryBusinessProfile) {
  return profile.status === 'active'
}
