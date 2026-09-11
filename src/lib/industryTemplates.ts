import type { ToolKey } from './useToolAccess'

export type IndustryTemplate = {
  id: string
  name: string
  emoji: string
  description: string
  workflow: string[]
  defaultTools: ToolKey[]
  dashboardFocus: string[]
  terminology: {
    customer: string
    pipeline: string
    work: string
  }
}

/**
 * Industry templates are starting configurations, not access-control rules.
 * Entitlements/RLS remain authoritative. A business can change its template
 * and workspace tools later without changing its plan or permissions.
 */
export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    id: 'construction', name: 'Construction', emoji: '🏗️',
    description: 'Projects, sites, materials, crews and job profitability.',
    workflow: ['Lead', 'Request', 'Quote', 'Accepted Quote', 'Project', 'Revenue'],
    defaultTools: ['projects', 'inventory', 'tasks', 'time-tracking', 'people', 'finance', 'calendar'],
    dashboardFocus: ['Project progress', 'Site work', 'Materials', 'Job profitability'],
    terminology: { customer: 'Client', pipeline: 'Jobs pipeline', work: 'Projects' },
  },
  {
    id: 'real_estate', name: 'Real Estate', emoji: '🏠',
    description: 'Leads, properties, viewings, offers, deals and commissions.',
    workflow: ['Lead', 'Viewing', 'Offer', 'Accepted Offer', 'Transaction', 'Commission'],
    defaultTools: ['crm', 'projects', 'finance', 'people', 'tasks', 'calendar'],
    dashboardFocus: ['Lead conversion', 'Property pipeline', 'Transactions', 'Commission'],
    terminology: { customer: 'Client', pipeline: 'Property pipeline', work: 'Transactions' },
  },
  {
    id: 'manufacturing', name: 'Manufacturing', emoji: '🏭',
    description: 'Production, inventory, procurement, quality and delivery.',
    workflow: ['Enquiry', 'Quote', 'Order', 'Production', 'Quality Check', 'Delivery'],
    defaultTools: ['inventory', 'projects', 'finance', 'tasks', 'people', 'reports'],
    dashboardFocus: ['Production output', 'Stock', 'Orders', 'Quality'],
    terminology: { customer: 'Customer', pipeline: 'Order pipeline', work: 'Production' },
  },
  {
    id: 'retail', name: 'Retail', emoji: '🛒',
    description: 'Customers, products, stock, sales and daily store operations.',
    workflow: ['Lead', 'Sale', 'Payment', 'Fulfilment', 'Repeat Sale'],
    defaultTools: ['inventory', 'crm', 'finance', 'people', 'tasks'],
    dashboardFocus: ['Sales', 'Stock', 'Customers', 'Cash position'],
    terminology: { customer: 'Customer', pipeline: 'Sales pipeline', work: 'Store operations' },
  },
  {
    id: 'professional_services', name: 'Professional Services', emoji: '💼',
    description: 'Clients, proposals, engagements, time and billable work.',
    workflow: ['Lead', 'Discovery', 'Proposal', 'Accepted Proposal', 'Engagement', 'Revenue'],
    defaultTools: ['crm', 'projects', 'tasks', 'time-tracking', 'finance', 'people', 'calendar'],
    dashboardFocus: ['Pipeline', 'Active engagements', 'Billable work', 'Revenue'],
    terminology: { customer: 'Client', pipeline: 'Client pipeline', work: 'Engagements' },
  },
  {
    id: 'hospitality', name: 'Hospitality', emoji: '🏨',
    description: 'Guests, bookings, service delivery, staff and daily operations.',
    workflow: ['Enquiry', 'Booking', 'Check-in', 'Service', 'Check-out', 'Revenue'],
    defaultTools: ['crm', 'calendar', 'people', 'tasks', 'finance', 'inventory', 'events'],
    dashboardFocus: ['Bookings', 'Guest experience', 'Occupancy', 'Revenue'],
    terminology: { customer: 'Guest', pipeline: 'Booking pipeline', work: 'Operations' },
  },
  {
    id: 'healthcare', name: 'Healthcare', emoji: '🩺',
    description: 'Patients, appointments, care workflows, staff and administration.',
    workflow: ['Enquiry', 'Appointment', 'Consultation', 'Care', 'Follow-up'],
    defaultTools: ['crm', 'calendar', 'people', 'tasks', 'finance', 'reports'],
    dashboardFocus: ['Appointments', 'Patient flow', 'Staff workload', 'Revenue'],
    terminology: { customer: 'Patient', pipeline: 'Patient flow', work: 'Care workflow' },
  },
  {
    id: 'education', name: 'Education', emoji: '🎓',
    description: 'Learners, enrolment, classes, staff, fees and outcomes.',
    workflow: ['Enquiry', 'Application', 'Enrolment', 'Learning', 'Assessment', 'Completion'],
    defaultTools: ['crm', 'people', 'calendar', 'tasks', 'finance', 'knowledge', 'reports'],
    dashboardFocus: ['Enrolment', 'Learner activity', 'Fees', 'Outcomes'],
    terminology: { customer: 'Learner', pipeline: 'Enrolment pipeline', work: 'Learning' },
  },
  {
    id: 'logistics', name: 'Logistics & Distribution', emoji: '🚚',
    description: 'Orders, dispatch, vehicles, inventory, delivery and customers.',
    workflow: ['Request', 'Quote', 'Order', 'Dispatch', 'Delivery', 'Revenue'],
    defaultTools: ['crm', 'inventory', 'projects', 'tasks', 'people', 'finance', 'calendar'],
    dashboardFocus: ['Orders', 'Dispatch', 'Deliveries', 'Fleet workload'],
    terminology: { customer: 'Customer', pipeline: 'Order pipeline', work: 'Deliveries' },
  },
  {
    id: 'technology', name: 'Technology', emoji: '💻',
    description: 'Leads, product work, projects, support, knowledge and recurring revenue.',
    workflow: ['Lead', 'Discovery', 'Proposal', 'Contract', 'Implementation', 'Revenue'],
    defaultTools: ['crm', 'projects', 'tasks', 'tickets', 'knowledge', 'finance', 'calendar'],
    dashboardFocus: ['Pipeline', 'Product work', 'Support', 'Revenue'],
    terminology: { customer: 'Customer', pipeline: 'Sales pipeline', work: 'Product work' },
  },
  {
    id: 'marketing_agency', name: 'Marketing & Creative', emoji: '🎨',
    description: 'Clients, campaigns, creative work, approvals and performance.',
    workflow: ['Lead', 'Brief', 'Proposal', 'Accepted', 'Campaign', 'Report'],
    defaultTools: ['crm', 'campaigns', 'social', 'projects', 'tasks', 'time-tracking', 'reports'],
    dashboardFocus: ['Client pipeline', 'Campaigns', 'Creative workload', 'Performance'],
    terminology: { customer: 'Client', pipeline: 'Client pipeline', work: 'Campaigns' },
  },
  {
    id: 'other', name: 'Other', emoji: '📋',
    description: 'A flexible business workspace you can shape around your operation.',
    workflow: ['Lead', 'Request', 'Quote', 'Order', 'Delivery', 'Revenue'],
    defaultTools: ['crm', 'tasks', 'people', 'finance', 'calendar'],
    dashboardFocus: ['Sales', 'Work', 'People', 'Finance'],
    terminology: { customer: 'Customer', pipeline: 'Business pipeline', work: 'Work' },
  },
]

export const INDUSTRY_TEMPLATE_MAP = Object.fromEntries(
  INDUSTRY_TEMPLATES.map((template) => [template.id, template]),
) as Record<string, IndustryTemplate>

export function getIndustryTemplate(industry: string | null | undefined): IndustryTemplate {
  return INDUSTRY_TEMPLATE_MAP[industry || 'other'] || INDUSTRY_TEMPLATE_MAP.other
}
