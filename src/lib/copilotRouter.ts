// Deterministic copilot router — the canonical, testable core of Ask Avenize.
// Mirrors the routing logic in supabase/functions/ask-avenize (Deno cannot
// import from src/, so the edge function carries the same logic inline; keep
// the two in sync — the tests here lock the contract).
//
// Contract (anti-fabrication §22): every answer quotes ONLY values present in
// the assembled CopilotContext. When a value is absent the answer says so and
// suggests the action that would create it. The router NEVER invents a number.

export interface CopilotMetric {
  key: string
  name: string
  current_value: number | null
  previous_value?: number | null
  change_percent?: number | null
  target_value?: number | null
  confidence?: string
}

export interface CopilotRecommendation {
  statement?: string
  title?: string
  severity?: string
  expected_impact?: { amount?: number; currency?: string } | null
}

export interface CopilotContext {
  businessName?: string | null
  state?: string | null
  healthScore?: number | null
  metrics?: CopilotMetric[]
  recommendations?: CopilotRecommendation[]
  nextBestAction?: { statement: string; expectedImpact?: string | null } | null
  overdueInvoices?: number | null
}

export interface CopilotAnswer {
  intent: string
  answer: string
  sources: string[]
  confidence: 'high' | 'medium' | 'low'
}

type IntentRule = {
  intent: string
  patterns: RegExp[]
  answer: (ctx: CopilotContext) => CopilotAnswer
}

function fmtMoney(n: number, currency = '₦'): string {
  return `${currency}${Math.round(n).toLocaleString()}`
}

function metric(ctx: CopilotContext, keys: string[]): CopilotMetric | undefined {
  return (ctx.metrics || []).find((m) => keys.some((k) => m.key.includes(k)))
}

function trend(m?: CopilotMetric): string {
  if (!m) return ''
  if (m.change_percent === null || m.change_percent === undefined) return ''
  const dir = m.change_percent >= 0 ? 'up' : 'down'
  return ` (${dir} ${Math.abs(m.change_percent).toFixed(1)}% vs last period)`
}

const STATE_LABELS: Record<string, string> = {
  growing: 'growing',
  stable: 'stable',
  scaling: 'scaling fast',
  stressed: 'under pressure',
  recovering: 'recovering',
  at_risk: 'at risk',
  cash_constrained: 'cash-constrained',
  sales_constrained: 'sales-constrained',
  capacity_constrained: 'capacity-constrained',
  operationally_constrained: 'operationally constrained',
  opportunity_rich: 'opportunity-rich',
  insufficient_data: 'still being measured',
}

const RULES: IntentRule[] = [
  {
    intent: 'business_health',
    patterns: [/how is (my |the )?(business|company)/i, /business (doing|health)/i, /overall health/i, /state of (my |the )?business/i],
    answer: (ctx) => {
      if (ctx.healthScore == null && !ctx.state) {
        return {
          intent: 'business_health',
          answer: "I don't have enough data yet to rate your business health. Set targets for a few key metrics and record some activity — then I can give you a real score.",
          sources: [],
          confidence: 'low',
        }
      }
      const parts: string[] = []
      if (ctx.state) parts.push(`Your business is ${STATE_LABELS[ctx.state] ?? ctx.state}`)
      if (ctx.healthScore != null) parts.push(`with an overall health score of ${Math.round(ctx.healthScore)}/100`)
      const top = ctx.recommendations?.[0]
      if (top?.statement || top?.title) {
        parts.push(`The most important thing right now: ${top.statement ?? top.title}.`)
      }
      return {
        intent: 'business_health',
        answer: parts.join(' ') + '.',
        sources: ['business health', 'business state', 'recommendations'],
        confidence: ctx.healthScore != null ? 'high' : 'medium',
      }
    },
  },
  {
    intent: 'revenue',
    patterns: [/revenue/i, /sales (doing|numbers|figure)/i, /income/i, /how much (did we|have we) (make|earn|sell)/i],
    answer: (ctx) => {
      const m = metric(ctx, ['revenue', 'income'])
      if (!m || m.current_value == null) {
        return {
          intent: 'revenue',
          answer: "There's no revenue recorded yet. Once you send and get paid on your first invoice, I'll track it here.",
          sources: [],
          confidence: 'low',
        }
      }
      return {
        intent: 'revenue',
        answer: `Revenue so far this period is ${fmtMoney(m.current_value)}${trend(m)}.${m.target_value ? ` That's ${Math.round((m.current_value / m.target_value) * 100)}% of your ${fmtMoney(m.target_value)} target.` : ''}`,
        sources: [`metric:${m.key}`],
        confidence: 'high',
      }
    },
  },
  {
    intent: 'cash',
    patterns: [/cash ?(flow| position)?/i, /money (in|out)/i, /runway/i],
    answer: (ctx) => {
      const m = metric(ctx, ['cash', 'cashflow', 'net'])
      if (!m || m.current_value == null) {
        return {
          intent: 'cash',
          answer: "I don't have cash-flow data yet. Record income and expenses in Finance and I'll start tracking your cash position.",
          sources: [],
          confidence: 'low',
        }
      }
      return {
        intent: 'cash',
        answer: `Net cash this period is ${fmtMoney(m.current_value)}${trend(m)}.`,
        sources: [`metric:${m.key}`],
        confidence: 'high',
      }
    },
  },
  {
    intent: 'overdue',
    patterns: [/overdue/i, /unpaid/i, /who owes/i, /receivable/i, /outstanding invoice/i],
    answer: (ctx) => {
      if (ctx.overdueInvoices == null) {
        return {
          intent: 'overdue',
          answer: "I can't see any invoice data yet. Once you have invoices in Finance, I'll track overdue ones for you.",
          sources: [],
          confidence: 'low',
        }
      }
      if (ctx.overdueInvoices === 0) {
        return {
          intent: 'overdue',
          answer: 'Good news — you have no overdue invoices right now.',
          sources: ['invoices'],
          confidence: 'high',
        }
      }
      const n = ctx.overdueInvoices
      return {
        intent: 'overdue',
        answer: `You have ${n} overdue invoice${n === 1 ? '' : 's'}. Chasing ${n === 1 ? 'it' : 'them'} is usually the fastest way to improve cash — open Finance to send a reminder.`,
        sources: ['invoices'],
        confidence: 'high',
      }
    },
  },
  {
    intent: 'next_action',
    patterns: [/what should i (do|focus)/i, /what'?s (the )?(most important|priority|next)/i, /next best/i, /where should i (focus|start)/i],
    answer: (ctx) => {
      const nba = ctx.nextBestAction
      if (nba?.statement) {
        return {
          intent: 'next_action',
          answer: `${nba.statement}${nba.expectedImpact ? ` Expected impact: ${nba.expectedImpact}.` : ''}`,
          sources: ['next best action engine'],
          confidence: 'high',
        }
      }
      const top = ctx.recommendations?.[0]
      if (top?.statement || top?.title) {
        return {
          intent: 'next_action',
          answer: `The most important thing right now: ${top.statement ?? top.title}.`,
          sources: ['recommendations'],
          confidence: 'medium',
        }
      }
      return {
        intent: 'next_action',
        answer: "Nothing urgent needs your attention right now. As your data grows, I'll surface the single highest-value action here.",
        sources: [],
        confidence: 'low',
      }
    },
  },
]

// Returns a deterministic answer when the question maps to governed data,
// or null when it doesn't (the caller then uses the optional LLM provider,
// or an honest fallback).
export function routeQuestion(question: string, ctx: CopilotContext): CopilotAnswer | null {
  const q = question.trim()
  if (!q) return null
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(q))) {
      return rule.answer(ctx)
    }
  }
  return null
}

// Honest deterministic fallback when no intent matched and no LLM provider
// is configured: summarise what IS known, never guess.
export function fallbackAnswer(ctx: CopilotContext): CopilotAnswer {
  const parts: string[] = []
  if (ctx.state) parts.push(`Your business is ${STATE_LABELS[ctx.state] ?? ctx.state}`)
  if (ctx.healthScore != null) parts.push(`health ${Math.round(ctx.healthScore)}/100`)
  const rev = metric(ctx, ['revenue', 'income'])
  if (rev?.current_value != null) parts.push(`revenue this period ${fmtMoney(rev.current_value)}${trend(rev)}`)
  const top = ctx.recommendations?.[0]
  if (top?.statement || top?.title) parts.push(`Top priority: ${top.statement ?? top.title}`)
  if (parts.length === 0) {
    return {
      intent: 'fallback',
      answer: "I'm best at questions about your revenue, cash, overdue invoices, and what to focus on. Once your business data grows, I can answer more.",
      sources: [],
      confidence: 'low',
    }
  }
  return {
    intent: 'fallback',
    answer: `Here's what I know: ${parts.join('; ')}. Ask me about revenue, cash, overdue invoices, or what to focus on next.`,
    sources: ['business context'],
    confidence: 'medium',
  }
}
