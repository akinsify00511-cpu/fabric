// Data persistence layer — Supabase-backed.
// (Legacy localStorage demo-mode code removed; all reads now hit Supabase.)

import { supabase } from './supabase'

// DEALS
export async function getDeals(): Promise<any[]> {
  const { data } = await supabase.from('deals').select('*').order('created_at', { ascending: false })
  return data || []
}

// CONTACTS
export async function getContacts(): Promise<any[]> {
  const { data } = await supabase.from('contacts').select('*').order('created_at', { ascending: false })
  return data || []
}

// INVOICES
export async function getInvoices(): Promise<any[]> {
  const { data } = await supabase.from('invoices').select('*').order('created_at', { ascending: false })
  return data || []
}
