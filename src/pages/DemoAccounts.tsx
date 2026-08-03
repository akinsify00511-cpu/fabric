import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Check, User, Shield, BarChart3, Users, Settings, Briefcase } from 'lucide-react'

const DEMO_ACCOUNTS = [
  {
    role: 'Business Owner',
    icon: Briefcase,
    color: 'from-indigo-500 to-purple-600',
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-600',
    email: 'demo-owner@avenize.com',
    password: 'DemoOwner2024!',
    description: 'Full access to all features, dashboards, and settings. Monitor entire operations.',
    permissions: ['Revenue & Cash Flow', 'All Reports', 'Staff Management', 'Settings'],
    alertTypes: ['Overdue Payments', 'Low Stock', 'Missed Deadlines', 'Team Performance'],
  },
  {
    role: 'Admin Manager',
    icon: Shield,
    color: 'from-emerald-500 to-teal-600',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-600',
    email: 'demo-admin@avenize.com',
    password: 'DemoAdmin2024!',
    description: 'Manage staff, approvals, and day-to-day operations. Full operational control.',
    permissions: ['Staff Management', 'Approvals', 'Daily Reports', 'Settings'],
    alertTypes: ['Pending Approvals', 'Staff Onboarding', 'Leave Requests', 'Team Alerts'],
  },
  {
    role: 'Team Lead',
    icon: Users,
    color: 'from-amber-500 to-orange-600',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
    email: 'demo-lead@avenize.com',
    password: 'DemoLead2024!',
    description: 'Lead a team, track tasks, and coordinate with team members.',
    permissions: ['Team Tasks', 'Task Assignment', 'Team Reports', 'Progress Tracking'],
    alertTypes: ['Task Deadlines', 'Team Updates', 'Blocked Tasks', 'Team Utilization'],
  },
  {
    role: 'Accountant',
    icon: BarChart3,
    color: 'from-blue-500 to-cyan-600',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
    email: 'demo-accountant@avenize.com',
    password: 'DemoAccountant2024!',
    description: 'Manage finances, invoices, expenses, and financial reporting.',
    permissions: ['Invoices', 'Expenses', 'Cash Flow', 'Financial Reports'],
    alertTypes: ['Overdue Invoices', 'Payment Received', 'Expense Alerts', 'Cash Flow Warnings'],
  },
  {
    role: 'Sales Head',
    icon: User,
    color: 'from-pink-500 to-rose-600',
    bgColor: 'bg-pink-50',
    textColor: 'text-pink-600',
    email: 'demo-sales@avenize.com',
    password: 'DemoSales2024!',
    description: 'Track leads, deals, and sales pipeline. Drive revenue growth.',
    permissions: ['Leads', 'Deals', 'Pipeline View', 'Sales Reports'],
    alertTypes: ['Stale Leads', 'Deal Milestones', 'Quota Progress', 'Lost Deals'],
  },
  {
    role: 'HR Manager',
    icon: Settings,
    color: 'from-violet-500 to-purple-600',
    bgColor: 'bg-violet-50',
    textColor: 'text-violet-600',
    email: 'demo-hr@avenize.com',
    password: 'DemoHR2024!',
    description: 'Manage staff, leave, payroll, and team culture initiatives.',
    permissions: ['Staff Records', 'Leave Management', 'Payroll', 'Team Recognition'],
    alertTypes: ['Leave Approvals', 'Birthdays', 'Contract Renewals', 'Performance Reviews'],
  },
]

export default function DemoAccounts() {
  const [copied, setCopied] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('all')

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const filteredAccounts = activeTab === 'all' 
    ? DEMO_ACCOUNTS 
    : DEMO_ACCOUNTS.filter(a => a.role.toLowerCase().includes(activeTab.toLowerCase()))

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-100 text-indigo-700 text-sm font-medium mb-4">
              Demo Access
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-3">
              Try Avenize with Demo Accounts
            </h1>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Explore Avenize from different perspectives. Each account is pre-configured with sample data to demonstrate real-world usage.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Accounts
            </button>
            <button
              onClick={() => setActiveTab('owner')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'owner'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Management
            </button>
            <button
              onClick={() => setActiveTab('sales')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'sales'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Operations
            </button>
            <button
              onClick={() => setActiveTab('accountant')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'accountant'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Finance
            </button>
          </div>
        </div>
      </div>

      {/* Accounts Grid */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAccounts.map((account) => {
            const Icon = account.icon
            return (
              <div 
                key={account.role}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* Card Header */}
                <div className={`bg-gradient-to-r ${account.color} p-6 text-white`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                      <Icon size={24} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{account.role}</h3>
                      <p className="text-white/80 text-sm">{account.description}</p>
                    </div>
                  </div>
                </div>

                {/* Credentials */}
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Email
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text"
                        readOnly
                        value={account.email}
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700"
                      />
                      <button
                        onClick={() => copyToClipboard(account.email, `email-${account.role}`)}
                        className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        {copied === `email-${account.role}` ? (
                          <Check size={18} className="text-emerald-500" />
                        ) : (
                          <Copy size={18} className="text-slate-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Password
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text"
                        readOnly
                        value={account.password}
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700 font-mono"
                      />
                      <button
                        onClick={() => copyToClipboard(account.password, `pass-${account.role}`)}
                        className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        {copied === `pass-${account.role}` ? (
                          <Check size={18} className="text-emerald-500" />
                        ) : (
                          <Copy size={18} className="text-slate-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Permissions */}
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 block">
                      Access Areas
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {account.permissions.map((perm) => (
                        <span 
                          key={perm}
                          className={`px-2 py-1 rounded-md text-xs font-medium ${account.bgColor} ${account.textColor}`}
                        >
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Alert Types */}
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 block">
                      Smart Alerts
                    </label>
                    <div className="space-y-1.5">
                      {account.alertTypes.map((alert) => (
                        <div key={alert} className="flex items-center gap-2 text-sm text-slate-600">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          {alert}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sign In Button */}
                  <Link
                    to={`/login?email=${encodeURIComponent(account.email)}`}
                    className={`block w-full py-3 rounded-xl bg-gradient-to-r ${account.color} text-white font-semibold text-center hover:opacity-90 transition-opacity mt-4`}
                  >
                    Sign in as {account.role}
                  </Link>
                </div>
              </div>
            )
          })}
        </div>

        {/* Info Section */}
        <div className="mt-12 bg-white rounded-2xl border border-slate-200 p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            About Demo Accounts
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <h3 className="font-semibold text-slate-700 mb-2">Pre-configured Data</h3>
              <p className="text-sm text-slate-600">
                Each account comes with realistic sample data including clients, projects, tasks, and transactions to demonstrate full functionality.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-700 mb-2">Role-specific Alerts</h3>
              <p className="text-sm text-slate-600">
                Experience intelligent alerts tailored to each role - from overdue payments for accountants to task deadlines for team leads.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-700 mb-2">Read-only Access</h3>
              <p className="text-sm text-slate-600">
                Demo accounts have limited write access to preserve the demo environment. For full access, start your own free trial.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
