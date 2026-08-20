// Demand Capture — Lead → Request → Quote → Order client layer.
// Every wrapper is best-effort + non-blocking (§24): a missing migration
// degrades to null/[] with a console note, never a crash.

import { supabase } from './supabase'

export type RequestType = 'product' | 'service' | 'inspection' | 'consultation' | 'callback' | 'custom'
export type RequestStatus = 'new' | 'reviewing' | 'qualified' | 'quoted' | 'accepted' | 'fulfilled' | 'rejected' | 'abandoned'
export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'converted'
export type OrderStatus = 'confirmed' | 'in_fulfilment' | 'fulfilled' | 'completed' | 'cancelled'
export type Urgency = 'low' | 'normal' | 'high' | 'urgent'

export interface LeadRequest {
  id: string
  business_id: string
  request_number: number
  lead_id: string | null
  contact_id: string | null
  request_type: RequestType
  title: string
  description: string | null
  product_id: string | null
  quantity: number | null
  location: string | null
  budget: number | null
  urgency: Urgency
  status: RequestStatus
  assigned_to: string | null
  attachments: unknown[]
  lost_reason: string | null
  created_at: string
}

export interface DemandQuote {
  id: string
  lead_id: string | null
  request_id: string | null
  title: string
  items: Array<{ name: string; quantity: number; unit_price: number }>
  subtotal: number
  vat_amount: number
  total: number
  valid_until: string | null
  status: QuoteStatus
  access_token: string | null
  created_at: string
}

export interface SalesOrder {
  id: string
  order_number: number
  contact_id: string | null
  lead_id: string | null
  request_id: string | null
  quote_id: string | null
  items: unknown[]
  total: number
  status: OrderStatus
  assigned_to: string | null
  fulfilled_at: string | null
  completed_at: string | null
  cancel_reason: string | null
  created_at: string
}

export interface DemandActivityItem {
  action: string
  entity_type: 'request' | 'quote' | 'order' | 'lead'
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
}

export interface DemandChain {
  requests: LeadRequest[]
  quotes: DemandQuote[]
  orders: SalesOrder[]
}

export interface DemandFunnel {
  authorized?: boolean
  leads: number
  requests: number
  quotes: number
  orders: number
  request_from_lead_pct: number | null
  quote_from_request_pct: number | null
  order_from_quote_pct: number | null
}

export interface DemandRevenue {
  authorized?: boolean
  total_revenue: number
  avg_order_value: number
  lost_value: number
  expired_quote_value: number
  revenue_per_lead: number | null
  revenue_by_source: Array<{ source: string; revenue: number; orders: number }> | null
}

export interface DemandPipeline {
  authorized?: boolean
  open_request_value: number
  open_quote_value: number
  orders_in_fulfilment: number
  orders_done_90d: number
  avg_sales_days: number
}

export const REQUEST_TYPES: Record<RequestType, string> = {
  product: 'Product request',
  service: 'Service request',
  inspection: 'Site visit / inspection',
  consultation: 'Consultation',
  callback: 'Callback request',
  custom: 'Custom request',
}

export const REQUEST_STATUS: Record<RequestStatus, { label: string; color: string }> = {
  new: { label: 'New', color: 'var(--av-primary)' },
  reviewing: { label: 'Reviewing', color: 'var(--av-warning)' },
  qualified: { label: 'Qualified', color: 'var(--av-info)' },
  quoted: { label: 'Quoted', color: 'var(--av-info)' },
  accepted: { label: 'Accepted', color: 'var(--av-success)' },
  fulfilled: { label: 'Fulfilled', color: 'var(--av-success)' },
  rejected: { label: 'Rejected', color: 'var(--av-danger)' },
  abandoned: { label: 'Abandoned', color: 'var(--av-text-disabled)' },
}

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--av-text-muted)' },
  sent: { label: 'Sent', color: 'var(--av-primary)' },
  viewed: { label: 'Viewed', color: 'var(--av-info)' },
  accepted: { label: 'Accepted', color: 'var(--av-success)' },
  rejected: { label: 'Rejected', color: 'var(--av-danger)' },
  expired: { label: 'Expired', color: 'var(--av-warning)' },
  converted: { label: 'Ordered', color: 'var(--av-success)' },
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; color: string }> = {
  confirmed: { label: 'Confirmed', color: 'var(--av-primary)' },
  in_fulfilment: { label: 'In fulfilment', color: 'var(--av-warning)' },
  fulfilled: { label: 'Fulfilled', color: 'var(--av-success)' },
  completed: { label: 'Completed', color: 'var(--av-success)' },
  cancelled: { label: 'Cancelled', color: 'var(--av-danger)' },
}

// ---- creation RPCs -----------------------------------------------------

export async function createLeadRequest(params: {
  leadId: string; type: RequestType; title: string; description?: string
  productId?: string; quantity?: number; location?: string; budget?: number; urgency?: Urgency
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_lead_request', {
    p_lead_id: params.leadId,
    p_request_type: params.type,
    p_title: params.title,
    p_description: params.description ?? null,
    p_product_id: params.productId ?? null,
    p_quantity: params.quantity ?? null,
    p_location: params.location ?? null,
    p_budget: params.budget ?? null,
    p_urgency: params.urgency ?? 'normal',
  })
  if (error) { console.warn('[demand] create_lead_request failed', error); return null }
  return (data as string | null) ?? null
}

export async function createDemandQuote(params: {
  leadId: string; requestId?: string; title: string
  items: Array<{ name: string; quantity: number; unit_price: number }>
  validUntil?: string; assignedTo?: string
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_quote', {
    p_lead_id: params.leadId,
    p_title: params.title,
    p_items: params.items,
    p_request_id: params.requestId ?? null,
    p_subtotal: null,
    p_vat: 0,
    p_valid_until: params.validUntil ?? null,
    p_assigned_to: params.assignedTo ?? null,
  })
  if (error) { console.warn('[demand] create_quote failed', error); return null }
  return (data as string | null) ?? null
}

export async function createSalesOrder(params: {
  leadId?: string; requestId?: string; quoteId?: string; contactId?: string
  items?: unknown[]; total: number; title?: string; assignedTo?: string
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_sales_order', {
    p_lead_id: params.leadId ?? null,
    p_request_id: params.requestId ?? null,
    p_quote_id: params.quoteId ?? null,
    p_contact_id: params.contactId ?? null,
    p_items: params.items ?? [],
    p_total: params.total,
    p_title: params.title ?? null,
    p_assigned_to: params.assignedTo ?? null,
  })
  if (error) { console.warn('[demand] create_sales_order failed', error); return null }
  return (data as string | null) ?? null
}

export async function transitionDemand(entity: 'request' | 'quote' | 'order', id: string, toStatus: string, lostReason?: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('transition_demand', {
    p_entity: entity, p_entity_id: id, p_to_status: toStatus, p_lost_reason: lostReason ?? null,
  })
  if (error) { console.warn('[demand] transition failed', error); return false }
  return data === true
}

// ---- public customer portal -------------------------------------------

export interface PublicQuote {
  id: string; title: string; items: Array<{ name: string; quantity: number; unit_price: number }>
  subtotal: number; vat_amount: number; total: number; status: QuoteStatus
  valid_until: string | null; business_name: string; lead_name: string | null; contact_name: string | null
}

export async function getPublicQuote(token: string): Promise<PublicQuote | null> {
  const { data, error } = await supabase.rpc('get_quote_by_token', { p_token: token })
  if (error) { console.warn('[demand] quote portal failed', error); return null }
  return (data as PublicQuote | null) ?? null
}

export async function respondToQuote(token: string, accept: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('respond_to_quote', { p_token: token, p_accept: accept })
  if (error) { console.warn('[demand] quote respond failed', error); return false }
  return data === true
}

// ---- reads -------------------------------------------------------------

export async function fetchLeadChain(leadId: string): Promise<DemandChain | null> {
  const [req, quo, ord] = await Promise.all([
    supabase.from('lead_requests').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }),
    supabase.from('quotes').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }),
    supabase.from('sales_orders').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }),
  ])
  if (req.error || quo.error || ord.error) {
    console.warn('[demand] chain read failed', req.error ?? quo.error ?? ord.error)
    return null
  }
  return {
    requests: (req.data ?? []) as LeadRequest[],
    quotes: (quo.data ?? []) as DemandQuote[],
    orders: (ord.data ?? []) as SalesOrder[],
  }
}

export async function fetchDemandActivity(leadId: string): Promise<DemandActivityItem[]> {
  const { data, error } = await supabase
    .from('demand_activity').select('action, entity_type, entity_id, details, created_at')
    .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(50)
  if (error) { console.warn('[demand] activity read failed', error); return [] }
  return (data ?? []) as DemandActivityItem[]
}

export async function fetchRequests(businessId: string): Promise<LeadRequest[]> {
  const { data, error } = await supabase.from('lead_requests').select('*')
    .eq('business_id', businessId).order('created_at', { ascending: false })
  if (error) { console.warn('[demand] requests read failed', error); return [] }
  return (data ?? []) as LeadRequest[]
}

export async function fetchOrders(businessId: string): Promise<SalesOrder[]> {
  const { data, error } = await supabase.from('sales_orders').select('*')
    .eq('business_id', businessId).order('created_at', { ascending: false })
  if (error) { console.warn('[demand] orders read failed', error); return [] }
  return (data ?? []) as SalesOrder[]
}

export async function fetchDemandFunnel(businessId: string): Promise<DemandFunnel | null> {
  const { data, error } = await supabase.rpc('demand_funnel', { p_business: businessId })
  if (error) { console.warn('[demand] funnel failed', error); return null }
  return (data as DemandFunnel | null) ?? null
}

export async function fetchDemandRevenue(businessId: string): Promise<DemandRevenue | null> {
  const { data, error } = await supabase.rpc('demand_revenue', { p_business: businessId })
  if (error) { console.warn('[demand] revenue failed', error); return null }
  return (data as DemandRevenue | null) ?? null
}

export async function fetchDemandPipeline(businessId: string): Promise<DemandPipeline | null> {
  const { data, error } = await supabase.rpc('demand_pipeline', { p_business: businessId })
  if (error) { console.warn('[demand] pipeline failed', error); return null }
  return (data as DemandPipeline | null) ?? null
}

// ---- pure helpers (unit-tested) ----------------------------------------

/** Where the chain stands, shown as Lead #1 → Request #2 → Quote #3 → Order #4 */
export function chainSummary(chain: DemandChain): { label: string; done: boolean }[] {
  const steps: { label: string; done: boolean }[] = [
    { label: 'Request', done: chain.requests.length > 0 },
    { label: 'Quote', done: chain.quotes.length > 0 },
    { label: 'Order', done: chain.orders.length > 0 },
  ]
  return steps
}

export function canOrder(quote: DemandQuote): { ok: boolean; reason?: string } {
  if (quote.status === 'accepted') return { ok: true }
  if (['draft', 'sent', 'viewed'].includes(quote.status)) return { ok: false, reason: 'Quote must be accepted before ordering' }
  if (quote.status === 'converted') return { ok: false, reason: 'Quote already converted to an order' }
  return { ok: false, reason: `Quote is ${quote.status}` }
}

/** Next lifecycle statuses for an entity (what the UI offers on transition) */
export function nextStatuses(entity: 'request' | 'quote' | 'order', current: string): string[] {
  const map: Record<string, Record<string, string[]>> = {
    request: {
      new: ['reviewing', 'rejected'],
      reviewing: ['qualified', 'abandoned'],
      qualified: ['quoted', 'abandoned'],
      quoted: ['accepted', 'rejected'],
      accepted: ['fulfilled', 'rejected'],
      fulfilled: [],
      rejected: ['reviewing'],
      abandoned: ['reviewing'],
    },
    quote: {
      draft: ['sent', 'rejected'],
      sent: ['viewed', 'accepted', 'rejected', 'expired'],
      viewed: ['accepted', 'rejected', 'expired'],
      accepted: [],
      rejected: ['draft'],
      expired: ['draft'],
      converted: [],
    },
    order: {
      confirmed: ['in_fulfilment', 'cancelled'],
      in_fulfilment: ['fulfilled', 'cancelled'],
      fulfilled: ['completed'],
      completed: [],
      cancelled: [],
    },
  }
  return (map[entity] as Record<string, string[]>)[current] ?? []
}
