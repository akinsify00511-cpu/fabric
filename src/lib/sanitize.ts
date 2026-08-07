// Input Sanitization Utilities
// Centralized sanitization for preventing XSS and injection attacks

// Maximum lengths for common fields
export const MAX_LENGTHS = {
  NAME: 100,
  EMAIL: 254,
  PHONE: 20,
  TEXT: 1000,
  LONG_TEXT: 5000,
  UUID: 36,
  URL: 2000,
}

// Sanitize string input
export function sanitizeString(input: unknown, maxLength: number = MAX_LENGTHS.TEXT): string {
  if (typeof input !== 'string') return ''
  
  return input
    .trim()
    .slice(0, maxLength)
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove script-like patterns
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    // Remove control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Remove null bytes
    .replace(/\0/g, '')
}

// Sanitize for HTML display (escape special characters)
export function escapeHtml(input: string): string {
  const div = document.createElement('div')
  div.textContent = input
  return div.innerHTML
}

// Sanitize email
export function sanitizeEmail(input: unknown): string {
  if (typeof input !== 'string') return ''
  
  const sanitized = input.trim().slice(0, MAX_LENGTHS.EMAIL)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  
  return emailRegex.test(sanitized) ? sanitized.toLowerCase() : ''
}

// Sanitize phone number
export function sanitizePhone(input: unknown): string {
  if (typeof input !== 'string') return ''
  
  // Keep only digits, +, -, (, )
  return input.replace(/[^\d+\-() ]/g, '').slice(0, MAX_LENGTHS.PHONE)
}

// Sanitize UUID
export function sanitizeUUID(input: unknown): string | null {
  if (typeof input !== 'string') return null
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(input) ? input : null
}

// Sanitize URL (only allow http, https, mailto)
export function sanitizeUrl(input: unknown): string {
  if (typeof input !== 'string') return ''
  
  const sanitized = input.trim().slice(0, MAX_LENGTHS.URL)
  
  // Only allow safe protocols
  if (/^(https?|mailto):\/\//i.test(sanitized)) {
    return sanitized
  }
  
  // Remove potentially dangerous patterns
  return sanitized
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
}

// Sanitize number (integer)
export function sanitizeInt(input: unknown, min?: number, max?: number): number {
  const num = parseInt(String(input), 10)
  if (isNaN(num)) return 0
  
  let result = num
  if (min !== undefined) result = Math.max(min, result)
  if (max !== undefined) result = Math.min(max, result)
  
  return result
}

// Sanitize number (float)
export function sanitizeFloat(input: unknown, min?: number, max?: number, decimals: number = 2): number {
  const num = parseFloat(String(input))
  if (isNaN(num)) return 0
  
  let result = Number(num.toFixed(decimals))
  if (min !== undefined) result = Math.max(min, result)
  if (max !== undefined) result = Math.min(max, result)
  
  return result
}

// Sanitize object (only keep allowed keys)
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  allowedKeys: string[]
): Partial<T> {
  const result: Partial<T> = {}
  
  for (const key of allowedKeys) {
    if (key in obj) {
      (result as Record<string, unknown>)[key] = obj[key]
    }
  }
  
  return result
}

// Sanitize array (remove duplicates and invalid items)
export function sanitizeArray<T>(arr: unknown[], validator?: (item: unknown) => item is T): T[] {
  if (!Array.isArray(arr)) return []
  
  if (validator) {
    return arr.filter(validator)
  }
  
  return [...new Set(arr)] as T[]
}

// Validate and sanitize search query
export function sanitizeSearchQuery(input: unknown): string {
  if (typeof input !== 'string') return ''
  
  // Remove potentially dangerous characters for search
  return input
    .trim()
    .slice(0, MAX_LENGTHS.TEXT)
    .replace(/[<>\"\'\\]/g, '')
}

// Strip all HTML tags
export function stripHtml(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

// Validate password strength
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters')
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

// Escape for SQL-like comparisons (not actual SQL injection prevention - use parameterized queries)
export function escapeWildcards(input: string): string {
  return input.replace(/[%_]/g, '\\$&')
}
