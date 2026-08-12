// CRM Utilities
// Helper functions for CRM operations

import { supabase } from './supabase'

export interface Lead {
  id: string
  business_id?: string | null
  full_name: string
  company_name?: string
  email: string
  phone?: string
  interested_in?: string
  message?: string
  source?: string
  status: string
  created_at: string
}

export interface Contact {
  id: string
  business_id: string
  full_name: string
  email: string
  phone?: string
  company?: string
  source?: string
  lead_id?: string
  notes?: string
  created_at: string
}

// Convert a lead to a CRM contact
export async function convertLeadToContact(
  lead: Lead,
  businessId: string,
  createdBy: string
): Promise<{ success: boolean; contact?: Contact; error?: string }> {
  try {
    // Create contact from lead
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        business_id: businessId,
        full_name: lead.full_name,
        email: lead.email,
        phone: lead.phone || null,
        company: lead.company_name || null,
        source: lead.source || 'website',
        lead_id: lead.id,
        notes: lead.message || null,
      })
      .select()
      .single()

    if (contactError) {
      console.error('Failed to create contact:', contactError)
      return { success: false, error: contactError.message }
    }

    // Update lead status to converted
    await supabase
      .from('leads')
      .update({ status: 'converted' })
      .eq('id', lead.id)

    return { success: true, contact }
  } catch (error) {
    console.error('Error converting lead:', error)
    return { success: false, error: (error as Error).message }
  }
}

// Get leads for a business
export async function getLeads(businessId: string): Promise<Lead[]> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching leads:', error)
    return []
  }
}

// Get lead by ID
export async function getLead(leadId: string): Promise<Lead | null> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle()

    if (error) return null
    return data
  } catch {
    return null
  }
}

// Update lead status
export async function updateLeadStatus(
  leadId: string,
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('leads')
      .update({ 
        status,
        contacted_at: status === 'contacted' ? new Date().toISOString() : undefined,
        converted_at: status === 'converted' ? new Date().toISOString() : undefined,
      })
      .eq('id', leadId)

    return !error
  } catch {
    return false
  }
}

// Assign lead to staff member
export async function assignLead(
  leadId: string,
  staffId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('leads')
      .update({ assigned_to: staffId })
      .eq('id', leadId)

    return !error
  } catch {
    return false
  }
}

// Get unassigned leads
export async function getUnassignedLeads(businessId: string): Promise<Lead[]> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', businessId)
      .is('assigned_to', null)
      .eq('status', 'new')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching unassigned leads:', error)
    return []
  }
}

// Get leads by status
export async function getLeadsByStatus(
  businessId: string,
  status: string
): Promise<Lead[]> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching leads by status:', error)
    return []
  }
}

// Get lead statistics
export async function getLeadStats(businessId: string): Promise<{
  total: number
  new: number
  contacted: number
  qualified: number
  converted: number
  lost: number
}> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('status')
      .eq('business_id', businessId)

    if (error) throw error

    const stats = {
      total: data?.length || 0,
      new: 0,
      contacted: 0,
      qualified: 0,
      converted: 0,
      lost: 0,
    }

    data?.forEach(lead => {
      const status = lead.status as keyof typeof stats
      if (status in stats) {
        stats[status]++
      }
    })

    return stats
  } catch {
    return { total: 0, new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 }
  }
}

// Lead source labels
export const LEAD_SOURCES = {
  website: { label: 'Website', icon: '🌐' },
  referral: { label: 'Referral', icon: '👥' },
  social: { label: 'Social Media', icon: '📱' },
  ad: { label: 'Advertisement', icon: '📢' },
  email: { label: 'Email Campaign', icon: '✉️' },
  phone: { label: 'Phone Call', icon: '📞' },
  event: { label: 'Event', icon: '🎪' },
  other: { label: 'Other', icon: '📋' },
} as const

// Product interest labels
export const PRODUCT_INTERESTS = {
  crm: { label: 'CRM & Sales', icon: '📊' },
  finance: { label: 'Finance & Invoicing', icon: '💰' },
  projects: { label: 'Projects & Tasks', icon: '📋' },
  hr: { label: 'HR & People', icon: '👔' },
  full: { label: 'Complete Business Suite', icon: '🏢' },
} as const
