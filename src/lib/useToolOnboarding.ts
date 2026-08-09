import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'avenize_tool_onboarding'

type SeenTools = Record<string, boolean>

function getSeen(): SeenTools {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveSeen(seen: SeenTools) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seen))
}

/**
 * Tracks whether a user has seen the onboarding popup for a given tool.
 * First visit returns `true` (should show); subsequent visits return `false`.
 * Call `markSeen(toolKey)` to dismiss and persist.
 */
export function useToolOnboarding(toolKey: string) {
  const [shouldShow, setShouldShow] = useState(false)

  useEffect(() => {
    if (!toolKey) return
    const seen = getSeen()
    if (!seen[toolKey]) {
      setShouldShow(true)
    }
  }, [toolKey])

  const markSeen = useCallback(() => {
    const seen = getSeen()
    seen[toolKey] = true
    saveSeen(seen)
    setShouldShow(false)
  }, [toolKey])

  return { shouldShow, markSeen }
}

/**
 * Onboarding content for each tool, written in the persona's voice.
 * Kept short — one headline, one line of guidance, one suggested action.
 */
export const TOOL_ONBOARDING_CONTENT: Record<string, { title: string; body: string; cta?: string }> = {
  dashboard: {
    title: 'Your command center',
    body: 'See revenue, deals, and team activity at a glance. The numbers here are live from your invoices, CRM, and projects.',
    cta: 'Explore your dashboard',
  },
  chat: {
    title: 'Team chat — pick up where email left off',
    body: 'Create channels for projects or departments, send messages in real time, and @mention teammates. Try creating a channel for your team.',
    cta: 'Create a channel',
  },
  tasks: {
    title: 'Turn conversations into action',
    body: 'Create tasks, assign them to teammates, and track them to completion. Tasks link to projects and deals automatically.',
    cta: 'Create your first task',
  },
  calendar: {
    title: 'Your shared calendar',
    body: 'Schedule meetings, set reminders, and see everyone\u2019s availability. Meeting invites notify attendees automatically.',
    cta: 'Schedule a meeting',
  },
  'time-tracking': {
    title: 'Track time, automatically',
    body: 'Clock in and out, and your hours flow straight to payroll. Project time is billed to the right client without spreadsheets.',
  },
  knowledge: {
    title: 'Your team\u2019s playbook',
    body: 'Write SOPs, policies, and guides here. Search across all documents, and share the right doc with the right person.',
  },
  tickets: {
    title: 'Support tickets, organized',
    body: 'Customer issues land here as tickets. Assign, prioritize, and resolve \u2014 every response is tracked for quality.',
  },
  crm: {
    title: 'Your sales pipeline',
    body: 'Add contacts, create deals, and watch them move from lead to won. Every interaction is logged automatically.',
    cta: 'Add a contact',
  },
  social: {
    title: 'Social media, scheduled',
    body: 'Plan and schedule posts across platforms. See engagement and respond to comments without leaving Avenize.',
  },
  projects: {
    title: 'Projects that stay on track',
    body: 'Create projects, break them into tasks, assign owners, and track progress. Budgets and timelines update in real time.',
    cta: 'Create a project',
  },
  finance: {
    title: 'Invoices, payments, and cash flow',
    body: 'Create invoices, record payments, and see your cash position. VAT and WHT are calculated automatically for Nigerian businesses.',
    cta: 'Create an invoice',
  },
  people: {
    title: 'Your team, organized',
    body: 'Manage staff records, departments, and roles. Onboard new hires and track performance \u2014 all in one place.',
  },
  inventory: {
    title: 'Stock and procurement',
    body: 'Track products, receive purchase orders, and monitor stock levels. Low-stock alerts keep you ahead of shortages.',
  },
  meetings: {
    title: 'Plan and run meetings',
    body: 'Create meetings with agendas, invite attendees, and send reminders. Notes and action items are saved automatically.',
    cta: 'Schedule a meeting',
  },
  payroll: {
    title: 'Payroll, simplified',
    body: 'Run payroll based on time tracking and salary records. Payslips are generated and taxes are calculated automatically.',
  },
  approvals: {
    title: 'Approval workflows',
    body: 'Requests for purchases, leave, and expenses flow here for approval. Set up multi-level approval rules per amount.',
  },
  reports: {
    title: 'Reports and insights',
    body: 'See how your business is doing across sales, finance, and operations. Export reports for board meetings or accountants.',
  },
  settings: {
    title: 'Configure Avenize',
    body: 'Set up integrations (Paystack, SMS, email), manage billing, and customize your workspace. Only admins see this section.',
  },
}
