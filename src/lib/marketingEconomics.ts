export type MarketingEconomicsInput = {
  revenueMinor: number
  grossProfitMinor?: number
  marketingSpendMinor: number
  newCustomers: number
  averageLtvMinor?: number
}

export type MarketingEconomics = {
  roas?: number
  cacMinor?: number
  ltvToCac?: number
  roi?: number
  grossProfitRoi?: number
  paybackRevenueRatio?: number
  classification: 'excellent' | 'healthy' | 'watch' | 'unprofitable' | 'insufficient_data'
  warnings: string[]
}

export function calculateMarketingEconomics(input: MarketingEconomicsInput): MarketingEconomics {
  const warnings: string[] = []
  const roas = input.marketingSpendMinor > 0 ? input.revenueMinor / input.marketingSpendMinor : undefined
  const cacMinor = input.newCustomers > 0 ? input.marketingSpendMinor / input.newCustomers : undefined
  const ltvToCac = input.averageLtvMinor !== undefined && cacMinor && cacMinor > 0 ? input.averageLtvMinor / cacMinor : undefined
  const roi = input.marketingSpendMinor > 0 ? (input.revenueMinor - input.marketingSpendMinor) / input.marketingSpendMinor : undefined
  const grossProfitRoi = input.grossProfitMinor !== undefined && input.marketingSpendMinor > 0 ? (input.grossProfitMinor - input.marketingSpendMinor) / input.marketingSpendMinor : undefined
  const paybackRevenueRatio = input.averageLtvMinor && cacMinor && input.averageLtvMinor > 0 ? cacMinor / input.averageLtvMinor : undefined

  if (roas === undefined || cacMinor === undefined) warnings.push('Insufficient acquisition data to calculate complete marketing economics.')
  if (ltvToCac !== undefined && ltvToCac < 3) warnings.push('LTV to CAC is below the commonly targeted 3:1 benchmark; validate the business model before scaling.')
  if (grossProfitRoi !== undefined && grossProfitRoi < 0) warnings.push('Campaign-level gross profit does not currently cover marketing spend.')

  let classification: MarketingEconomics['classification'] = 'insufficient_data'
  if (roas !== undefined && ltvToCac !== undefined) {
    if (grossProfitRoi !== undefined && grossProfitRoi < 0) classification = 'unprofitable'
    else if (roas >= 5 && ltvToCac >= 4) classification = 'excellent'
    else if (roas >= 3 && ltvToCac >= 3) classification = 'healthy'
    else classification = 'watch'
  }

  return { roas, cacMinor, ltvToCac, roi, grossProfitRoi, paybackRevenueRatio, classification, warnings }
}
