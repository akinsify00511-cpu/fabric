import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'

export type Suggestion = {
  label: string
  path: string
  description: string
}

type FeatureSuggestionsProps = {
  suggestions: Suggestion[]
  title?: string
  className?: string
}

export default function FeatureSuggestions({ suggestions, title = "You might also like", className = "" }: FeatureSuggestionsProps) {
  const navigate = useNavigate()
  const location = useLocation()

  // Filter out current page
  const filteredSuggestions = suggestions.filter(s => s.path !== location.pathname)

  if (filteredSuggestions.length === 0) return null

  return (
    <div className={`bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-medium text-indigo-900">{title}</span>
      </div>
      <div className="grid gap-2">
        {filteredSuggestions.slice(0, 4).map((suggestion, idx) => (
          <button
            key={idx}
            onClick={() => navigate(suggestion.path)}
            className="flex items-center gap-3 p-3 bg-white hover:bg-indigo-50 rounded-lg border border-indigo-100 hover:border-indigo-200 transition group"
          >
            <div className="flex-1 text-left">
              <span className="text-sm font-medium text-gray-900 group-hover:text-indigo-700">
                {suggestion.label}
              </span>
              <span className="text-xs text-gray-900 ml-2">
                {suggestion.description}
              </span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-900 group-hover:text-indigo-500 transition" />
          </button>
        ))}
      </div>
    </div>
  )
}

// Context-aware suggestions based on the current page
export const getContextualSuggestions = (currentPath: string): Suggestion[] => {
  const allSuggestions: Record<string, Suggestion[]> = {
    '/app/crm': [
      { label: 'Tasks', path: '/app/tasks', description: 'Assign tasks from deals' },
      { label: 'Finance', path: '/app/finance', description: 'Create invoices for deals' },
      { label: 'Reports', path: '/app/reports', description: 'Track sales performance' },
    ],
    '/app/tasks': [
      { label: 'Chat', path: '/app/chat', description: 'Discuss tasks with team' },
      { label: 'Calendar', path: '/app/calendar', description: 'Schedule task deadlines' },
      { label: 'People', path: '/app/people', description: 'Assign team members' },
    ],
    '/app/people': [
      { label: 'Chat', path: '/app/chat', description: 'Message team members' },
      { label: 'Time', path: '/app/time', description: 'Track attendance' },
      { label: 'Tasks', path: '/app/tasks', description: 'Assign tasks to staff' },
    ],
    '/app/projects': [
      { label: 'Tasks', path: '/app/tasks', description: 'Break down into tasks' },
      { label: 'Inventory', path: '/app/inventory', description: 'Track project materials' },
      { label: 'Reports', path: '/app/reports', description: 'Project analytics' },
    ],
    '/app/chat': [
      { label: 'Tasks', path: '/app/tasks', description: 'Create tasks from chat' },
      { label: 'Calendar', path: '/app/calendar', description: 'Schedule meetings' },
      { label: 'People', path: '/app/people', description: 'Invite team members' },
    ],
    '/app/calendar': [
      { label: 'Tasks', path: '/app/tasks', description: 'Create tasks from events' },
      { label: 'Meetings', path: '/app/meetings', description: 'Schedule meetings' },
      { label: 'Chat', path: '/app/chat', description: 'Discuss events' },
    ],
    '/app/finance': [
      { label: 'Reports', path: '/app/reports', description: 'Financial analytics' },
      { label: 'CRM', path: '/app/crm', description: 'Track deal payments' },
      { label: 'Invoices', path: '/app/finance', description: 'Generate invoices' },
    ],
    '/app/inventory': [
      { label: 'Finance', path: '/app/finance', description: 'Track inventory value' },
      { label: 'Projects', path: '/app/projects', description: 'Use inventory in projects' },
      { label: 'Reports', path: '/app/reports', description: 'Inventory analytics' },
    ],
    '/app/reports': [
      { label: 'Finance', path: '/app/finance', description: 'Financial reports' },
      { label: 'Projects', path: '/app/projects', description: 'Project analytics' },
      { label: 'CRM', path: '/app/crm', description: 'Sales reports' },
    ],
    '/app/social': [
      { label: 'Campaigns', path: '/app/campaigns', description: 'Email marketing' },
      { label: 'Reports', path: '/app/reports', description: 'Social analytics' },
      { label: 'Chat', path: '/app/chat', description: 'Share posts with team' },
    ],
    '/app/knowledge': [
      { label: 'Chat', path: '/app/chat', description: 'Discuss documentation' },
      { label: 'People', path: '/app/people', description: 'Share with team' },
      { label: 'Tasks', path: '/app/tasks', description: 'Create doc tasks' },
    ],
    '/app/automations': [
      { label: 'Tasks', path: '/app/tasks', description: 'Automate task triggers' },
      { label: 'Reports', path: '/app/reports', description: 'Track automation results' },
      { label: 'Finance', path: '/app/finance', description: 'Automate invoicing' },
    ],
    '/app/tickets': [
      { label: 'Chat', path: '/app/chat', description: 'Discuss support issues' },
      { label: 'Tasks', path: '/app/tasks', description: 'Convert tickets to tasks' },
      { label: 'Reports', path: '/app/reports', description: 'Support analytics' },
    ],
    '/app/branding': [
      { label: 'Social', path: '/app/social', description: 'Apply branding to posts' },
      { label: 'Settings', path: '/app/settings', description: 'More customization' },
      { label: 'Finance', path: '/app/finance', description: 'Branded invoices' },
    ],
    '/app/settings': [
      { label: 'Branding', path: '/app/branding', description: 'Customize appearance' },
      { label: 'People', path: '/app/people', description: 'Manage team access' },
      { label: 'Security', path: '/app/security', description: 'Security settings' },
    ],
    '/app/campaigns': [
      { label: 'Social', path: '/app/social', description: 'Social media integration' },
      { label: 'Reports', path: '/app/reports', description: 'Campaign analytics' },
      { label: 'Finance', path: '/app/finance', description: 'Track conversions' },
    ],
    '/app/approvals': [
      { label: 'Finance', path: '/app/finance', description: 'Expense approvals' },
      { label: 'Time', path: '/app/time', description: 'Leave approvals' },
      { label: 'Requisitions', path: '/app/requisitions', description: 'Purchase approvals' },
    ],
    '/app/payments': [
      { label: 'Finance', path: '/app/finance', description: 'Payment overview' },
      { label: 'Reports', path: '/app/reports', description: 'Payment analytics' },
      { label: 'Invoices', path: '/app/finance', description: 'Generate invoices' },
    ],
    '/app/time': [
      { label: 'People', path: '/app/people', description: 'Staff management' },
      { label: 'Reports', path: '/app/reports', description: 'Time analytics' },
      { label: 'Approvals', path: '/app/approvals', description: 'Leave approvals' },
    ],
    '/app/events': [
      { label: 'Calendar', path: '/app/calendar', description: 'View calendar' },
      { label: 'Chat', path: '/app/chat', description: 'Discuss events' },
      { label: 'People', path: '/app/people', description: 'Invite attendees' },
    ],
    '/app/monitoring': [
      { label: 'Reports', path: '/app/reports', description: 'View analytics' },
      { label: 'Tasks', path: '/app/tasks', description: 'Create alerts tasks' },
      { label: 'Automations', path: '/app/automations', description: 'Set up alerts' },
    ],
    '/app/requisitions': [
      { label: 'Approvals', path: '/app/approvals', description: 'Approve requests' },
      { label: 'Inventory', path: '/app/inventory', description: 'Check stock' },
      { label: 'Finance', path: '/app/finance', description: 'Track expenses' },
    ],
    '/app/meetings': [
      { label: 'Calendar', path: '/app/calendar', description: 'Schedule meetings' },
      { label: 'Tasks', path: '/app/tasks', description: 'Create meeting tasks' },
      { label: 'Chat', path: '/app/chat', description: 'Discuss meetings' },
    ],
    '/app/organogram': [
      { label: 'People', path: '/app/people', description: 'Manage staff' },
      { label: 'Reports', path: '/app/reports', description: 'Org analytics' },
      { label: 'Chat', path: '/app/chat', description: 'Message team' },
    ],
    '/app/merit': [
      { label: 'People', path: '/app/people', description: 'Recognize team' },
      { label: 'Social', path: '/app/social', description: 'Share achievements' },
      { label: 'Reports', path: '/app/reports', description: 'Merit analytics' },
    ],
    '/app/cashflow': [
      { label: 'Finance', path: '/app/finance', description: 'Full finance view' },
      { label: 'Reports', path: '/app/reports', description: 'Cash flow reports' },
      { label: 'Payments', path: '/app/payments', description: 'Track payments' },
    ],
    '/app/quotes': [
      { label: 'Finance', path: '/app/finance', description: 'Convert to invoice' },
      { label: 'CRM', path: '/app/crm', description: 'Link to deals' },
      { label: 'Projects', path: '/app/projects', description: 'Start projects' },
    ],
  }

  return allSuggestions[currentPath] || []
}
