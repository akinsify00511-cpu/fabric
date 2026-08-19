// Deterministic receipt extraction — Avenize-internal, no OCR SaaS, no LLM.
// Consumes raw OCR text (tesseract.js) and produces structured fields with
// per-field confidence. Anti-fabrication: a field is NULL when the text does
// not support it; confidence reflects HOW the value was found (exact label >
// positional inference > heuristic guess). A human confirms before anything
// becomes a financial record.

export interface ParsedLineItem {
  description: string
  amount: number
  quantity?: number
}

export type Confidence = 'high' | 'medium' | 'low'

export interface ParsedReceipt {
  vendor: string | null
  receipt_number: string | null
  receipt_date: string | null // ISO yyyy-mm-dd
  currency: string
  subtotal: number | null
  tax: number | null
  discount: number | null
  total: number | null
  payment_method: string | null
  category: string | null
  expense_account: string | null
  line_items: ParsedLineItem[]
  field_confidence: Record<string, Confidence>
  overall_confidence: number // 0..1
}

const CURRENCIES: Array<[RegExp, string]> = [
  [/₦|NGN|naira/i, 'NGN'],
  [/\$|USD|US\s?dollar/i, 'USD'],
  [/€|EUR|euro/i, 'EUR'],
  [/£|GBP|pound/i, 'GBP'],
  [/GH₵|GHS|cedi/i, 'GHS'],
]

const AMOUNT_RE = /(?:₦|NGN|\$|€|£|GH₵|GHS)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g

const TOTAL_LABELS = /\bgrand\s*total\b|\btotal\s*amount\b|\bamount\s*due\b|\btotal\b/i
const SUBTOTAL_LABELS = /\bsub[\s-]?total\b/i
const TAX_LABELS = /\bvat\b|\btax\b|\bsales\s*tax\b|\bvat\s*\(/i
const DISCOUNT_LABELS = /\bdiscount\b|\bsavings\b|\b promo\b/i

const DATE_PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string | null]> = [
  // 2024-03-15 / 2024/03/15
  [/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/, (m) => iso(+m[1], +m[2], +m[3])],
  // 15-03-2024 / 15/03/2024 / 15.03.2024 (day-first, Nigeria/UK)
  [/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/, (m) => iso(+m[3], +m[2], +m[1])],
  // Mar 15, 2024 / 15 Mar 2024
  [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})[,\s]+(\d{4})/i, (m) => iso(+m[3], monthNum(m[1]), +m[2])],
  [/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+[,\s]*(\d{4})/i, (m) => iso(+m[3], monthNum(m[2]), +m[1])],
]

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function monthNum(mon: string): number {
  return MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const PAYMENT_METHODS: Array<[RegExp, string]> = [
  [/\bcash\b/i, 'cash'],
  [/\b(card|debit|credit|visa|mastercard|verve)\b/i, 'card'],
  [/\b(transfer|bank\s*transfer|wire)\b/i, 'transfer'],
  [/\b(pos|point\s*of\s*sale)\b/i, 'pos'],
  [/\b(mobile\s*money|momo|ussd)\b/i, 'mobile_money'],
]

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/\b(fuel|petrol|diesel|gas\s*station|filling)\b/i, 'operations'],
  [/\b(restaurant|eatery|cafe|meal|food|catering|kitchen)\b/i, 'meals'],
  [/\b(hotel|lodge|accommodation|flight|airline|uber|bolt|taxi|transport)\b/i, 'travel'],
  [/\b(stationery|office\s*supplies|printer|paper)\b/i, 'office_supplies'],
  [/\b(electricity|power|water|utility|internet|data|airtime|subscription)\b/i, 'utilities'],
  [/\b(software|saas|hosting|cloud|domain)\b/i, 'software'],
  [/\b(advert|marketing|promo|billboard)\b/i, 'marketing'],
  [/\b(repair|maintenance|service\s*charge)\b/i, 'maintenance'],
  [/\b(pharmacy|medical|clinic|hospital|health)\b/i, 'medical'],
  [/\b(supermarket|grocery|market|store|mart|shop)\b/i, 'operations'],
]

const NOISE_LINES = /^(tel|phone|email|www\.|http|address|invoice\s*to|bill\s*to|thank\s*you|welcome|receipt|tax\s*invoice|cashier|attendant|served\s*by|date|time)\b/i
const SKIP_VENDOR_LINES = /^(receipt|tax\s*invoice|sales\s*receipt|invoice|bill|order)\b/i

function parseAmount(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

function findLabeledAmount(line: string): number | null {
  const matches = [...line.matchAll(AMOUNT_RE)].map((m) => parseAmount(m[1])).filter((n): n is number => n !== null)
  return matches.length ? Math.max(...matches) : null
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)

  const confidence: Record<string, Confidence> = {}
  const result: ParsedReceipt = {
    vendor: null,
    receipt_number: null,
    receipt_date: null,
    currency: 'NGN',
    subtotal: null,
    tax: null,
    discount: null,
    total: null,
    payment_method: null,
    category: null,
    expense_account: null,
    line_items: [],
    field_confidence: confidence,
    overall_confidence: 0,
  }

  // --- Vendor: first substantive line that isn't a label/noise ---
  for (const line of lines.slice(0, 6)) {
    if (NOISE_LINES.test(line) || SKIP_VENDOR_LINES.test(line)) continue
    if (!/[a-zA-Z]{3}/.test(line)) continue
    if (/^\d/.test(line)) continue
    // Reject garbage: a real business name contains vowels and isn't
    // dominated by digits/punctuation.
    if (!/[aeiouAEIOU]/.test(line)) continue
    const letters = (line.match(/[a-zA-Z]/g) || []).length
    if (letters / line.replace(/\s/g, '').length < 0.5) continue
    result.vendor = line.replace(/[^\p{L}\p{N}&'().,\- ]/gu, '').trim() || null
    confidence.vendor = 'medium'
    break
  }

  // --- Receipt number ---
  for (const line of lines) {
    const m = line.match(/(?:receipt|invoice|bill|order|transaction|trans|rcpt|ref)[\s#:.-]*(?:no\.?|num(?:ber)?|id)?[\s#:.-]*([A-Z0-9][A-Z0-9\-/]{3,})/i)
    if (m) {
      result.receipt_number = m[1]
      confidence.receipt_number = 'high'
      break
    }
  }

  // --- Date ---
  for (const line of lines) {
    for (const [re, toIso] of DATE_PATTERNS) {
      const m = line.match(re)
      if (m) {
        const d = toIso(m)
        if (d) {
          result.receipt_date = d
          confidence.receipt_date = /date/i.test(line) ? 'high' : 'medium'
          break
        }
      }
    }
    if (result.receipt_date) break
  }

  // --- Currency ---
  for (const line of lines) {
    for (const [re, code] of CURRENCIES) {
      if (re.test(line)) {
        result.currency = code
        confidence.currency = 'high'
        break
      }
    }
    if (confidence.currency) break
  }
  if (!confidence.currency) confidence.currency = 'low' // default NGN

  // --- Amounts ---
  let totalLine: string | null = null
  for (const line of lines) {
    if (SUBTOTAL_LABELS.test(line)) {
      const v = findLabeledAmount(line)
      if (v !== null) { result.subtotal = v; confidence.subtotal = 'high' }
    }
    if (TAX_LABELS.test(line) && !TOTAL_LABELS.test(line)) {
      const v = findLabeledAmount(line)
      if (v !== null && result.tax === null) { result.tax = v; confidence.tax = 'high' }
    }
    if (DISCOUNT_LABELS.test(line)) {
      const v = findLabeledAmount(line)
      if (v !== null) { result.discount = v; confidence.discount = 'high' }
    }
    if (TOTAL_LABELS.test(line) && !SUBTOTAL_LABELS.test(line) && totalLine === null) {
      totalLine = line
    }
  }

  if (totalLine) {
    const v = findLabeledAmount(totalLine)
    if (v !== null) { result.total = v; confidence.total = 'high' }
  }

  // Fallback: largest plausible amount as the total (positional inference).
  if (result.total === null) {
    let max = 0
    for (const line of lines) {
      if (/change|balance|balance\s*due|opening|closing/i.test(line)) continue
      const v = findLabeledAmount(line)
      if (v !== null && v > max) max = v
    }
    if (max > 0) { result.total = max; confidence.total = 'low' }
  }

  // --- Payment method ---
  for (const line of lines) {
    for (const [re, method] of PAYMENT_METHODS) {
      if (re.test(line)) {
        result.payment_method = method
        confidence.payment_method = /paid|payment|method|tender/i.test(line) ? 'high' : 'medium'
        break
      }
    }
    if (result.payment_method) break
  }

  // --- Line items: "description ... amount" rows that are not labels ---
  // Receipt lines put the price LAST; use the last amount on the line and
  // treat everything before it as the description.
  const labelLines = TOTAL_LABELS.source + '|' + SUBTOTAL_LABELS.source + '|' + TAX_LABELS.source + '|' + DISCOUNT_LABELS.source
  const isLabel = new RegExp(labelLines, 'i')
  for (const line of lines) {
    if (isLabel.test(line)) continue
    if (NOISE_LINES.test(line)) continue
    const amountMatches = [...line.matchAll(AMOUNT_RE)]
    if (amountMatches.length === 0) continue
    const last = amountMatches[amountMatches.length - 1]
    const amount = parseAmount(last[1])
    let desc = line.slice(0, last.index).trim()
    if (amount === null || amount <= 0) continue
    if (!/[a-zA-Z]{2,}/.test(desc)) continue
    const qtyMatch = desc.match(/[x×]\s*(\d+)\s*$/i)
    if (qtyMatch) desc = desc.slice(0, qtyMatch.index).trim()
    result.line_items.push({
      description: desc.replace(/\s+/g, ' ').trim(),
      amount,
      ...(qtyMatch ? { quantity: +qtyMatch[1] } : {}),
    })
    if (result.line_items.length >= 50) break
  }

  // --- Consistency checks raise or lower confidence ---
  if (result.total !== null && result.subtotal !== null) {
    const expected = result.subtotal + (result.tax ?? 0) - (result.discount ?? 0)
    if (Math.abs(expected - result.total) < 0.02 * result.total + 1) {
      confidence.total = 'high'
      if (confidence.subtotal) confidence.subtotal = 'high'
      if (confidence.tax) confidence.tax = 'high'
    } else if (confidence.total === 'high') {
      confidence.total = 'medium' // totals disagree — flag for review
    }
  } else if (result.total !== null && result.line_items.length > 0) {
    const sum = result.line_items.reduce((s, i) => s + i.amount, 0)
    const expected = sum + (result.tax ?? 0) - (result.discount ?? 0)
    if (Math.abs(expected - result.total) < 0.05 * result.total + 2) {
      confidence.total = confidence.total === 'low' ? 'medium' : 'high'
    }
  }

  // --- Category ---
  const haystack = [result.vendor, ...result.line_items.map((i) => i.description)].filter(Boolean).join(' ')
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(haystack)) {
      result.category = cat
      result.expense_account = cat
      confidence.category = 'medium'
      break
    }
  }
  if (result.category === null) {
    result.category = 'operations'
    result.expense_account = 'operations'
    confidence.category = 'low'
  }

  // --- Overall confidence: weighted mean of found-field confidences ---
  const weights: Record<string, number> = {
    vendor: 0.15, receipt_number: 0.05, receipt_date: 0.1, currency: 0.05,
    subtotal: 0.05, tax: 0.05, discount: 0.02, total: 0.35,
    payment_method: 0.08, category: 0.1,
  }
  const level: Record<Confidence, number> = { high: 1, medium: 0.6, low: 0.25 }
  let score = 0
  let maxScore = 0
  for (const [field, w] of Object.entries(weights)) {
    maxScore += w
    const c = confidence[field]
    if (c) score += w * level[c]
  }
  result.overall_confidence = Math.round((score / maxScore) * 1000) / 1000

  return result
}

export function confidenceLabel(c: Confidence | undefined): string {
  if (!c) return 'not found'
  return c
}
