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
  stage: 'prospect' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
  value: number
  created_at: string
}

export type Product = {
  id: string
  business_id: string
  name: string
  sku: string | null
  price: number  // matches schema
  cost: number
  stock: number  // matches schema
  low_stock_threshold: number
  created_at: string
}

export type Invoice = {
  id: string
  business_id: string
  deal_id: string | null
  client_name: string
  client_email: string | null
  invoice_number: string | null
  subtotal: number
  tax: number
  total: number  // matches schema (was 'amount')
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
  approved_by: string | null
  created_at: string
}

export type Project = {
  id: string
  business_id: string
  name: string
  description: string | null
  status: 'active' | 'done' | 'on_hold' | 'cancelled'
  owner_id: string | null
  due_date: string | null
  created_at: string
}

export type Staff = {
  id: string
  business_id: string
  user_id: string
  name: string
  email: string
  role: 'owner' | 'manager' | 'staff'
  full_name: string | null
  job_title: string | null
  active: boolean
}
