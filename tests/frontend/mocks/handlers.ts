import { http, HttpResponse } from 'msw'

// Demo data for mocking Supabase responses
const DEMO_USER = {
  id: 'test-user-id',
  email: 'test@avenize.com',
  full_name: 'Test User',
  role: 'owner',
  business_id: 'test-business-id',
}

const DEMO_BUSINESS = {
  id: 'test-business-id',
  name: 'Test Business',
  currency: 'NGN',
}

// Mock Supabase REST API responses
export const handlers = [
  // Auth endpoints
  http.post('https://*.supabase.co/auth/v1/token', () => {
    return HttpResponse.json({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      user: DEMO_USER,
    })
  }),

  // Staff table
  http.get('https://*.supabase.co/rest/v1/staff', () => {
    return HttpResponse.json([DEMO_USER])
  }),

  http.post('https://*.supabase.co/rest/v1/staff', () => {
    return HttpResponse.json({ ...DEMO_USER, id: 'new-staff-id' }, { status: 201 })
  }),

  // Deals table
  http.get('https://*.supabase.co/rest/v1/deals', () => {
    return HttpResponse.json([
      { id: '1', title: 'Test Deal', stage: 'active', value: 100000 },
    ])
  }),

  // Tasks table
  http.get('https://*.supabase.co/rest/v1/tasks', () => {
    return HttpResponse.json([
      { id: '1', title: 'Test Task', status: 'todo' },
    ])
  }),

  http.post('https://*.supabase.co/rest/v1/tasks', () => {
    return HttpResponse.json({ id: 'new-task-id', title: 'New Task', status: 'todo' }, { status: 201 })
  }),

  // Invoices table
  http.get('https://*.supabase.co/rest/v1/invoices', () => {
    return HttpResponse.json([
      { id: '1', number: 'INV-001', amount: 50000, status: 'sent' },
    ])
  }),

  // Notifications table
  http.get('https://*.supabase.co/rest/v1/notifications', () => {
    return HttpResponse.json([])
  }),

  http.post('https://*.supabase.co/rest/v1/notifications', () => {
    return HttpResponse.json({ id: 'new-notification-id' }, { status: 201 })
  }),

  // Automations table
  http.get('https://*.supabase.co/rest/v1/automations', () => {
    return HttpResponse.json([
      { id: '1', name: 'Test Automation', trigger_type: 'deal_won', action_type: 'send_notification' },
    ])
  }),

  // Webhooks table
  http.get('https://*.supabase.co/rest/v1/webhooks', () => {
    return HttpResponse.json([])
  }),

  // Catch-all for any other Supabase requests
  http.all('https://*.supabase.co/:path', () => {
    return HttpResponse.json([])
  }),
]
