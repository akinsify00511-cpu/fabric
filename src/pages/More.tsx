import { Link } from 'react-router-dom'
import {
  Home, Users2, FolderKanban, Contact, Boxes, BarChart3, Settings as SettingsIcon,
  Share2, CheckSquare, Award, DollarSign, MessageSquare, Book, Zap, Headphones, Mail,
  Calculator, Lock, Building2, Briefcase, Percent, Clock, Receipt, TrendingUp, Landmark,
  Calendar, LineChart, GitBranch, Scale, Target, FileText, Banknote,
  Truck, Wrench, FlaskConical, CreditCard, Network, Palette, Shield, CalendarDays,
  Megaphone, Building, UserRound, Crown,
} from 'lucide-react'
import { useSubscription } from '../lib/useSubscription'

type MoreItem = { to: string; label: string; icon: typeof Home; desc: string; feature: string | null }
type MoreSection = { title: string; items: MoreItem[] }

const SECTIONS: MoreSection[] = [
  {
    title: 'Communication',
    items: [
      { to: '/app/chat', label: 'Chat', icon: MessageSquare, desc: 'Team messaging', feature: 'chat' },
      { to: '/app/whatsapp', label: 'WhatsApp', icon: MessageSquare, desc: 'WhatsApp Business', feature: null },
      { to: '/app/sms', label: 'SMS Broadcast', icon: Mail, desc: 'Bulk SMS', feature: null },
      { to: '/app/meetings', label: 'Meetings', icon: Headphones, desc: 'Schedule & minutes', feature: 'meetings' },
      { to: '/app/announcements', label: 'Announcements', icon: Megaphone, desc: 'Company news', feature: null },
      { to: '/app/live-chat', label: 'Live Chat', icon: Headphones, desc: 'Customer chat', feature: 'tickets' },
    ],
  },
  {
    title: 'Sell & Market',
    items: [
      { to: '/app/crm', label: 'CRM', icon: Users2, desc: 'Contacts & deals', feature: 'crm' },
      { to: '/app/leads', label: 'Leads', icon: Briefcase, desc: 'Lead pipeline', feature: 'crm' },
      { to: '/app/quotes', label: 'Quotes', icon: FileText, desc: 'Proposals', feature: 'crm' },
      { to: '/app/properties', label: 'Properties', icon: Building, desc: 'Property listings', feature: null },
      { to: '/app/property-owners', label: 'Property Owners', icon: UserRound, desc: 'Owner records', feature: null },
      { to: '/app/property-sales', label: 'Property Sales', icon: TrendingUp, desc: 'Sales tracking', feature: null },
      { to: '/app/social', label: 'Social Media', icon: Share2, desc: 'Posts & branding', feature: 'social' },
      { to: '/app/campaigns', label: 'Email Campaigns', icon: Mail, desc: 'Email marketing', feature: 'campaigns' },
      { to: '/app/sales-performance', label: 'Sales Performance', icon: Target, desc: 'Targets & commissions', feature: null },
    ],
  },
  {
    title: 'Money & Finance',
    items: [
      { to: '/app/finance', label: 'Finance Center', icon: Banknote, desc: 'Tax, banking & debtors', feature: null },
      { to: '/app/e-invoicing', label: 'Invoices', icon: FileText, desc: 'FIRS e-invoicing', feature: null },
      { to: '/app/payments', label: 'Payments', icon: CreditCard, desc: 'Receive & send', feature: null },
      { to: '/app/cashflow', label: 'Cash Flow', icon: DollarSign, desc: 'Income & expenses', feature: 'cashflow' },
      { to: '/app/budgets', label: 'Budgets', icon: Target, desc: 'Budget tracking', feature: null },
      { to: '/app/expenses', label: 'Expense Claims', icon: Receipt, desc: 'Submit & approve', feature: null },
      { to: '/app/payroll', label: 'Payroll', icon: Landmark, desc: 'Salaries & tax', feature: 'payroll' },
      { to: '/app/accounting', label: 'Accounting', icon: Calculator, desc: 'Bookkeeping', feature: 'accounting' },
      { to: '/app/currency', label: 'Currency', icon: Percent, desc: 'Exchange rates', feature: null },
    ],
  },
  {
    title: 'People & HR',
    items: [
      { to: '/app/hr', label: 'Team', icon: Contact, desc: 'Staff & invites', feature: 'people' },
      { to: '/app/recruitment', label: 'Recruitment', icon: Briefcase, desc: 'Job postings', feature: null },
      { to: '/app/appraisals', label: 'Appraisals', icon: Award, desc: 'Performance reviews', feature: null },
      { to: '/app/leave', label: 'Leave', icon: Calendar, desc: 'Time-off requests', feature: null },
      { to: '/app/attendance', label: 'Attendance', icon: Clock, desc: 'Check-in tracking', feature: null },
      { to: '/app/organogram', label: 'Org Chart', icon: Network, desc: 'Reporting lines', feature: 'merit' },
      { to: '/app/departments', label: 'Departments', icon: Building2, desc: 'Team structure', feature: null },
      { to: '/app/merit', label: 'Merit', icon: Award, desc: 'Recognition & points', feature: 'merit' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/app/projects', label: 'Projects', icon: FolderKanban, desc: 'Project management', feature: 'projects' },
      { to: '/app/inventory', label: 'Inventory', icon: Boxes, desc: 'Stock & products', feature: 'inventory' },
      { to: '/app/vendors', label: 'Vendors', icon: Truck, desc: 'Supplier records', feature: null },
      { to: '/app/purchase-orders', label: 'Purchase Orders', icon: FileText, desc: 'PO tracking', feature: null },
      { to: '/app/services', label: 'Services', icon: Share2, desc: 'Service catalog', feature: null },
      { to: '/app/requisitions', label: 'Requisitions', icon: GitBranch, desc: 'Internal requests', feature: 'requisitions' },
      { to: '/app/assets', label: 'Assets', icon: Wrench, desc: 'Equipment & assets', feature: null },
      { to: '/app/logistics', label: 'Delivery', icon: Truck, desc: 'Orders & tracking', feature: null },
      { to: '/app/equipment', label: 'Equipment', icon: Wrench, desc: 'Maintenance', feature: null },
      { to: '/app/lab', label: 'Lab / QC', icon: FlaskConical, desc: 'Samples & tests', feature: null },
      { to: '/app/booking', label: 'Resource Booking', icon: Calendar, desc: 'Book rooms & gear', feature: null },
      { to: '/app/vendor-portal', label: 'Vendor Portal', icon: Truck, desc: 'Supplier self-service', feature: null },
    ],
  },
  {
    title: 'Tools & Productivity',
    items: [
      { to: '/app/tasks', label: 'Tasks', icon: CheckSquare, desc: 'Assign & track', feature: 'tasks' },
      { to: '/app/calendar', label: 'Calendar', icon: Calendar, desc: 'Schedule', feature: 'calendar' },
      { to: '/app/time', label: 'Time Tracking', icon: Clock, desc: 'Timesheets', feature: 'time-tracking' },
      { to: '/app/events', label: 'Events', icon: CalendarDays, desc: 'Company events', feature: null },
      { to: '/app/approvals', label: 'Approvals', icon: Shield, desc: 'Pending approvals', feature: 'approvals' },
      { to: '/app/knowledge', label: 'Docs', icon: Book, desc: 'Knowledge base', feature: 'knowledge' },
      { to: '/app/tickets', label: 'Support', icon: Headphones, desc: 'Help desk', feature: 'tickets' },
      { to: '/app/automations', label: 'Automations', icon: Zap, desc: 'Workflow rules', feature: 'automations' },
      { to: '/app/workflows', label: 'Workflow Builder', icon: GitBranch, desc: 'Visual workflows', feature: null },
    ],
  },
  {
    title: 'Intelligence & Reports',
    items: [
      { to: '/app/capture', label: 'Quick Capture', icon: Users2, desc: 'Natural-language capture', feature: null },
      { to: '/app/activity', label: 'Activity', icon: Users2, desc: 'Business snapshot', feature: null },
      { to: '/app/scenarios', label: 'Scenarios', icon: FlaskConical, desc: 'What-if analysis', feature: null },
      { to: '/app/intelligence', label: 'Insights', icon: LineChart, desc: 'AI intelligence', feature: null },
      { to: '/app/reports', label: 'Reports', icon: BarChart3, desc: 'Analytics', feature: 'reports' },
      { to: '/app/monitoring', label: 'Monitoring', icon: Users2, desc: 'System health', feature: null },
      { to: '/app/admin-analytics', label: 'Admin Analytics', icon: BarChart3, desc: 'Org analytics', feature: null },
    ],
  },
  {
    title: 'Controls & Admin',
    items: [
      { to: '/app/governance', label: 'Controls', icon: Shield, desc: 'Policy controls', feature: null },
      { to: '/app/control', label: 'Audit Log', icon: Shield, desc: 'Control & audit', feature: null },
      { to: '/app/audit-log', label: 'Audit Trail', icon: Scale, desc: 'Activity log', feature: null },
      { to: '/app/integrations', label: 'Integrations', icon: Network, desc: 'Connect apps', feature: 'integrations' },
      { to: '/app/api', label: 'API & Webhooks', icon: FileText, desc: 'Developer access', feature: 'api' },
      { to: '/app/security', label: 'Security', icon: Lock, desc: '2FA & sessions', feature: null },
      { to: '/app/sso', label: 'SSO', icon: Lock, desc: 'Single sign-on', feature: null },
      { to: '/app/migration', label: 'Import Data', icon: FileText, desc: 'Migrate from spreadsheets', feature: null },
      { to: '/app/export', label: 'Export Data', icon: FileText, desc: 'Download your data', feature: null },
      { to: '/app/subscription', label: 'Billing', icon: CreditCard, desc: 'Plan & payments', feature: null },
      { to: '/app/branding', label: 'Branding', icon: Palette, desc: 'Logo & colors', feature: null },
      { to: '/app/settings', label: 'Settings', icon: SettingsIcon, desc: 'Profile & config', feature: null },
    ],
  },
]

export default function More() {
  const { plan, hasFeature } = useSubscription()

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--av-text)] mb-1">All modules</h1>
          <p className="text-sm text-[var(--av-text-secondary)]">Everything Avenize can do, grouped by what you need.</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
          plan === 'enterprise' ? 'bg-purple-100 text-purple-700' :
          plan === 'pro' ? 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]' :
          plan === 'starter' ? 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]' :
          'bg-[var(--av-surface-3)] text-[var(--av-text-secondary)]'
        }`}>
          {plan} Plan
        </div>
      </div>

      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--av-text-muted)] mb-3">{section.title}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {section.items.map((item) => {
                const isLocked = item.feature && !hasFeature(item.feature as any)
                const Icon = item.icon
                return isLocked ? (
                  <div
                    key={item.to}
                    className="bg-[var(--av-surface)] rounded-[var(--av-radius-lg)] border border-[var(--av-border)] p-4 flex flex-col gap-2 opacity-60"
                  >
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--av-surface-3)] text-[var(--av-text-secondary)]">
                        <Icon size={18} strokeWidth={2} />
                      </div>
                      <Lock size={14} className="text-[var(--av-text-muted)]" />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-[var(--av-text)]">{item.label}</span>
                      <p className="text-xs text-[var(--av-text-muted)]">{item.desc}</p>
                    </div>
                    <Link to="/upgrade" className="text-xs text-[var(--av-primary)] font-medium">Upgrade to unlock →</Link>
                  </div>
                ) : (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="bg-[var(--av-surface)] rounded-[var(--av-radius-lg)] border border-[var(--av-border)] p-4 flex flex-col gap-2 hover:border-[var(--av-border-strong)] hover:shadow-[var(--av-shadow-sm)] transition"
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--av-primary-soft)] text-[var(--av-primary)]">
                      <Icon size={18} strokeWidth={2} />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-[var(--av-text)]">{item.label}</span>
                      <p className="text-xs text-[var(--av-text-muted)]">{item.desc}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-[var(--av-radius-xl)] bg-gradient-to-r from-[#4285F4] to-[#8B5CF6] p-6 text-white flex items-center gap-4">
        <Crown size={28} />
        <div className="flex-1">
          <p className="font-semibold">Get more from Avenize</p>
          <p className="text-sm text-white/80">Unlock automations, advanced reports, and every module with Pro.</p>
        </div>
        <Link to="/upgrade" className="bg-white text-[var(--av-primary)] text-sm font-medium px-4 py-2 rounded-lg hover:bg-white/90 transition">Upgrade</Link>
      </div>
    </div>
  )
}
