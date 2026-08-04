// Data persistence layer
// Demo mode: localStorage
// Real mode: Supabase

import { supabase } from './supabase'
import { useAuth } from './AuthContext'

const KEYS = {
  DEALS: 'avenize_deals',
  CONTACTS: 'avenize_contacts',
  INVOICES: 'avenize_invoices',
  PROJECTS: 'avenize_projects',
  TASKS: 'avenize_tasks',
}

// Check if demo mode
export function isDemoMode(): boolean {
  return localStorage.getItem('avenize_demo') === 'true'
}

// Generic localStorage operations
function getLocal<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : defaultValue
  } catch {
    return defaultValue
  }
}

function setLocal<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

// DEALS
export async function getDeals(): Promise<any[]> {
  if (isDemoMode()) {
    return getLocal(KEYS.DEALS, [])
  }
  // Real mode: fetch from Supabase
  const { data } = await supabase.from('deals').select('*').order('created_at', { ascending: false })
  return data || []
}

export function saveDealsLocally(deals: any[]): void {
  setLocal(KEYS.DEALS, deals)
}

// CONTACTS
export async function getContacts(): Promise<any[]> {
  if (isDemoMode()) {
    return getLocal(KEYS.CONTACTS, [])
  }
  const { data } = await supabase.from('contacts').select('*').order('created_at', { ascending: false })
  return data || []
}

export function saveContactsLocally(contacts: any[]): void {
  setLocal(KEYS.CONTACTS, contacts)
}

// INVOICES
export async function getInvoices(): Promise<any[]> {
  if (isDemoMode()) {
    return getLocal(KEYS.INVOICES, [])
  }
  const { data } = await supabase.from('invoices').select('*').order('created_at', { ascending: false })
  return data || []
}

export function saveInvoicesLocally(invoices: any[]): void {
  setLocal(KEYS.INVOICES, invoices)
}

// Clear all demo data
export function clearDemoData(): void {
  Object.values(KEYS).forEach(key => localStorage.removeItem(key))
  localStorage.removeItem('avenize_demo')
  localStorage.removeItem('avenize_demo_user')
}

// Initialize demo data if empty
export function initDemoData(defaultData: { deals: any[], contacts: any[], invoices: any[] }): void {
  if (isDemoMode()) {
    if (!localStorage.getItem(KEYS.DEALS)) {
      setLocal(KEYS.DEALS, defaultData.deals)
    }
    if (!localStorage.getItem(KEYS.CONTACTS)) {
      setLocal(KEYS.CONTACTS, defaultData.contacts)
    }
    if (!localStorage.getItem(KEYS.INVOICES)) {
      setLocal(KEYS.INVOICES, defaultData.invoices)
    }
  }
}
