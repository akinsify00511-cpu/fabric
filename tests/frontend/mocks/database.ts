import { rest } from 'msw'

// Mock Supabase client for testing
export const mockSupabaseClient = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: null, error: null }),
        then: (cb: (r: { data: unknown[]; error: null }) => void) => cb({ data: [], error: null }),
      }),
      order: () => Promise.resolve({ data: [], error: null }),
      limit: () => Promise.resolve({ data: [], error: null }),
    }),
    insert: (data: unknown) => Promise.resolve({ data, error: null }),
    update: (data: unknown) => ({ eq: () => Promise.resolve({ data, error: null }) }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
  },
  channel: () => ({
    on: () => ({ subscribe: () => {} }),
    subscribe: () => {},
  }),
}

// Mock browser APIs
export const mockBrowserAPIs = () => {
  // Mock localStorage
  const localStorageMock = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  }
  Object.defineProperty(window, 'localStorage', { value: localStorageMock })

  // Mock sessionStorage
  const sessionStorageMock = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  }
  Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock })
}
