export type FinancialHealthSignal = {
  subsidiaryId: string
  currency: string
  cashMinor: number
  receivablesMinor: number
  payablesMinor: number
  committedMinor: number
  monthlyOperatingBurnMinor: number
  expectedInflowsMinor?: number
  expectedOutflowsMinor?: number
}

export type FinancialHealthAssessment = {
  subsidiaryId: string
  liquidityCoverageMonths: number
  workingCapitalMinor: number
  netLiquidityMinor: number
  cashPressure: 'critical' | 'high' | 'moderate' | 'healthy'
  expansionCapacityMinor: number
  recommendation: 'protect_cash' | 'accelerate_collections' | 'control_commitments' | 'safe_to_invest'
}

export function assessFinancialHealth(input: FinancialHealthSignal): FinancialHealthAssessment {
  const inflows = input.expectedInflowsMinor ?? 0
  const outflows = input.expectedOutflowsMinor ?? 0
  const netLiquidityMinor = input.cashMinor + input.receivablesMinor - input.payablesMinor - input.committedMinor
  const workingCapitalMinor = input.cashMinor + input.receivablesMinor - input.payablesMinor
  const monthlyNeed = Math.max(1, input.monthlyOperatingBurnMinor + outflows - inflows)
  const liquidityCoverageMonths = Math.max(0, netLiquidityMinor / monthlyNeed)
  const cashPressure = liquidityCoverageMonths < 1 ? 'critical' : liquidityCoverageMonths < 2 ? 'high' : liquidityCoverageMonths < 4 ? 'moderate' : 'healthy'
  const expansionCapacityMinor = Math.max(0, netLiquidityMinor - monthlyNeed * 2)
  const recommendation = cashPressure === 'critical' ? 'protect_cash' : cashPressure === 'high' ? 'accelerate_collections' : cashPressure === 'moderate' ? 'control_commitments' : 'safe_to_invest'
  return { subsidiaryId: input.subsidiaryId, liquidityCoverageMonths, workingCapitalMinor, netLiquidityMinor, cashPressure, expansionCapacityMinor, recommendation }
}
