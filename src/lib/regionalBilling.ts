export type InvoiceLine = {
  description: string
  quantity: number
  unitAmountMinor: number
  taxRate: number
}

export type RegionalInvoice = {
  invoiceId: string
  organizationId: string
  subsidiaryId: string
  customerCountryCode: string
  currency: string
  taxIncluded: boolean
  lines: InvoiceLine[]
}

export type InvoiceTotals = {
  subtotalMinor: number
  taxMinor: number
  totalMinor: number
}

export function calculateRegionalInvoiceTotals(invoice: RegionalInvoice): InvoiceTotals {
  const subtotalMinor = invoice.lines.reduce((sum, line) => sum + line.quantity * line.unitAmountMinor, 0)
  const taxMinor = invoice.taxIncluded
    ? 0
    : invoice.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitAmountMinor * (line.taxRate / 100)), 0)

  return {
    subtotalMinor,
    taxMinor,
    totalMinor: subtotalMinor + taxMinor,
  }
}

export function assertInvoiceCurrency(invoice: RegionalInvoice, expectedCurrency: string) {
  if (invoice.currency !== expectedCurrency) {
    throw new Error(`Invoice currency ${invoice.currency} does not match expected regional currency ${expectedCurrency}`)
  }
}
