import type { MarketSignal, MarketRecommendation } from './marketIntelligence'
import { detectMarketSignals, rankMarketSignals } from './marketIntelligence'
import { supabase } from './supabase'

type MarketSignalRow = {
  id: string
  organization_id: string
  subsidiary_id: string
  location: string
  granularity: MarketSignal['granularity']
  leads: number
  opportunities: number
  won_deals: number
  revenue: number
  average_deal_value: number
  conversion_rate: number
  period_start: string
  period_end: string
}

function toMarketSignal(row: MarketSignalRow): MarketSignal {
  return {
    id: row.id,
    organizationId: row.organization_id,
    subsidiaryId: row.subsidiary_id,
    location: row.location,
    granularity: row.granularity,
    leads: row.leads,
    opportunities: row.opportunities,
    wonDeals: row.won_deals,
    revenue: row.revenue,
    averageDealValue: row.average_deal_value,
    conversionRate: row.conversion_rate,
    periodStart: row.period_start,
    periodEnd: row.period_end,
  }
}

export async function getMarketSignals(subsidiaryId: string, options?: { start?: string; end?: string; location?: string }) {
  let query = supabase
    .from('market_intelligence_signals')
    .select('id, organization_id, subsidiary_id, location, granularity, leads, opportunities, won_deals, revenue, average_deal_value, conversion_rate, period_start, period_end')
    .eq('subsidiary_id', subsidiaryId)
    .order('revenue', { ascending: false })

  if (options?.start) query = query.gte('period_end', options.start)
  if (options?.end) query = query.lte('period_start', options.end)
  if (options?.location) query = query.ilike('location', `%${options.location}%`)

  const { data, error } = await query
  if (error) throw error

  return rankMarketSignals(((data ?? []) as MarketSignalRow[]).map(toMarketSignal))
}

export async function getMarketRecommendations(subsidiaryId: string, options?: { start?: string; end?: string }) {
  const signals = await getMarketSignals(subsidiaryId, options)
  return detectMarketSignals(signals)
}

export async function getGroupMarketIntelligence(subsidiaryIds: string[]) {
  if (!subsidiaryIds.length) return { signals: [], recommendations: [] as MarketRecommendation[] }

  const { data, error } = await supabase
    .from('market_intelligence_signals')
    .select('id, organization_id, subsidiary_id, location, granularity, leads, opportunities, won_deals, revenue, average_deal_value, conversion_rate, period_start, period_end')
    .in('subsidiary_id', subsidiaryIds)
    .order('revenue', { ascending: false })

  if (error) throw error

  const signals = rankMarketSignals(((data ?? []) as MarketSignalRow[]).map(toMarketSignal))
  return { signals, recommendations: detectMarketSignals(signals) }
}
