export type Contact = {
  id: string
  business_id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  created_at: string
}

export type Deal = {
  id: string
  business_id: string
  contact_id: string | null
  owner_id: string | null
  title: string
  stage: 'new' | 'qualified' | 'proposal' | 'won' | 'lost'
  value: number
  currency: string
  created_at: string
}

export type Product = {
  id: string
  business_id: string
  name: string
  sku: string | null
  unit_price: number
  currency: string
  stock_qty: number
  low_stock_threshold: number
}

export type Invoice = {
  id: string
  business_id: string
  deal_id: string | null
  contact_id: string | null
  amount: number
  currency: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  due_date: string | null
  created_at: string
}

export type LeaveRequest = {
  id: string
  business_id: string
  staff_id: string
  start_date: string
  end_date: string
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
}
