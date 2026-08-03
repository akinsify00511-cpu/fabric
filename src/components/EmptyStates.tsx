/**
 * AVENIZE EMPTY STATES
 * Helpful UI for when modules have no data
 */

import { Link } from 'react-router-dom'
import { 
  FileText, Users, Package, ShoppingCart, Calendar, 
  Building2, TrendingUp, Receipt, CheckSquare, 
  FolderKanban, Video, FileStack, Plus, ArrowRight,
  Search, AlertCircle, Inbox, UserPlus, BarChart3,
  CreditCard, Clock, MessageSquare
} from 'lucide-react'

type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  description: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  tips?: string[]
}

export function EmptyState({ icon, title, description, action, tips }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4 text-slate-400">
        {icon || <Inbox size={32} />}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-500 max-w-sm mb-6">{description}</p>
      
      {tips && tips.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left w-full max-w-sm">
          <p className="text-xs font-medium text-amber-800 mb-2">Quick tips:</p>
          <ul className="space-y-1">
            {tips.map((tip, i) => (
              <li key={i} className="text-xs text-amber-700 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {action && (
        action.href ? (
          <Link
            to={action.href}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 transition-colors"
          >
            <Plus size={18} />
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 transition-colors"
          >
            <Plus size={18} />
            {action.label}
          </button>
        )
      )}
    </div>
  )
}

// ============================================
// SPECIFIC EMPTY STATES
// ============================================

export function EmptyInvoices() {
  return (
    <EmptyState
      icon={<FileText size={32} />}
      title="No invoices yet"
      description="Create your first invoice to start tracking payments from clients."
      action={{ label: 'Create Invoice', href: '/invoices/new' }}
      tips={[
        'Invoices are automatically tracked for overdue payments',
        'Set up recurring invoices for regular clients',
        'Send invoices directly via email or WhatsApp',
      ]}
    />
  )
}

export function EmptyExpenses() {
  return (
    <EmptyState
      icon={<Receipt size={32} />}
      title="No expenses recorded"
      description="Track your business expenses to understand where money goes."
      action={{ label: 'Add Expense', href: '/expenses/new' }}
      tips={[
        'Categorize expenses for better tracking',
        'Attach receipts for compliance',
        'Set expense limits per category',
      ]}
    />
  )
}

export function EmptyClients() {
  return (
    <EmptyState
      icon={<Building2 size={32} />}
      title="No clients yet"
      description="Add your first client to start managing relationships and invoices."
      action={{ label: 'Add Client', href: '/clients/new' }}
      tips={[
        'Clients can have multiple contacts',
        'Track payment history per client',
        'Import clients from a spreadsheet',
      ]}
    />
  )
}

export function EmptyLeads() {
  return (
    <EmptyState
      icon={<TrendingUp size={32} />}
      title="No leads yet"
      description="Add potential customers to track your sales pipeline."
      action={{ label: 'Add Lead', href: '/leads/new' }}
      tips={[
        'Leads are automatically flagged if inactive',
        'Track lead sources to know what works',
        'Convert leads to clients when they convert',
      ]}
    />
  )
}

export function EmptyTasks() {
  return (
    <EmptyState
      icon={<CheckSquare size={32} />}
      title="No tasks yet"
      description="Create tasks to track work and delegate to your team."
      action={{ label: 'Create Task', href: '/tasks/new' }}
      tips={[
        'Assign tasks to team members',
        'Set deadlines for automatic reminders',
        'Break big projects into smaller tasks',
      ]}
    />
  )
}

export function EmptyStaff() {
  return (
    <EmptyState
      icon={<Users size={32} />}
      title="No team members yet"
      description="Invite your team to collaborate on Avenize."
      action={{ label: 'Invite Team Member', href: '/settings/team/invite' }}
      tips={[
        'Set roles and permissions per member',
        'Track attendance and leave',
        'Manage payroll for your team',
      ]}
    />
  )
}

export function EmptyInventory() {
  return (
    <EmptyState
      icon={<Package size={32} />}
      title="No inventory items"
      description="Add items to track stock levels and get low stock alerts."
      action={{ label: 'Add Item', href: '/inventory/new' }}
      tips={[
        'Set reorder points for automatic alerts',
        'Track stock movement over time',
        'Categorize items for easy search',
      ]}
    />
  )
}

export function EmptyMeetings() {
  return (
    <EmptyState
      icon={<Video size={32} />}
      title="No meetings scheduled"
      description="Schedule a meeting to collaborate with your team."
      action={{ label: 'Schedule Meeting', href: '/meetings/new' }}
      tips={[
        'Add agendas before meetings',
        'Track decisions and action items',
        'Set recurring meetings for regular standups',
      ]}
    />
  )
}

export function EmptyPurchases() {
  return (
    <EmptyState
      icon={<ShoppingCart size={32} />}
      title="No purchase orders"
      description="Create purchase orders to track supplier orders."
      action={{ label: 'Create PO', href: '/purchases/new' }}
      tips={[
        'Track delivery dates',
        'Match POs to invoices automatically',
        'Get alerts for overdue deliveries',
      ]}
    />
  )
}

export function EmptyLeave() {
  return (
    <EmptyState
      icon={<Calendar size={32} />}
      title="No leave requests"
      description="Team members can request leave here."
      action={{ label: 'Request Leave', href: '/leave/new' }}
      tips={[
        'Check remaining leave balance',
        'Submit leave well in advance',
        'Track leave across your team',
      ]}
    />
  )
}

export function EmptyReports() {
  return (
    <EmptyState
      icon={<BarChart3 size={32} />}
      title="No reports yet"
      description="Reports will appear here as you use Avenize."
      tips={[
        'Reports are generated from your data',
        'Financial reports need invoices and expenses',
        'Sales reports need leads and deals',
      ]}
    />
  )
}

export function EmptyProjects() {
  return (
    <EmptyState
      icon={<FolderKanban size={32} />}
      title="No projects yet"
      description="Create projects to track complex work with multiple tasks."
      action={{ label: 'Create Project', href: '/projects/new' }}
      tips={[
        'Add milestones to track progress',
        'Assign team members to projects',
        'Track budget vs actual spending',
      ]}
    />
  )
}

export function EmptyDocuments() {
  return (
    <EmptyState
      icon={<FileStack size={32} />}
      title="No documents yet"
      description="Upload contracts, policies, and other important files."
      action={{ label: 'Upload Document', href: '/documents/new' }}
      tips={[
        'Organize documents by category',
        'Set expiration dates for contracts',
        'Share documents securely with team',
      ]}
    />
  )
}

export function EmptySearch({ query }: { query: string }) {
  return (
    <EmptyState
      icon={<Search size={32} />}
      title={`No results for "${query}"`}
      description="Try adjusting your search or filters."
    />
  )
}

export function EmptyApprovals() {
  return (
    <EmptyState
      icon={<CheckSquare size={32} />}
      title="No pending approvals"
      description="You're all caught up! New requests will appear here."
      tips={[
        'Approvals are needed for expenses, leave, and purchases',
        'Set up approval chains in settings',
        'Get notified instantly for urgent requests',
      ]}
    />
  )
}

export function EmptyNotifications() {
  return (
    <EmptyState
      icon={<MessageSquare size={32} />}
      title="No notifications"
      description="You're all caught up. We'll notify you when something needs attention."
      tips={[
        'Enable push notifications in settings',
        'Configure which alerts you receive',
        'Check the Alerts tab for important updates',
      ]}
    />
  )
}

// ============================================
// ERROR STATES
// ============================================

export function ErrorState({ 
  message = 'Something went wrong', 
  onRetry 
}: { 
  message?: string
  onRetry?: () => void 
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
        <AlertCircle size={32} className="text-red-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">Oops!</h3>
      <p className="text-slate-500 max-w-sm mb-6">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 transition-colors"
        >
          <ArrowRight size={18} />
          Try Again
        </button>
      )}
    </div>
  )
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
