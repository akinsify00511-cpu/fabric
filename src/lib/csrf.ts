// CSRF Protection Utility
// Generates and validates CSRF tokens for state-changing operations

const CSRF_TOKEN_KEY = 'avenize_csrf_token'
const CSRF_HEADER = 'x-csrf-token'

// Generate a random CSRF token
export function generateCSRFToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

// Get or create CSRF token
export function getCSRFToken(): string {
  let token = localStorage.getItem(CSRF_TOKEN_KEY)
  if (!token) {
    token = generateCSRFToken()
    localStorage.setItem(CSRF_TOKEN_KEY, token)
  }
  return token
}

// Validate CSRF token (check token matches between header and stored)
export function validateCSRFToken(headerToken: string | null): boolean {
  if (!headerToken) return false
  const storedToken = localStorage.getItem(CSRF_TOKEN_KEY)
  if (!storedToken) return false
  return timingSafeEqual(headerToken, storedToken)
}

// Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

// Create headers with CSRF token
export function createCSRFHeaders(): HeadersInit {
  return {
    [CSRF_HEADER]: getCSRFToken(),
    'Content-Type': 'application/json',
  }
}

// Hook for fetching with CSRF
export async function csrfFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = createCSRFHeaders()
  
  // Merge with existing headers
  if (options.headers) {
    const existingHeaders = options.headers as Record<string, string>
    return fetch(url, {
      ...options,
      headers: {
        ...existingHeaders,
        ...headers,
      },
      credentials: 'include',
    })
  }
  
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  })
}

// Validate request on server side (for Supabase Edge Functions)
export function createCSRFValidator() {
  return async (req: Request): Promise<{ valid: boolean; error?: string }> => {
    // Skip validation for GET, HEAD, OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return { valid: true }
    }

    const token = req.headers.get(CSRF_HEADER)
    
    if (!token) {
      return { valid: false, error: 'CSRF token missing' }
    }

    // For full security, you would validate against a server-side token
    // For now, we validate the format
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return { valid: false, error: 'Invalid CSRF token format' }
    }

    return { valid: true }
  }
}

// Clear CSRF token (on logout)
export function clearCSRFToken(): void {
  localStorage.removeItem(CSRF_TOKEN_KEY)
}

export { CSRF_HEADER }
