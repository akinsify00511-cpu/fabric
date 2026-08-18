export type LeadImportRow = Record<string, unknown>
export type LeadField = 'name' | 'phone' | 'email' | 'company' | 'location' | 'leadSource' | 'campaign' | 'notes'
export type LeadImportMapping = Record<LeadField, string | null>
export type CleanLead = { name?: string; phone?: string; email?: string; company?: string; location?: string; leadSource?: string; campaign?: string; notes?: string; sourceRow: number }
export type LeadImportResult = { rows: CleanLead[]; duplicates: number[]; invalid: { row: number; reason: string }[] }

const aliases: Record<LeadField, string[]> = {
  name: ['name', 'full name', 'customer name', 'client', 'contact name'],
  phone: ['phone', 'mobile', 'telephone', 'phone number', 'whatsapp', 'whatsapp number'],
  email: ['email', 'e-mail', 'email address', 'mail'],
  company: ['company', 'company name', 'business', 'organization'],
  location: ['location', 'city', 'state', 'address', 'area'],
  leadSource: ['source', 'lead source', 'origin'],
  campaign: ['campaign', 'campaign name'],
  notes: ['notes', 'comment', 'comments', 'description'],
}

const normalizeHeader = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
export function suggestLeadMapping(headers: string[]): LeadImportMapping {
  const normalized = headers.map(normalizeHeader)
  return Object.fromEntries(Object.entries(aliases).map(([field, candidates]) => {
    const index = normalized.findIndex((header) => candidates.includes(header))
    return [field, index >= 0 ? headers[index] : null]
  })) as LeadImportMapping
}

const text = (value: unknown) => {
  const result = String(value ?? '').trim().replace(/\s+/g, ' ')
  return result || undefined
}
const normalizeEmail = (value: unknown) => {
  const result = text(value)?.toLowerCase()
  return result && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : undefined
}

/** Normalize common local/international phone formats without changing the country code.
 * Nigerian local numbers such as 0803... become +234803..., while an existing
 * +234... or other international number is preserved.
 */
const normalizePhone = (value: unknown) => {
  const raw = text(value)
  if (!raw) return undefined
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 7) return undefined
  if (raw.trim().startsWith('+')) return `+${digits}`
  if (digits.startsWith('234') && digits.length >= 10) return `+${digits}`
  if (digits.startsWith('0') && digits.length >= 10) return `+234${digits.slice(1)}`
  return `+${digits}`
}
const get = (row: LeadImportRow, mapping: LeadImportMapping, field: LeadField) => mapping[field] ? row[mapping[field]!] : undefined

export function cleanLeadRows(rows: LeadImportRow[], mapping: LeadImportMapping): LeadImportResult {
  const seen = new Set<string>(); const duplicates: number[] = []; const invalid: { row: number; reason: string }[] = []; const cleaned: CleanLead[] = []
  rows.forEach((row, index) => {
    const sourceRow = index + 2; const email = normalizeEmail(get(row, mapping, 'email')); const phone = normalizePhone(get(row, mapping, 'phone')); const name = text(get(row, mapping, 'name'))
    if (!name && !phone && !email) { invalid.push({ row: sourceRow, reason: 'No usable name, phone, or email.' }); return }
    const key = email ? `email:${email}` : phone ? `phone:${phone}` : `name:${name!.toLowerCase()}`
    if (seen.has(key)) { duplicates.push(sourceRow); return }
    seen.add(key)
    cleaned.push({ name, phone, email, company: text(get(row, mapping, 'company')), location: text(get(row, mapping, 'location')), leadSource: text(get(row, mapping, 'leadSource')), campaign: text(get(row, mapping, 'campaign')), notes: text(get(row, mapping, 'notes')), sourceRow })
  })
  return { rows: cleaned, duplicates, invalid }
}
