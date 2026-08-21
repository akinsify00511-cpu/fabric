import { supabase } from './supabase'

export type RiverwaysAdminOverview = {
  generated_at: string
  database: { status: string }
  integrity: {
    rules: number
    findings: number
    open_findings: number
    repairs: number
  }
  dependencies: {
    total: number
    healthy: number
    unhealthy: number
  }
}

export async function isRiverwaysAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_riverways_admin')
  if (error) return false
  return data === true
}

export async function getRiverwaysAdminOverview(): Promise<RiverwaysAdminOverview> {
  const { data, error } = await supabase.rpc('riverways_admin_overview')
  if (error) throw error
  return data as RiverwaysAdminOverview
}
