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

export type BusinessBranding = {
  id: string
  business_id: string
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  primary_color: string
  accent_color: string
  background_color: string
  surface_color: string
  text_color: string
  dark_primary_color: string
  dark_accent_color: string
  dark_background_color: string
  dark_surface_color: string
  dark_text_color: string
  theme_mode: 'light' | 'dark' | 'system'
  border_radius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  font_family: 'default' | 'inter' | 'poppins' | 'roboto' | 'custom'
  custom_name: string | null
  custom_tagline: string | null
  website_url: string | null
  twitter_url: string | null
  linkedin_url: string | null
  facebook_url: string | null
  instagram_url: string | null
  created_at: string
  updated_at: string
}
