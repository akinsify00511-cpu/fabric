// SECURE SHARED SECURITY UTILITIES FOR EDGE FUNCTIONS

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export interface AuthUser {
  id: string
  email: string
  role: string
  business_id?: string
}

export async function verifyAuth(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.substring(7)
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error || !user) {
      return null
    }

    const { data: staff } = await supabase
      .from('staff')
      .select('role, business_id')
      .eq('user_id', user.id)
      .single()

    return {
      id: user.id,
      email: user.email || '',
      role: staff?.role || 'staff',
      business_id: staff?.business_id
    }
  } catch {
    return null
  }
}

export async function requireAuth(req: Request): Promise<AuthUser> {
  const user = await verifyAuth(req)
  if (!user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  return user
}

export async function requireRole(req: Request, roles: string[]): Promise<AuthUser> {
  const user = await requireAuth(req)
  if (!roles.includes(user.role) && user.role !== 'owner') {
    throw new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  return user
}

export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') return ''
  return input.trim().slice(0, maxLength).replace(/[<>]/g, '').replace(/[\x00-\x1F\x7F]/g, '')
}

export function sanitizeEmail(email: string): string {
  const sanitized = sanitizeString(email, 254)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(sanitized) ? sanitized : ''
}

export function sanitizeUUID(id: string): string | null {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(id) ? id : null
}

const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

export function checkRateLimit(
  identifier: string, 
  maxRequests: number = 100, 
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const record = rateLimitStore.get(identifier)
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs }
  }
  
  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetIn: record.resetTime - now }
  }
  
  record.count++
  return { allowed: true, remaining: maxRequests - record.count, resetIn: record.resetTime - now }
}

export function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': 'https://avenize.riverwayse.com,https://www.avenize.riverwayse.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  }
}
