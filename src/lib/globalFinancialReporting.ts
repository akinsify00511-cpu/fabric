export type MonetaryAmount = {
  amountMinor: number
  currency: string
}

export type ConsolidatedAmount = MonetaryAmount & {
  reportingCurrency: string
  exchangeRate: number
  sourceCurrency: string
  sourceAmountMinor: number
}

export function convertForReporting(amount: MonetaryAmount, reportingCurrency: string, exchangeRate: number): ConsolidatedAmount {
  if (exchangeRate <= 0) throw new Error('Exchange rate must be greater than zero')
  return {
    amountMinor: Math.round(amount.amountMinor * exchangeRate),
    currency: reportingCurrency,
    reportingCurrency,
    exchangeRate,
    sourceCurrency: amount.currency,
    sourceAmountMinor: amount.amountMinor,
  }
}

export function consolidateAmounts(amounts: ConsolidatedAmount[], reportingCurrency: string) {
  if (amounts.some((amount) => amount.reportingCurrency !== reportingCurrency)) {
    throw new Error('All amounts must use the same reporting currency')
  }
  return amounts.reduce((total, amount) => total + amount.amountMinor, 0)
}
