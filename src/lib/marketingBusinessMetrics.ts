export type MarketingBusinessMetricInput = {
  adSpend: number
  attributedRevenue: number
  attributedContributionProfit?: number
  leads: number
  customers: number
  newCustomerRevenue?: number
  repeatCustomerRevenue?: number
  estimatedFutureValue?: number
  grossMarginRate?: number
}

export type MarketingBusinessMetrics = {
  spend: number
  attributedRevenue: number
  attributedContributionProfit: number
  leads: number
  customers: number
  cpl: number | null
  cac: number | null
  roas: number | null
  contributionRoas: number | null
  revenuePerLead: number | null
  ltv: number | null
  ltvToCac: number | null
}

const safeDivide = (numerator: number, denominator: number) =>
  denominator > 0 ? numerator / denominator : null

/** Calculates business-facing marketing metrics from authorized marketing, sales and finance inputs. */
export function calculateMarketingBusinessMetrics(input: MarketingBusinessMetricInput): MarketingBusinessMetrics {
  const contributionProfit = input.attributedContributionProfit ??
    (input.attributedRevenue * (input.grossMarginRate ?? 0))
  const observedCustomerValue = (input.newCustomerRevenue ?? 0) + (input.repeatCustomerRevenue ?? 0)
  const ltv = input.estimatedFutureValue ?? (input.customers > 0 ? observedCustomerValue / input.customers : null)
  const cac = safeDivide(input.adSpend, input.customers)

  return {
    spend: input.adSpend,
    attributedRevenue: input.attributedRevenue,
    attributedContributionProfit: contributionProfit,
    leads: input.leads,
    customers: input.customers,
    cpl: safeDivide(input.adSpend, input.leads),
    cac,
    roas: safeDivide(input.attributedRevenue, input.adSpend),
    contributionRoas: safeDivide(contributionProfit, input.adSpend),
    revenuePerLead: safeDivide(input.attributedRevenue, input.leads),
    ltv,
    ltvToCac: ltv !== null && cac !== null ? safeDivide(ltv, cac) : null,
  }
}
