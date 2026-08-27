// GovernanceSection — Organization → Governance → Board.
//
// The Board is a governance structure inside the organization, not a product
// module. One surface carries: the board roster, committees, the resolution
// register (with voting), the conflicts-of-interest register, the objective
// cascade (Board decision → company objective → child objectives), and the
// aggregate-only board report. Management actions are owner/admin (UX gate);
// RLS + membership-guarded RPCs are the real boundary.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Landmark, Users, Plus, X, Vote, FileText, AlertTriangle,
  GitBranch, ChevronRight, ChevronDown, Mail, Phone, Calendar,
  Briefcase, Shield, TrendingUp, RefreshCw, Pencil, Printer,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from './Toast'
import EmptyState from './EmptyState'
import {
  deriveCascadeStatus,
  committeeTypeLabel,
  gapConstraintLabel,
  gapStatusTone,
  generateBoardPackHtml,
  COMMITTEE_TYPES,
  RESOLUTION_TYPE_LABELS,
  type CommitteeType,
  type ResolutionType,
  type GapStatus,
} from '../lib/governance'
import {
  fetchGovernanceOverview,
  recordBoardVote,
  cascadeBoardObjective,
  fetchCascadeTree,
  composeBoardReport,
  fetchObjectiveGapAnalysis,
  createMeeting,
  type GovernanceOverview,
  type GovernanceMember,
  type GovernanceResolution,
  type BoardReport,
  type CascadeNode,
  type ObjectiveGapAnalysis,
} from '../lib/businessOS'

type GovTab = 'board' | 'committees' | 'resolutions' | 'conflicts' | 'strategy'

const T = {
  text: 'var(--av-text)',
  muted: 'var(--av-text-muted)',
  border: 'var(--av-border)',
  surface: 'var(--av-surface)',
  surface2: 'var(--av-surface-2)',
  primary: 'var(--av-primary)',
  primarySoft: 'var(--av-primary-soft)',
  success: 'var(--av-success)',
  warning: 'var(--av-warning)',
  danger: 'var(--av-danger)',
  radius: 'var(--av-radius-lg, 16px)',
}

const TITLE_TONES: Record<string, string> = {
  Chair: T.primary,
  'Vice Chair': T.primary,
  Secretary: 'var(--av-accent)',
  Treasurer: T.success,
  Observer: T.muted,
  Director: T.muted,
  Member: T.muted,
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtCompact(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

function printBoardPack(report: BoardReport): void {
  const sections = [
    {
      title: 'Business health',
      lines: [
        `Overall: ${report.health?.overall_score !== undefined ? `${Math.round(report.health.overall_score)}/100` : 'not computed'}`,
        ...(report.health?.note ? [report.health.note] : []),
      ],
    },
    {
      title: 'Finance',
      lines: [
        `Invoiced: ${fmtCompact(report.finance?.invoiced_in_period ?? 0)}`,
        `Collected: ${fmtCompact(report.finance?.collected_in_period ?? 0)}`,
        `Overdue: ${report.finance?.overdue_count ?? 0} invoice(s) (${fmtCompact(report.finance?.overdue_value ?? 0)})`,
      ],
    },
    {
      title: 'Resolutions since period start',
      lines: (report.resolutions ?? []).map(
        r => `${r.title} — ${r.type}, ${r.outcome} (${r.votes_for} for / ${r.votes_against} against)`
      ),
    },
    {
      title: 'Board-seeded objectives',
      lines: (report.board_objectives ?? []).map(
        o => `${o.title} — ${o.progress === null ? 'no key results' : `${Math.round(o.progress)}%`} (${o.status_label?.replace('_', ' ') ?? 'unknown'})`
      ),
    },
  ]
  const approved = (report.resolutions ?? []).filter(r => r.outcome === 'approved').length
  const html = generateBoardPackHtml({
    period_start: report.period_start ?? null,
    period_end: report.period_end ?? null,
    totals: {
      resolutions_approved: approved,
      resolutions_open: (report.resolutions ?? []).length - approved,
      members_count: undefined,
      meetings_this_period: undefined,
    },
    sections,
  })
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}

export default function GovernanceSection() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const isAdmin = staff?.role === 'owner' || staff?.role === 'admin'
  const businessId = staff?.business_id

  const [overview, setOverview] = useState<GovernanceOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<GovTab>('board')

  const [memberModal, setMemberModal] = useState<{ editing: GovernanceMember | null } | null>(null)
  const [committeeModal, setCommitteeModal] = useState<{ editing: { id: string; name: string; committee_type: string; description: string | null } | null } | null>(null)
  const [resolutionModal, setResolutionModal] = useState(false)
  const [voteModal, setVoteModal] = useState<GovernanceResolution | null>(null)
  const [cascadeModal, setCascadeModal] = useState<GovernanceResolution | null>(null)
  const [conflictModal, setConflictModal] = useState(false)
  const [scheduleModal, setScheduleModal] = useState(false)
  const [report, setReport] = useState<BoardReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [treeFor, setTreeFor] = useState<string | null>(null)
  const [tree, setTree] = useState<CascadeNode[]>([])
  const [analysisFor, setAnalysisFor] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ObjectiveGapAnalysis | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)

  const load = useCallback(async () => {
    if (!businessId) return
    setLoading(true)
    const data = await fetchGovernanceOverview(businessId)
    setOverview(data && data.authorized ? data : null)
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    load()
  }, [load])

  const members = overview?.members ?? []
  const committees = overview?.committees ?? []
  const openResolutions = overview?.open_resolutions ?? []
  const decisions = overview?.recent_decisions ?? []
  const conflicts = overview?.active_conflicts ?? []
  const objectives = overview?.board_objectives ?? []
  const meetings = overview?.upcoming_meetings ?? []
  const chair = members.find(m => m.title === 'Chair') ?? members[0] ?? null

  const toggleTree = async (objectiveId: string) => {
    if (treeFor === objectiveId) {
      setTreeFor(null)
      setTree([])
      return
    }
    setTreeFor(objectiveId)
    setTree(await fetchCascadeTree(objectiveId))
  }

  const toggleAnalysis = async (objectiveId: string) => {
    if (analysisFor === objectiveId) {
      setAnalysisFor(null)
      setAnalysis(null)
      return
    }
    setAnalysisFor(objectiveId)
    setAnalysisLoading(true)
    const a = await fetchObjectiveGapAnalysis(objectiveId)
    setAnalysis(a && a.authorized ? a : null)
    setAnalysisLoading(false)
  }

  const generateReport = async () => {
    if (!businessId) return
    setReportLoading(true)
    const r = await composeBoardReport(businessId)
    setReport(r && r.authorized ? r : null)
    if (!r || !r.authorized) showToast('Could not generate the board report yet.', 'error')
    setReportLoading(false)
  }

  if (loading) {
    return (
      <div className="p-12 text-center" style={{ color: T.muted }}>
        <RefreshCw size={22} className="mx-auto animate-spin mb-2" />
        Loading governance…
      </div>
    )
  }

  if (!overview) {
    return (
      <div className="p-10">
        <EmptyState
          icon={<Shield size={36} />}
          title="Governance not available yet"
          description="The governance layer migration has not been applied to this workspace yet. The board, committees, resolutions, and cascade will appear here once it is."
        />
      </div>
    )
  }

  return (
    <div>
      {/* Organogram strip: Board → committees. Departments render on the
          Structure tab below this governance layer. */}
      <div className="mb-6 rounded-2xl p-5" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: T.primary }}>
            <Landmark size={20} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: T.text }}>Board of Directors</p>
            <p className="text-xs" style={{ color: T.muted }}>
              {chair ? `Chair: ${chair.name}` : 'No chair appointed'} · {members.length} member{members.length === 1 ? '' : 's'}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setMemberModal({ editing: null })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ background: T.primary }}
            >
              <Plus size={13} /> Add member
            </button>
          )}
        </div>
        {committees.length > 0 && (
          <div className="mt-3 ml-13 flex flex-wrap gap-2 pl-4" style={{ borderLeft: `2px solid ${T.border}` }}>
            {committees.map(c => (
              <span key={c.id} className="text-xs px-2.5 py-1 rounded-full" style={{ background: T.primarySoft, color: T.primary }}>
                {c.name} · {c.members.length}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto">
        {(
          [
            ['board', 'Board', Users, members.length],
            ['committees', 'Committees', GitBranch, committees.length],
            ['resolutions', 'Resolutions', Vote, openResolutions.length],
            ['conflicts', 'Conflicts', AlertTriangle, conflicts.length],
            ['strategy', 'Strategy & Cascade', TrendingUp, objectives.length],
          ] as const
        ).map(([key, label, Icon, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap"
            style={{
              background: tab === key ? T.primarySoft : 'transparent',
              color: tab === key ? T.primary : T.muted,
              fontWeight: tab === key ? 600 : 400,
            }}
          >
            <Icon size={14} /> {label}
            {count > 0 && (
              <span className="text-xs px-1.5 rounded-full" style={{ background: T.surface2 }}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'board' && (
        <BoardTab
          members={members}
          meetings={meetings}
          committees={committees}
          isAdmin={isAdmin}
          onAdd={() => setMemberModal({ editing: null })}
          onEdit={(m) => setMemberModal({ editing: m })}
          onSchedule={() => setScheduleModal(true)}
        />
      )}

      {tab === 'committees' && (
        <CommitteesTab
          committees={committees}
          members={members}
          isAdmin={isAdmin}
          onAdd={() => setCommitteeModal({ editing: null })}
          onEdit={(c) => setCommitteeModal({ editing: c })}
        />
      )}

      {tab === 'resolutions' && (
        <ResolutionsTab
          open={openResolutions}
          decisions={decisions}
          isAdmin={isAdmin}
          onAdd={() => setResolutionModal(true)}
          onVote={(r) => setVoteModal(r)}
          onCascade={(r) => setCascadeModal(r)}
        />
      )}

      {tab === 'conflicts' && (
        <ConflictsTab
          conflicts={conflicts}
          isAdmin={isAdmin}
          businessId={businessId}
          onAdd={() => setConflictModal(true)}
          onResolved={load}
        />
      )}

      {tab === 'strategy' && (
        <StrategyTab
          objectives={objectives}
          treeFor={treeFor}
          tree={tree}
          onToggleTree={toggleTree}
          analysisFor={analysisFor}
          analysis={analysis}
          analysisLoading={analysisLoading}
          onToggleAnalysis={toggleAnalysis}
          report={report}
          reportLoading={reportLoading}
          onGenerateReport={generateReport}
        />
      )}

      {memberModal && (
        <MemberModal
          editing={memberModal.editing}
          businessId={businessId!}
          onClose={() => setMemberModal(null)}
          onSaved={load}
        />
      )}

      {committeeModal && (
        <CommitteeModal
          editing={committeeModal.editing}
          businessId={businessId!}
          members={members}
          existing={committees}
          onClose={() => setCommitteeModal(null)}
          onSaved={load}
        />
      )}

      {resolutionModal && (
        <ResolutionModal
          businessId={businessId!}
          staffId={staff?.id ?? null}
          onClose={() => setResolutionModal(false)}
          onSaved={load}
        />
      )}

      {voteModal && (
        <VoteModal
          resolution={voteModal}
          onClose={() => setVoteModal(null)}
          onSaved={load}
        />
      )}

      {cascadeModal && (
        <CascadeModal
          resolution={cascadeModal}
          businessId={businessId!}
          onClose={() => setCascadeModal(null)}
          onSaved={load}
        />
      )}

      {conflictModal && (
        <ConflictModal
          businessId={businessId!}
          members={members}
          onClose={() => setConflictModal(false)}
          onSaved={load}
        />
      )}

      {scheduleModal && (
        <ScheduleMeetingModal
          businessId={businessId!}
          committees={committees}
          onClose={() => setScheduleModal(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Board tab — the roster (chair, directors, officers) + upcoming board meetings
// ---------------------------------------------------------------------------

function BoardTab({
  members, meetings, _committees, isAdmin, onAdd, onEdit, onSchedule,
}: {
  members: GovernanceMember[]
  meetings: NonNullable<GovernanceOverview['upcoming_meetings']>
  committees: NonNullable<GovernanceOverview['committees']>
  isAdmin: boolean
  onAdd: () => void
  onEdit: (m: GovernanceMember) => void
  onSchedule: () => void
}) {
  return (
    <div className="space-y-6">
      {members.length === 0 ? (
        <EmptyState
          gamified
          icon={<Landmark size={36} />}
          title="No board members yet"
          milestone="Your first director"
          description="Governance starts with people. Add your chair, directors, secretary, and treasurer — the board then anchors committees, resolutions, and the objective cascade."
          tip="Start with the Chair — every other governance record links back to the board."
          action={isAdmin ? { label: 'Add First Member', onClick: onAdd } : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {members.map(m => (
            <div key={m.id} className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate" style={{ color: T.text }}>{m.name}</h3>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: T.primarySoft, color: TITLE_TONES[m.title] ?? T.muted }}
                    >
                      {m.title}
                    </span>
                  </div>
                  {m.bio && <p className="text-xs mb-2" style={{ color: T.muted }}>{m.bio}</p>}
                  <div className="flex flex-wrap gap-3 text-xs" style={{ color: T.muted }}>
                    {m.email && <span className="flex items-center gap-1"><Mail size={12} /> {m.email}</span>}
                    {m.phone && <span className="flex items-center gap-1"><Phone size={12} /> {m.phone}</span>}
                    {(m.term_start || m.term_end) && (
                      <span className="flex items-center gap-1"><Calendar size={12} /> {m.term_start ?? '—'} → {m.term_end ?? 'present'}</span>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <button onClick={() => onEdit(m)} className="p-1.5 rounded" style={{ color: T.muted }} title="Edit">
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: T.text }}>
            <Calendar size={15} /> Governance calendar — upcoming board & committee meetings
          </h3>
          {isAdmin && (
            <button
              onClick={onSchedule}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: T.primary, color: 'var(--av-surface)' }}
            >
              <Plus size={13} /> Schedule meeting
            </button>
          )}
        </div>
        {meetings.length === 0 ? (
          <p className="text-xs" style={{ color: T.muted }}>
            No governance meetings yet. Use the same meeting system as the rest of the business — schedule a full-board meeting or pick a committee.
          </p>
        ) : (
          <div className="space-y-2">
            {meetings.map(m => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span style={{ color: T.text }}>{m.title}</span>
                <span className="text-xs" style={{ color: T.muted }}>
                  {m.committee_name ? `${m.committee_name} · ` : 'Board · '}
                  {fmtDate(m.scheduled_start)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Committees tab
// ---------------------------------------------------------------------------

function CommitteesTab({
  committees, members, isAdmin, onAdd, onEdit,
}: {
  committees: NonNullable<GovernanceOverview['committees']>
  members: GovernanceMember[]
  isAdmin: boolean
  onAdd: () => void
  onEdit: (c: { id: string; name: string; committee_type: string; description: string | null }) => void
}) {
  if (committees.length === 0) {
    return (
      <EmptyState
        gamified
        icon={<GitBranch size={36} />}
        title="No committees yet"
        milestone="Your first committee"
        description="Committees give the board working structure — Audit, Finance, Risk, Remuneration, Strategy. Each gets its own chair, members, and meetings."
        tip="Most boards start with an Audit or Finance committee."
        action={isAdmin ? { label: 'Create Committee', onClick: onAdd } : undefined}
      />
    )
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {committees.map(c => {
        const chair = c.members.find(cm => cm.role === 'chair')
        return (
          <div key={c.id} className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="font-semibold" style={{ color: T.text }}>{c.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: T.primarySoft, color: T.primary }}>
                  {committeeTypeLabel(c.committee_type as CommitteeType)}
                </span>
              </div>
              {isAdmin && (
                <button onClick={() => onEdit(c)} className="p-1.5 rounded" style={{ color: T.muted }} title="Edit">
                  <Pencil size={14} />
                </button>
              )}
            </div>
            {c.description && <p className="text-xs mt-2" style={{ color: T.muted }}>{c.description}</p>}
            <div className="mt-3 space-y-1">
              {chair && (
                <p className="text-xs flex items-center gap-1.5" style={{ color: T.text }}>
                  <Briefcase size={12} style={{ color: T.primary }} /> Chair: {chair.name}
                </p>
              )}
              <p className="text-xs flex items-center gap-1.5" style={{ color: T.muted }}>
                <Users size={12} /> {c.members.length} member{c.members.length === 1 ? '' : 's'}
                {c.members.filter(cm => cm.role === 'member').map(cm => ` · ${cm.name}`).join('')}
              </p>
            </div>
          </div>
        )
      })}
      {members.length === 0 && (
        <p className="text-xs col-span-full" style={{ color: T.warning }}>
          Add board members first — committees are staffed from the board roster.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resolutions tab — the decision register
// ---------------------------------------------------------------------------

function ResolutionsTab({
  open, decisions, isAdmin, onAdd, onVote, onCascade,
}: {
  open: GovernanceResolution[]
  decisions: GovernanceResolution[]
  isAdmin: boolean
  onAdd: () => void
  onVote: (r: GovernanceResolution) => void
  onCascade: (r: GovernanceResolution) => void
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: T.text }}>Open resolutions</h3>
        {isAdmin && (
          <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: T.primary }}>
            <Plus size={13} /> Propose resolution
          </button>
        )}
      </div>
      {open.length === 0 ? (
        <EmptyState
          gamified
          icon={<Vote size={36} />}
          title="No open resolutions"
          milestone="Your first resolution"
          description="Resolutions are how board decisions become real. Propose one, record the vote, then cascade an approved decision into objectives the organization executes."
          tip="The loop: propose → vote → cascade → the org executes → the board report shows progress."
          action={isAdmin ? { label: 'Propose First Resolution', onClick: onAdd } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {open.map(r => (
            <div key={r.id} className="rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <div className="min-w-0">
                <p className="font-medium text-sm" style={{ color: T.text }}>{r.title}</p>
                <p className="text-xs" style={{ color: T.muted }}>
                  {RESOLUTION_TYPE_LABELS[r.resolution_type]} · {r.status}
                  {r.status === 'approved' && (r.implemented ? ' · cascaded' : ' · awaiting cascade')}
                  {r.due_date ? ` · due ${fmtDate(r.due_date)}` : ''}
                </p>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  {r.status === 'proposed' && (
                    <button onClick={() => onVote(r)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: T.primary }}>
                      <Vote size={12} /> Record vote
                    </button>
                  )}
                  {r.status === 'approved' && (
                    <button onClick={() => onCascade(r)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: T.primarySoft, color: T.primary }}>
                      <TrendingUp size={12} /> {r.implemented ? 'Cascade again' : 'Cascade to objective'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {decisions.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3" style={{ color: T.text }}>Recent decisions</h3>
          <div className="space-y-2">
            {decisions.map(r => (
              <div key={r.id} className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                <div>
                  <p className="text-sm" style={{ color: T.text }}>{r.title}</p>
                  <p className="text-xs" style={{ color: T.muted }}>
                    {r.votes_for} for · {r.votes_against} against · {r.votes_abstain} abstain · {fmtDate(r.decided_at)}
                  </p>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: r.status === 'approved' ? 'var(--av-success-soft, rgba(52,168,83,0.12))' : 'var(--av-danger-soft, rgba(234,67,53,0.12))',
                    color: r.status === 'approved' ? T.success : T.danger,
                  }}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Conflicts tab
// ---------------------------------------------------------------------------

function ConflictsTab({
  conflicts, isAdmin, businessId, onAdd, onResolved,
}: {
  conflicts: NonNullable<GovernanceOverview['active_conflicts']>
  isAdmin: boolean
  businessId: string | undefined
  onAdd: () => void
  onResolved: () => void
}) {
  const { showToast } = useToast()

  const resolve = async (id: string) => {
    if (!businessId) return
    const { error } = await supabase
      .from('board_conflicts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      showToast('Could not resolve the conflict.', 'error')
      return
    }
    showToast('Conflict marked resolved.', 'success')
    onResolved()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: T.muted }}>
          Conflicts of interest are declared here so governance stays transparent. Only active conflicts are listed.
        </p>
        {isAdmin && (
          <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: T.primary }}>
            <Plus size={13} /> Declare conflict
          </button>
        )}
      </div>
      {conflicts.length === 0 ? (
        <EmptyState
          icon={<Shield size={36} />}
          title="No active conflicts of interest"
          description="When a director declares a conflict — a vendor relationship, a competing interest, a family tie — it is recorded here until mitigated or resolved."
        />
      ) : (
        <div className="space-y-2">
          {conflicts.map(c => (
            <div key={c.id} className="rounded-xl p-4 flex items-center justify-between" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <div>
                <p className="font-medium text-sm flex items-center gap-2" style={{ color: T.text }}>
                  <AlertTriangle size={14} style={{ color: T.warning }} /> {c.title}
                </p>
                <p className="text-xs" style={{ color: T.muted }}>
                  {c.member_name} · declared {fmtDate(c.declared_at)}
                </p>
              </div>
              {isAdmin && (
                <button onClick={() => resolve(c.id)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: T.surface2, color: T.muted }}>
                  Mark resolved
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gap analysis panel — the CEO constraint-check on one objective
// ---------------------------------------------------------------------------

function GapPanel({ analysis, loading }: { analysis: ObjectiveGapAnalysis | null; loading: boolean }) {
  if (loading) {
    return <p className="text-xs pl-6 mt-2" style={{ color: T.muted }}>Analyzing…</p>
  }
  if (!analysis) {
    return <p className="text-xs pl-6 mt-2" style={{ color: T.muted }}>Gap analysis is not available yet — the objective-gap migration may not be applied.</p>
  }
  if (analysis.analysis_type === 'progress_only') {
    return (
      <p className="text-xs pl-6 mt-2" style={{ color: T.muted }}>
        {analysis.note ?? 'This objective has no revenue target — progress only.'}
      </p>
    )
  }
  const tone = gapStatusTone(analysis.status as GapStatus)
  const toneColor = tone === 'good' ? T.success : tone === 'warn' ? T.warning : tone === 'bad' ? T.danger : T.muted
  return (
    <div className="mt-3 ml-6 rounded-lg p-3" style={{ background: T.surface2 }}>
      <p className="text-xs font-medium mb-2 flex items-center gap-1.5" style={{ color: toneColor }}>
        <TrendingUp size={13} />
        {analysis.headline}
      </p>
      {analysis.binding_constraint && (
        <p className="text-xs mb-2" style={{ color: T.muted }}>
          {gapConstraintLabel(analysis.binding_constraint)}
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div>
          <p className="font-medium" style={{ color: T.text }}>{fmtCompact(analysis.target ?? 0)}</p>
          <p style={{ color: T.muted }}>Target</p>
        </div>
        <div>
          <p className="font-medium" style={{ color: T.text }}>{fmtCompact(analysis.won_in_period ?? 0)}</p>
          <p style={{ color: T.muted }}>Won so far</p>
        </div>
        <div>
          <p className="font-medium" style={{ color: T.text }}>{fmtCompact(analysis.open_pipeline ?? 0)}</p>
          <p style={{ color: T.muted }}>Open pipeline</p>
        </div>
        <div>
          <p className="font-medium" style={{ color: T.text }}>
            {analysis.pipeline_coverage === null || analysis.pipeline_coverage === undefined ? '—' : `${analysis.pipeline_coverage}×`}
          </p>
          <p style={{ color: T.muted }}>Coverage</p>
        </div>
        <div>
          <p className="font-medium" style={{ color: T.text }}>
            {analysis.win_rate === null || analysis.win_rate === undefined ? '—' : `${Math.round(analysis.win_rate * 100)}%`}
          </p>
          <p style={{ color: T.muted }}>Historical win rate</p>
        </div>
        <div>
          <p className="font-medium" style={{ color: T.text }}>
            {analysis.projected_outcome === null || analysis.projected_outcome === undefined ? '—' : fmtCompact(analysis.projected_outcome)}
          </p>
          <p style={{ color: T.muted }}>Projected</p>
        </div>
        <div>
          <p className="font-medium" style={{ color: T.text }}>{analysis.closed_deals ?? 0}</p>
          <p style={{ color: T.muted }}>Closed deals</p>
        </div>
        <div>
          <p className="font-medium" style={{ color: T.text }}>{analysis.status?.replace('_', ' ') ?? '—'}</p>
          <p style={{ color: T.muted }}>Status</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Strategy tab — the objective cascade + the board report
// ---------------------------------------------------------------------------

function StrategyTab({
  objectives, treeFor, tree, onToggleTree,
  analysisFor, analysis, analysisLoading, onToggleAnalysis,
  report, reportLoading, onGenerateReport,
}: {
  objectives: NonNullable<GovernanceOverview['board_objectives']>
  treeFor: string | null
  tree: CascadeNode[]
  onToggleTree: (id: string) => void
  analysisFor: string | null
  analysis: ObjectiveGapAnalysis | null
  analysisLoading: boolean
  onToggleAnalysis: (id: string) => void
  report: BoardReport | null
  reportLoading: boolean
  onGenerateReport: () => void
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl p-4" style={{ background: 'var(--av-grad-intelligence, var(--av-surface-2))', border: `1px solid ${T.border}` }}>
        <p className="text-sm font-medium mb-1" style={{ color: T.text }}>The cascade</p>
        <p className="text-xs" style={{ color: T.muted }}>
          Board decision → company objective → department objectives → team targets. Every board-seeded objective below carries its progress and its execution tree.
        </p>
      </div>

      {objectives.length === 0 ? (
        <EmptyState
          gamified
          icon={<TrendingUp size={36} />}
          title="No cascaded objectives yet"
          milestone="Your first cascaded objective"
          description="Approve a resolution, then cascade it — the board's decision becomes a company objective the organization can execute and report back on."
          tip="Approve a resolution in the Resolutions tab, then use “Cascade to objective”."
        />
      ) : (
        <div className="space-y-2">
          {objectives.map(o => {
            const status = deriveCascadeStatus(o.progress, null, null)
            return (
              <div key={o.id} className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => onToggleTree(o.id)} className="flex items-center gap-2 min-w-0 text-left flex-1">
                    {treeFor === o.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: T.text }}>{o.title}</p>
                      <p className="text-xs" style={{ color: T.muted }}>
                        {o.scope} · {o.progress === null ? 'no key results yet' : `${Math.round(o.progress)}% complete`}
                        {o.due_date ? ` · due ${fmtDate(o.due_date)}` : ''}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onToggleAnalysis(o.id)}
                      className="text-xs px-2.5 py-1 rounded-lg"
                      style={{ background: T.primarySoft, color: T.primary }}
                    >
                      {analysisLoading && analysisFor === o.id ? 'Analyzing…' : analysisFor === o.id ? 'Hide analysis' : 'Analyze constraint'}
                    </button>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: status === 'on_track' ? 'var(--av-success-soft, rgba(52,168,83,0.12))' : T.surface2,
                        color: status === 'on_track' ? T.success : T.muted,
                      }}
                    >
                      {o.progress === null ? '—' : status === 'on_track' ? 'On track' : 'Watch'}
                    </span>
                  </div>
                </div>
                {treeFor === o.id && (
                  <div className="mt-3 space-y-1">
                    {tree.length === 0 ? (
                      <p className="text-xs pl-6" style={{ color: T.muted }}>No child objectives yet — cascade this objective into department or team objectives.</p>
                    ) : (
                      tree.map(n => (
                        <div key={n.id} className="flex items-center justify-between text-xs py-1" style={{ paddingLeft: `${16 + n.depth * 20}px` }}>
                          <span style={{ color: T.text }}>
                            {n.title}
                            <span style={{ color: T.muted }}>
                              {n.department_name ? ` · ${n.department_name}` : ''}
                              {n.owner_name ? ` · ${n.owner_name}` : ''}
                            </span>
                          </span>
                          <span style={{ color: T.muted }}>{n.progress === null ? '—' : `${Math.round(n.progress)}%`}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {analysisFor === o.id && (
                  <GapPanel analysis={analysis} loading={analysisLoading} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Board report — aggregate only, the contextual visibility boundary */}
      <div className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: T.text }}>
              <FileText size={15} /> Board report
            </h3>
            <p className="text-xs mt-0.5" style={{ color: T.muted }}>
              Aggregate only — strategy, finance totals, risk profile, resolution log, objective progress. Never salaries, personal records, or operational detail.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <button
                onClick={() => printBoardPack(report)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: T.surface2, color: T.text }}
                title="Print or save the board pack as PDF"
              >
                <Printer size={13} /> Print pack
              </button>
            )}
            <button
              onClick={onGenerateReport}
              disabled={reportLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
              style={{ background: T.primary }}
            >
              {reportLoading ? <RefreshCw size={13} className="animate-spin" /> : <FileText size={13} />}
              {report ? 'Refresh report' : 'Generate report'}
            </button>
          </div>
        </div>
        {report && (
          <div className="grid gap-3 md:grid-cols-2 mt-3">
            <div className="rounded-lg p-3" style={{ background: T.surface2 }}>
              <p className="text-xs font-medium mb-1" style={{ color: T.muted }}>Business health</p>
              <p className="text-xl font-bold" style={{ color: T.text }}>
                {report.health?.overall_score !== undefined ? `${Math.round(report.health.overall_score)}/100` : '—'}
              </p>
              {report.health?.note && <p className="text-xs" style={{ color: T.muted }}>{report.health.note}</p>}
            </div>
            <div className="rounded-lg p-3" style={{ background: T.surface2 }}>
              <p className="text-xs font-medium mb-1" style={{ color: T.muted }}>Finance this period</p>
              <p className="text-sm" style={{ color: T.text }}>
                Invoiced {fmtCompact(report.finance?.invoiced_in_period ?? 0)} · Collected {fmtCompact(report.finance?.collected_in_period ?? 0)}
              </p>
              <p className="text-xs" style={{ color: report.finance && report.finance.overdue_count > 0 ? T.danger : T.muted }}>
                {report.finance?.overdue_count ?? 0} overdue ({fmtCompact(report.finance?.overdue_value ?? 0)})
              </p>
            </div>
            <div className="rounded-lg p-3 md:col-span-2" style={{ background: T.surface2 }}>
              <p className="text-xs font-medium mb-2" style={{ color: T.muted }}>Board-seeded objective progress</p>
              {(report.board_objectives ?? []).length === 0 ? (
                <p className="text-xs" style={{ color: T.muted }}>No board-seeded objectives yet.</p>
              ) : (
                <div className="space-y-1">
                  {(report.board_objectives ?? []).map((o, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span style={{ color: T.text }}>{o.title}</span>
                      <span style={{ color: o.status_label === 'at_risk' ? T.danger : o.status_label === 'on_track' ? T.success : T.muted }}>
                        {o.status_label === 'unknown' ? 'no period set' : `${o.progress === null ? '—' : Math.round(o.progress)}% · ${o.status_label.replace('_', ' ')}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto" style={{ background: T.surface }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: T.text }}>{title}</h2>
          <button onClick={onClose}><X size={20} style={{ color: T.muted }} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm'
const inputStyle = { borderColor: T.border, color: T.text, background: T.surface }

function MemberModal({
  editing, businessId, onClose, onSaved,
}: {
  editing: GovernanceMember | null
  businessId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [form, setForm] = useState({
    name: editing?.name ?? '',
    email: editing?.email ?? '',
    phone: editing?.phone ?? '',
    title: editing?.title ?? 'Director',
    bio: editing?.bio ?? '',
    term_start: editing?.term_start ?? '',
    term_end: editing?.term_end ?? '',
  })

  const submit = async () => {
    if (!form.name.trim()) {
      showToast('Name is required.', 'error')
      return
    }
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      title: form.title,
      bio: form.bio.trim() || null,
      term_start: form.term_start || null,
      term_end: form.term_end || null,
    }
    const { error } = editing
      ? await supabase.from('board_members').update(payload).eq('id', editing.id)
      : await supabase.from('board_members').insert({ ...payload, business_id: businessId })
    if (error) {
      showToast('Could not save board member.', 'error')
      return
    }
    showToast(editing ? 'Board member updated.' : 'Board member added.', 'success')
    onSaved()
    onClose()
  }

  return (
    <ModalShell title={editing ? 'Edit Board Member' : 'Add Board Member'} onClose={onClose}>
      <div className="space-y-3">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} style={inputStyle} placeholder="Full name *" />
        <select value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputCls} style={inputStyle}>
          {['Chair', 'Vice Chair', 'Director', 'Secretary', 'Treasurer', 'Member', 'Observer'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} style={inputStyle} placeholder="Email" />
        <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} style={inputStyle} placeholder="Phone" />
        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={form.term_start} onChange={e => setForm({ ...form, term_start: e.target.value })} className={inputCls} style={inputStyle} />
          <input type="date" value={form.term_end} onChange={e => setForm({ ...form, term_end: e.target.value })} className={inputCls} style={inputStyle} />
        </div>
        <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={2} className={inputCls} style={inputStyle} placeholder="Brief background…" />
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, color: T.text }}>Cancel</button>
        <button onClick={submit} className="flex-1 px-4 py-2 rounded-lg text-white text-sm" style={{ background: T.primary }}>{editing ? 'Save' : 'Add Member'}</button>
      </div>
    </ModalShell>
  )
}

function CommitteeModal({
  editing, businessId, members, existing, onClose, onSaved,
}: {
  editing: { id: string; name: string; committee_type: string; description: string | null } | null
  businessId: string
  members: GovernanceMember[]
  existing: NonNullable<GovernanceOverview['committees']>
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const current = editing ? existing.find(c => c.id === editing.id) : null
  const [name, setName] = useState(editing?.name ?? '')
  const [type, setType] = useState<CommitteeType>((editing?.committee_type as CommitteeType) ?? 'other')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [chairId, setChairId] = useState<string>(current?.members.find(m => m.role === 'chair')?.board_member_id ?? '')
  const [memberIds, setMemberIds] = useState<string[]>(current?.members.filter(m => m.role === 'member').map(m => m.board_member_id) ?? [])

  const submit = async () => {
    if (!name.trim()) {
      showToast('Committee name is required.', 'error')
      return
    }
    const payload = { name: name.trim(), committee_type: type, description: description.trim() || null }
    let committeeId = editing?.id ?? null
    if (editing) {
      const { error } = await supabase.from('board_committees').update(payload).eq('id', editing.id)
      if (error) {
        showToast('Could not save committee.', 'error')
        return
      }
      await supabase.from('board_committee_members').delete().eq('committee_id', editing.id)
    } else {
      const { data, error } = await supabase.from('board_committees').insert({ ...payload, business_id: businessId }).select('id').single()
      if (error || !data) {
        showToast('Could not create committee.', 'error')
        return
      }
      committeeId = data.id
    }
    if (committeeId) {
      const rows = [
        ...(chairId ? [{ committee_id: committeeId, board_member_id: chairId, role: 'chair' }] : []),
        ...memberIds.filter(id => id !== chairId).map(id => ({ committee_id: committeeId, board_member_id: id, role: 'member' })),
      ]
      if (rows.length > 0) {
        const { error } = await supabase.from('board_committee_members').insert(rows)
        if (error) {
          showToast('Committee saved, but member assignment failed.', 'error')
          onSaved()
          onClose()
          return
        }
      }
    }
    showToast(editing ? 'Committee updated.' : 'Committee created.', 'success')
    onSaved()
    onClose()
  }

  return (
    <ModalShell title={editing ? 'Edit Committee' : 'Create Committee'} onClose={onClose}>
      <div className="space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} className={inputCls} style={inputStyle} placeholder="Committee name *" />
        <select value={type} onChange={e => setType(e.target.value as CommitteeType)} className={inputCls} style={inputStyle}>
          {COMMITTEE_TYPES.map(t => <option key={t} value={t}>{committeeTypeLabel(t)}</option>)}
        </select>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={inputCls} style={inputStyle} placeholder="Mandate / description…" />
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: T.muted }}>Chair</label>
          <select value={chairId} onChange={e => setChairId(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">— No chair yet —</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.title})</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: T.muted }}>Members</label>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {members.map(m => (
              <label key={m.id} className="flex items-center gap-2 text-sm" style={{ color: T.text }}>
                <input
                  type="checkbox"
                  checked={memberIds.includes(m.id)}
                  onChange={e => setMemberIds(e.target.checked ? [...memberIds, m.id] : memberIds.filter(id => id !== m.id))}
                />
                {m.name}
              </label>
            ))}
            {members.length === 0 && <p className="text-xs" style={{ color: T.muted }}>Add board members first.</p>}
          </div>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, color: T.text }}>Cancel</button>
        <button onClick={submit} className="flex-1 px-4 py-2 rounded-lg text-white text-sm" style={{ background: T.primary }}>{editing ? 'Save' : 'Create'}</button>
      </div>
    </ModalShell>
  )
}

function ResolutionModal({
  businessId, staffId, onClose, onSaved,
}: {
  businessId: string
  staffId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<ResolutionType>('ordinary')
  const [dueDate, setDueDate] = useState('')

  const submit = async () => {
    if (!title.trim()) {
      showToast('Resolution title is required.', 'error')
      return
    }
    const { error } = await supabase.from('board_resolutions').insert({
      business_id: businessId,
      title: title.trim(),
      description: description.trim() || null,
      resolution_type: type,
      due_date: dueDate || null,
      created_by: staffId,
    })
    if (error) {
      showToast('Could not propose the resolution.', 'error')
      return
    }
    showToast('Resolution proposed.', 'success')
    onSaved()
    onClose()
  }

  return (
    <ModalShell title="Propose Resolution" onClose={onClose}>
      <div className="space-y-3">
        <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} style={inputStyle} placeholder="e.g. Increase annual revenue to ₦5B *" />
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className={inputCls} style={inputStyle} placeholder="The decision, in plain language…" />
        <select value={type} onChange={e => setType(e.target.value as ResolutionType)} className={inputCls} style={inputStyle}>
          {(Object.keys(RESOLUTION_TYPE_LABELS) as ResolutionType[]).map(t => <option key={t} value={t}>{RESOLUTION_TYPE_LABELS[t]}</option>)}
        </select>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: T.muted }}>Target date (optional)</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} style={inputStyle} />
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, color: T.text }}>Cancel</button>
        <button onClick={submit} className="flex-1 px-4 py-2 rounded-lg text-white text-sm" style={{ background: T.primary }}>Propose</button>
      </div>
    </ModalShell>
  )
}

function VoteModal({
  resolution, onClose, onSaved,
}: {
  resolution: GovernanceResolution
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [votesFor, setVotesFor] = useState(0)
  const [votesAgainst, setVotesAgainst] = useState(0)
  const [votesAbstain, setVotesAbstain] = useState(0)

  const submit = async () => {
    const ok = await recordBoardVote(resolution.id, votesFor, votesAgainst, votesAbstain)
    if (!ok) {
      showToast('Could not record the vote.', 'error')
      return
    }
    showToast('Vote recorded.', 'success')
    onSaved()
    onClose()
  }

  const numInput = (label: string, value: number, set: (n: number) => void) => (
    <div>
      <label className="text-xs font-medium mb-1 block" style={{ color: T.muted }}>{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={e => set(Math.max(0, parseInt(e.target.value || '0', 10)))}
        className={inputCls}
        style={inputStyle}
      />
    </div>
  )

  return (
    <ModalShell title={`Vote — ${resolution.title}`} onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: T.muted }}>{RESOLUTION_TYPE_LABELS[resolution.resolution_type]}</p>
      <div className="grid grid-cols-3 gap-3">
        {numInput('For', votesFor, setVotesFor)}
        {numInput('Against', votesAgainst, setVotesAgainst)}
        {numInput('Abstain', votesAbstain, setVotesAbstain)}
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, color: T.text }}>Cancel</button>
        <button onClick={submit} className="flex-1 px-4 py-2 rounded-lg text-white text-sm" style={{ background: T.primary }}>Record vote</button>
      </div>
    </ModalShell>
  )
}

function CascadeModal({
  resolution, businessId, onClose, onSaved,
}: {
  resolution: GovernanceResolution
  businessId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [title, setTitle] = useState(resolution.title)
  const [scope, setScope] = useState<'company' | 'department' | 'team' | 'individual'>('company')
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [departmentId, setDepartmentId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')

  useEffect(() => {
    supabase
      .from('departments')
      .select('id, name')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setDepartments(data ?? []))
  }, [businessId])

  const submit = async () => {
    if (!title.trim()) {
      showToast('Objective title is required.', 'error')
      return
    }
    const id = await cascadeBoardObjective({
      resolutionId: resolution.id,
      title: title.trim(),
      scope,
      departmentId: scope === 'department' && departmentId ? departmentId : null,
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
    })
    if (!id) {
      showToast('Could not cascade the objective.', 'error')
      return
    }
    showToast('Board decision cascaded — the organization can now execute it.', 'success')
    onSaved()
    onClose()
  }

  return (
    <ModalShell title="Cascade to Objective" onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: T.muted }}>
        Turn this approved resolution into an objective the organization executes — then cascade it further into departments and teams.
      </p>
      <div className="space-y-3">
        <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} style={inputStyle} placeholder="Objective title *" />
        <select value={scope} onChange={e => setScope(e.target.value as typeof scope)} className={inputCls} style={inputStyle}>
          <option value="company">Company objective</option>
          <option value="department">Department objective</option>
          <option value="team">Team objective</option>
          <option value="individual">Individual objective</option>
        </select>
        {scope === 'department' && (
          <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">— Select department —</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: T.muted }}>Period start</label>
            <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: T.muted }}>Period end</label>
            <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, color: T.text }}>Cancel</button>
        <button onClick={submit} className="flex-1 px-4 py-2 rounded-lg text-white text-sm" style={{ background: T.primary }}>Cascade</button>
      </div>
    </ModalShell>
  )
}

function ConflictModal({
  businessId, members, onClose, onSaved,
}: {
  businessId: string
  members: GovernanceMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [memberId, setMemberId] = useState(members[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const submit = async () => {
    if (!memberId || !title.trim()) {
      showToast('Member and title are required.', 'error')
      return
    }
    const { error } = await supabase.from('board_conflicts').insert({
      business_id: businessId,
      board_member_id: memberId,
      title: title.trim(),
      description: description.trim() || null,
    })
    if (error) {
      showToast('Could not declare the conflict.', 'error')
      return
    }
    showToast('Conflict declared.', 'success')
    onSaved()
    onClose()
  }

  return (
    <ModalShell title="Declare Conflict of Interest" onClose={onClose}>
      <div className="space-y-3">
        <select value={memberId} onChange={e => setMemberId(e.target.value)} className={inputCls} style={inputStyle}>
          {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.title})</option>)}
        </select>
        <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} style={inputStyle} placeholder="e.g. Director owns shares in a supplier *" />
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={inputCls} style={inputStyle} placeholder="Nature of the conflict…" />
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, color: T.text }}>Cancel</button>
        <button onClick={submit} className="flex-1 px-4 py-2 rounded-lg text-white text-sm" style={{ background: T.primary }}>Declare</button>
      </div>
    </ModalShell>
  )
}




// ---------------------------------------------------------------------------
// Schedule governance meeting (full board or a committee)
// ---------------------------------------------------------------------------

function ScheduleMeetingModal({
  businessId, committees, onClose, onSaved,
}: {
  businessId: string
  committees: NonNullable<GovernanceOverview['committees']>
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [scope, setScope] = useState('full')
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [note, setNote] = useState('')

  const committee = scope !== 'full' ? committees.find(c => c.id === scope) : null
  const defaultTitle = committee ? `${committee.name} meeting` : 'Board of Directors meeting'

  const submit = async () => {
    const finalTitle = (title || defaultTitle).trim()
    if (!finalTitle || !start) {
      showToast('A start time is required.', 'error')
      return
    }
    const result = await createMeeting(businessId, finalTitle, {
      scheduledStart: start,
      description: note.trim() || undefined,
      boardCommitteeId: scope === 'full' ? null : scope,
    })
    if (!result) {
      showToast('Could not schedule — the meeting-scheduling migration may not be applied.', 'error')
      return
    }
    showToast('Meeting scheduled.', 'success')
    onSaved()
    onClose()
  }

  return (
    <ModalShell title="Schedule governance meeting" onClose={onClose}>
      <div className="space-y-3">
        <select value={scope} onChange={e => setScope(e.target.value)} className={inputCls} style={inputStyle}>
          <option value="full">Full board</option>
          {committees.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className={inputCls}
          style={inputStyle}
          placeholder={defaultTitle}
        />
        <input
          type="datetime-local"
          value={start}
          onChange={e => setStart(e.target.value)}
          className={inputCls}
          style={inputStyle}
        />
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          className={inputCls}
          style={inputStyle}
          placeholder="Optional agenda note…"
        />
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, color: T.text }}>Cancel</button>
        <button onClick={submit} className="flex-1 px-4 py-2 rounded-lg text-white text-sm" style={{ background: T.primary }}>Schedule</button>
      </div>
    </ModalShell>
  )
}

