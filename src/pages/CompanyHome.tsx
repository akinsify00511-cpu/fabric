// CompanyHome — the "My Work" attention-first hub.
//
// The user's vision: "Good morning, David. 3 things need you."
// This is NOT a culture page. It is the first thing an employee sees when
// they open the app — their pending approvals, tasks due, unread messages,
// and quick capture. Culture (birthdays, awards, polls) is a secondary tab.
//
// Three experience layers (Phase 6 of the product plan):
// - My Work: what do I need to do? (default tab)
// - My Team: what is my team doing? (managers)
// - Culture: birthdays, recognition, polls

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { fetchBusinessBrain, type BusinessBrain } from '../lib/businessOS'
import {
  CheckCircle2, Clock, AlertCircle, MessageSquare, ListTodo, Calendar,
  Sparkles, ChevronRight, Cake, Award, Trophy, Users, Vote, Heart,
  Zap, ArrowRight, Activity, Lightbulb, TrendingUp,
} from 'lucide-react'

const BRAND = {
  primary: 'var(--av-primary)',
  primarySoft: 'var(--av-primary-soft)',
  gradient: 'linear-gradient(135deg, var(--av-primary) 0%, var(--av-primary) 50%, var(--av-success) 100%)',
  surface: 'var(--av-surface-2)',
  surface2: 'var(--av-surface-3)',
  surfaceElevated: 'var(--av-surface-elevated)',
  text: 'var(--av-text)',
  textSecondary: 'var(--av-text-secondary)',
  textMuted: 'var(--av-text-muted)',
  border: 'var(--av-border)',
  success: 'var(--av-success)',
  successSoft: 'var(--av-success-soft)',
  warning: 'var(--av-warning)',
  warningSoft: 'var(--av-warning-soft)',
  danger: 'var(--av-danger)',
  dangerSoft: 'var(--av-danger-soft)',
  purple: '#7C3AED',
  purpleSoft: 'rgba(124, 58, 237, 0.08)',
  pink: '#BE185D',
  pinkSoft: 'rgba(190, 24, 93, 0.08)',
  amber: 'var(--av-warning)',
}

type Tab = 'my-work' | 'culture'

interface ActionItem {
  id: string
  type: 'approval' | 'task' | 'message'
  title: string
  detail?: string
  due?: string
  amount?: string
  to: string
}

const getCurrentMonth = () => new Date().toLocaleString('default', { month: 'long' })
const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function CompanyHome() {
  const { staff } = useAuth()
  const [tab, setTab] = useState<Tab>('my-work')
  const [actions, setActions] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [birthdays, setBirthdays] = useState<{ name: string; date: string; department: string; avatar: string }[]>([])
  const [awards, setAwards] = useState<{ id: string; recipient: string; reason: string }[]>([])
  // §A intelligence-first: the Business Brain (state + next best action) leads
  // the home page, above the personal My Work list. This is the "what is
  // happening / what should I do" layer; My Work below is "what needs me".
  // Best-effort: stays null if the brain migration isn't deployed (the hero
  // just doesn't render — no error). Any staff member can call business_brain
  // (membership-guarded, not owner-only).
  const [brain, setBrain] = useState<BusinessBrain | null>(null)

  useEffect(() => {
    if (!staff?.business_id) return
    let active = true
    setLoading(true)

    const loadWork = async () => {
      try {
        const bid = staff.business_id
        const userId = staff.user_id
        const items: ActionItem[] = []

        // Pending approvals (assigned to this user)
        const { data: approvals } = await supabase
          .from('approvals')
          .select('id, entity_type, description, status, created_at, data')
          .eq('business_id', bid)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10)

        if (approvals) {
          approvals.forEach((a: any) => {
            const amount = a.data?.amount ? `₦${Number(a.data.amount).toLocaleString()}` : undefined
            items.push({
              id: a.id,
              type: 'approval',
              title: a.description || `Approve ${a.entity_type || 'request'}`,
              detail: a.entity_type,
              amount,
              due: a.created_at,
              to: '/app/approvals',
            })
          })
        }

        // Tasks assigned to this user, not completed
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, title, due_date, priority, status')
          .eq('business_id', bid)
          .eq('assignee_id', staff.id)
          .neq('status', 'done')
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(10)

        if (tasks) {
          tasks.forEach((t: any) => {
            items.push({
              id: t.id,
              type: 'task',
              title: t.title,
              detail: t.priority ? `${t.priority} priority` : undefined,
              due: t.due_date,
              to: '/app/tasks',
            })
          })
        }

        // Unread messages count
        const { count: unreadCount } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', bid)
          .eq('user_id', userId)
          .eq('is_read', false)

        if (unreadCount && unreadCount > 0) {
          items.push({
            id: 'unread-notifications',
            type: 'message',
            title: `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`,
            detail: 'Check your inbox',
            to: '/app/notifications',
          })
        }

        if (active) {
          setActions(items)
          setLoading(false)
        }
      } catch {
        if (active) setLoading(false)
      }
    }

    const loadCulture = async () => {
      try {
        const bid = staff.business_id
        const monthNum = new Date().getMonth() + 1

        const { data: staffData } = await supabase
          .from('staff')
          .select('id, name, full_name, department, date_of_birth')
          .eq('business_id', bid)

        if (staffData) {
          setBirthdays(staffData
            .filter(s => s.date_of_birth && new Date(s.date_of_birth).getMonth() + 1 === monthNum)
            .map(s => ({
              name: s.full_name || s.name,
              date: s.date_of_birth,
              department: s.department || '—',
              avatar: (s.full_name || s.name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
            })))
        }

        const { data: awardsData } = await supabase
          .from('merit_entries')
          .select('id, reason, created_at, staff:staff_id(name, full_name)')
          .eq('business_id', bid)
          .order('created_at', { ascending: false })
          .limit(5)

        if (awardsData) {
          setAwards(awardsData.map((a: any) => ({
            id: a.id,
            recipient: a.staff?.full_name || a.staff?.name || 'Team Member',
            reason: a.reason || 'Recognition awarded',
          })))
        }
      } catch { /* non-blocking */ }
    }

    loadWork()
    loadCulture()
    // §A: fetch the Business Brain so the home page leads with intelligence.
    // Fire-and-forget alongside the work/culture loads; non-blocking (§24).
    fetchBusinessBrain(staff.business_id)
      .then(b => { if (active) setBrain(b) })
      .catch(() => { /* migration not deployed — hero simply doesn't render */ })
    return () => { active = false }
  }, [staff?.business_id, staff?.id, staff?.user_id])

  const name = staff?.full_name || staff?.name || 'there'
  const firstName = name.split(' ')[0]
  const actionCount = actions.length

  return (
    <div className="min-h-screen" style={{ backgroundColor: BRAND.surface }}>
      {/* Greeting header */}
      <div className="border-b" style={{ backgroundColor: BRAND.surfaceElevated, borderColor: BRAND.border }}>
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold" style={{ color: BRAND.text }}>
                {getGreeting()}, {firstName}
              </h1>
              <p className="text-sm mt-1" style={{ color: BRAND.textSecondary }}>
                {actionCount > 0
                  ? `${actionCount} ${actionCount === 1 ? 'thing needs' : 'things need'} you`
                  : 'You are all caught up'}
              </p>
            </div>
            <Link
              to="/app/capture"
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium text-white transition hover:shadow-lg"
              style={{ backgroundColor: BRAND.primary }}
            >
              <Sparkles size={16} />
              Quick Capture
            </Link>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="border-b" style={{ borderColor: BRAND.border }}>
        <div className="max-w-5xl mx-auto px-6 flex gap-1">
          {([
            { key: 'my-work' as Tab, label: 'My Work', icon: ListTodo },
            { key: 'culture' as Tab, label: 'Culture', icon: Heart },
          ]).map(t => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition border-b-2"
                style={{
                  color: active ? BRAND.primary : BRAND.textSecondary,
                  borderColor: active ? BRAND.primary : 'transparent',
                }}
              >
                <Icon size={16} />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* §A intelligence-first: the Business Brain leads the home page.
            State (how the business is doing) + Next Best Action (what to do
            now) — the "what is happening / what should I do" surface, above
            the personal "what needs me" list. Falls back to nothing (no error)
            if the brain migration isn't deployed yet. */}
        <BrainHero brain={brain} />
        {tab === 'my-work' && (
          <MyWorkTab actions={actions} loading={loading} />
        )}
        {tab === 'culture' && (
          <CultureTab birthdays={birthdays} awards={awards} month={getCurrentMonth()} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Brain Hero — the intelligence-first lead (compact State + Next Best Action)
// ---------------------------------------------------------------------------

const STATE_TONE: Record<string, { color: string; soft: string; label: string }> = {
  growing: { color: BRAND.success, soft: BRAND.successSoft, label: 'Growing' },
  stable: { color: BRAND.primary, soft: BRAND.primarySoft, label: 'Stable' },
  scaling: { color: BRAND.primary, soft: BRAND.primarySoft, label: 'Scaling' },
  stressed: { color: BRAND.warning, soft: BRAND.warningSoft, label: 'Stressed' },
  recovering: { color: BRAND.primary, soft: BRAND.primarySoft, label: 'Recovering' },
  at_risk: { color: BRAND.danger, soft: BRAND.dangerSoft, label: 'At risk' },
  cash_constrained: { color: BRAND.danger, soft: BRAND.dangerSoft, label: 'Cash constrained' },
  sales_constrained: { color: BRAND.warning, soft: BRAND.warningSoft, label: 'Sales constrained' },
  capacity_constrained: { color: BRAND.warning, soft: BRAND.warningSoft, label: 'Capacity constrained' },
  opportunity_rich: { color: BRAND.success, soft: BRAND.successSoft, label: 'Opportunity-rich' },
  insufficient_data: { color: BRAND.textMuted, soft: BRAND.surface2, label: 'Building a picture' },
}

function BrainHero({ brain }: { brain: BusinessBrain | null }) {
  // No brain (migration not deployed, or not authorized) → don't render. The
  // home page still works (greeting + My Work). This is the §24 safe-failure.
  if (!brain || !brain.authorized) return null

  const state = brain.state
  const nba = brain.next_best_action
  // If both state and nba are degraded/absent, there's nothing intelligent to
  // lead with — hide the hero rather than show a broken shell.
  const stateUsable = state && !state.degraded && !state.error && state.state
  const nbaUsable = nba && !nba.degraded && !nba.error
  if (!stateUsable && !nbaUsable) return null

  const tone = stateUsable ? (STATE_TONE[state.state] ?? { color: BRAND.textMuted, soft: BRAND.surface2, label: state.state }) : null

  return (
    <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Business State — "how is my business doing right now" */}
      {stateUsable && tone && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: BRAND.surfaceElevated, boxShadow: 'var(--av-shadow-sm)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} style={{ color: tone.color }} />
            <span className="text-xs uppercase tracking-wide" style={{ color: BRAND.textMuted }}>Business state</span>
            <span className="text-xs" style={{ color: BRAND.textMuted }}>· {state.confidence}</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl font-semibold" style={{ color: tone.color }}>{tone.label}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: tone.soft, color: tone.color }}>
              {state.confidence === 'high' ? 'high confidence' : state.confidence === 'insufficient' ? 'needs more data' : 'estimating'}
            </span>
          </div>
          {state.reasons && state.reasons.length > 0 && (
            <p className="text-sm" style={{ color: BRAND.textSecondary }}>
              {state.reasons[0].label}
            </p>
          )}
          <Link to="/app/cockpit" className="inline-flex items-center gap-1 mt-3 text-xs font-medium" style={{ color: BRAND.primary }}>
            See the full picture <ChevronRight size={12} />
          </Link>
        </div>
      )}

      {/* Next Best Action — "what should I do now" */}
      {nbaUsable && nba.action && (
        <div className="rounded-2xl p-5 border-l-4" style={{ backgroundColor: BRAND.surfaceElevated, boxShadow: 'var(--av-shadow-sm)', borderLeftColor: nba.action.severity === 'critical' ? BRAND.danger : nba.action.severity === 'warning' ? BRAND.warning : BRAND.primary }}>
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={16} style={{ color: BRAND.primary }} />
            <span className="text-xs uppercase tracking-wide" style={{ color: BRAND.textMuted }}>Next best action</span>
            {nba.business_state && (
              <span className="text-xs" style={{ color: BRAND.textMuted }}>· for your {nba.business_state.replace(/_/g, ' ')} state</span>
            )}
          </div>
          <p className="text-sm font-medium mb-2" style={{ color: BRAND.text }}>{nba.action.statement}</p>
          {nba.action.expected_impact && nba.action.expected_impact.amount != null && nba.action.expected_impact.amount > 0 && (
            <p className="text-sm mb-2" style={{ color: BRAND.success }}>
              <TrendingUp size={12} className="inline mr-1" />
              Expected impact: ₦{nba.action.expected_impact.amount.toLocaleString()}
              {nba.action.expected_impact.description ? ` — ${nba.action.expected_impact.description}` : ''}
            </p>
          )}
          <Link to="/app/cockpit" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: BRAND.primary }}>
            Take action <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* Next Best Action — nothing needs attention (the healthy state) */}
      {nbaUsable && !nba.action && (
        <div className="rounded-2xl p-5 border-l-4" style={{ backgroundColor: BRAND.surfaceElevated, boxShadow: 'var(--av-shadow-sm)', borderLeftColor: BRAND.success }}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} style={{ color: BRAND.success }} />
            <span className="text-xs uppercase tracking-wide" style={{ color: BRAND.textMuted }}>Next best action</span>
          </div>
          <p className="text-sm font-medium" style={{ color: BRAND.text }}>Nothing needs your attention right now</p>
          <p className="text-sm mt-1" style={{ color: BRAND.textSecondary }}>{nba.note ?? 'You are all caught up.'}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// My Work Tab — the attention-first list
// ---------------------------------------------------------------------------

function MyWorkTab({ actions, loading }: { actions: ActionItem[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: BRAND.border, borderTopColor: BRAND.primary }} />
        <p className="text-sm mt-4" style={{ color: BRAND.textMuted }}>Loading what needs you...</p>
      </div>
    )
  }

  if (actions.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: BRAND.successSoft }}>
          <CheckCircle2 size={28} style={{ color: BRAND.success }} />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mb-3" style={{ backgroundColor: BRAND.successSoft, color: BRAND.success }}>
          <Sparkles size={12} /> Inbox zero
        </div>
        <h2 className="text-xl font-semibold mb-2" style={{ color: BRAND.text }}>You are all caught up</h2>
        <p className="text-sm" style={{ color: BRAND.textSecondary }}>
          Nothing needs your attention right now — a clear desk is progress. Use Quick Capture to log something new.
        </p>
        <Link
          to="/app/capture"
          className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-full text-sm font-medium text-white transition"
          style={{ backgroundColor: BRAND.primary }}
        >
          <Sparkles size={16} /> Quick Capture
        </Link>
      </div>
    )
  }

  // Group by type
  const approvals = actions.filter(a => a.type === 'approval')
  const tasks = actions.filter(a => a.type === 'task')
  const messages = actions.filter(a => a.type === 'message')

  const typeMeta = {
    approval: { icon: AlertCircle, color: BRAND.danger, bg: BRAND.dangerSoft, label: 'Action needed' },
    task: { icon: Clock, color: BRAND.primary, bg: BRAND.primarySoft, label: 'Task' },
    message: { icon: MessageSquare, color: BRAND.warning, bg: BRAND.warningSoft, label: 'Message' },
  }

  return (
    <div className="space-y-6">
      {/* Action items list */}
      <div className="space-y-2">
        {actions.map(item => {
          const meta = typeMeta[item.type]
          const Icon = meta.icon
          const dueDate = item.due ? new Date(item.due) : null
          const overdue = dueDate && dueDate < new Date() && item.type === 'task'
          return (
            <Link
              key={item.id}
              to={item.to}
              className="flex items-center gap-4 p-4 rounded-xl transition hover:shadow-md group"
              style={{ backgroundColor: BRAND.surfaceElevated, boxShadow: 'var(--av-shadow-sm)' }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: meta.bg }}>
                <Icon size={18} style={{ color: meta.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate" style={{ color: BRAND.text }}>{item.title}</p>
                  {item.amount && (
                    <span className="text-sm font-bold" style={{ color: BRAND.text }}>{item.amount}</span>
                  )}
                </div>
                {item.detail && (
                  <p className="text-xs mt-0.5" style={{ color: BRAND.textMuted }}>{item.detail}</p>
                )}
                {dueDate && (
                  <p className="text-xs mt-0.5" style={{ color: overdue ? BRAND.danger : BRAND.textMuted }}>
                    {overdue ? 'Overdue · ' : 'Due '}
                    {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full hidden sm:inline" style={{ backgroundColor: meta.bg, color: meta.color }}>
                  {meta.label}
                </span>
                <ChevronRight size={16} className="transition group-hover:translate-x-0.5" style={{ color: BRAND.textMuted }} />
              </div>
            </Link>
          )
        })}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { count: approvals.length, label: 'Approvals', icon: AlertCircle, color: BRAND.danger, to: '/app/approvals' },
          { count: tasks.length, label: 'Tasks', icon: ListTodo, color: BRAND.primary, to: '/app/tasks' },
          { count: messages.length, label: 'Messages', icon: MessageSquare, color: BRAND.warning, to: '/app/notifications' },
        ].map((s, i) => {
          const Icon = s.icon
          return (
            <Link key={i} to={s.to} className="p-4 rounded-xl text-center transition hover:shadow-md" style={{ backgroundColor: BRAND.surfaceElevated, boxShadow: 'var(--av-shadow-sm)' }}>
              <Icon size={18} className="mx-auto mb-2" style={{ color: s.color }} />
              <p className="text-2xl font-bold" style={{ color: BRAND.text }}>{s.count}</p>
              <p className="text-xs" style={{ color: BRAND.textMuted }}>{s.label}</p>
            </Link>
          )
        })}
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-3 pt-2">
        {[
          { to: '/app/calendar', icon: Calendar, label: 'Calendar' },
          { to: '/app/crm', icon: Users, label: 'CRM' },
          { to: '/app/finance', icon: Zap, label: 'Finance' },
          { to: '/app/cockpit', icon: Trophy, label: 'Cockpit' },
        ].map((q, i) => {
          const Icon = q.icon
          return (
            <Link key={i} to={q.to} className="flex items-center gap-2 px-4 py-2 rounded-full text-sm transition hover:shadow-sm" style={{ backgroundColor: BRAND.surfaceElevated, color: BRAND.textSecondary, border: `1px solid ${BRAND.border}` }}>
              <Icon size={14} />
              {q.label}
              <ArrowRight size={12} style={{ color: BRAND.textMuted }} />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Culture Tab — birthdays, awards, polls (secondary)
// ---------------------------------------------------------------------------

function CultureTab({ birthdays, awards, month }: { birthdays: { name: string; date: string; department: string; avatar: string }[]; awards: { id: string; recipient: string; reason: string }[]; month: string }) {
  return (
    <div className="space-y-6">
      {/* Birthdays */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: BRAND.surfaceElevated, boxShadow: 'var(--av-shadow-sm)' }}>
        <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: BRAND.border }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: BRAND.pinkSoft }}>
            <Cake size={20} style={{ color: BRAND.pink }} />
          </div>
          <div>
            <h2 className="font-medium text-sm" style={{ color: BRAND.text }}>Birthdays this month</h2>
            <p className="text-xs" style={{ color: BRAND.textMuted }}>{month}</p>
          </div>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          {birthdays.length > 0 ? birthdays.map((b, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: BRAND.surface }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: BRAND.gradient }}>
                {b.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" style={{ color: BRAND.text }}>{b.name}</p>
                <p className="text-xs" style={{ color: BRAND.textMuted }}>{b.department}</p>
                <p className="text-xs font-medium mt-0.5" style={{ color: BRAND.pink }}>
                  {new Date(b.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
          )) : (
            <div className="col-span-3 text-center py-6" style={{ color: BRAND.textMuted }}>
              <Cake size={28} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No birthdays this month</p>
            </div>
          )}
        </div>
      </div>

      {/* Awards */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: BRAND.surfaceElevated, boxShadow: 'var(--av-shadow-sm)' }}>
        <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: BRAND.border }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: BRAND.primarySoft }}>
            <Award size={20} style={{ color: BRAND.primary }} />
          </div>
          <div>
            <h2 className="font-medium text-sm" style={{ color: BRAND.text }}>Recent recognition</h2>
            <p className="text-xs" style={{ color: BRAND.textMuted }}>Team awards</p>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {awards.length > 0 ? awards.map(a => (
            <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: BRAND.surface }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: BRAND.successSoft }}>
                <Trophy size={16} style={{ color: BRAND.success }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm" style={{ color: BRAND.text }}>{a.recipient}</p>
                <p className="text-xs mt-0.5" style={{ color: BRAND.textMuted }}>{a.reason}</p>
              </div>
            </div>
          )) : (
            <div className="text-center py-6" style={{ color: BRAND.textMuted }}>
              <Trophy size={28} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No recent awards</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick culture links */}
      <div className="flex flex-wrap gap-3">
        <Link to="/app/wall" className="flex items-center gap-2 px-4 py-2 rounded-full text-sm transition hover:shadow-sm" style={{ backgroundColor: BRAND.surfaceElevated, color: BRAND.textSecondary, border: `1px solid ${BRAND.border}` }}>
          <Heart size={14} /> Company Wall
        </Link>
        <Link to="/app/wall?tab=polls" className="flex items-center gap-2 px-4 py-2 rounded-full text-sm transition hover:shadow-sm" style={{ backgroundColor: BRAND.surfaceElevated, color: BRAND.textSecondary, border: `1px solid ${BRAND.border}` }}>
          <Vote size={14} /> Polls
        </Link>
      </div>
    </div>
  )
}
