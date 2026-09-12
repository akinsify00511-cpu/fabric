import { useEffect, useMemo, useState } from 'react'
import BusinessCommandCenter from '../components/BusinessCommandCenter'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useExperienceContext } from '../lib/useExperienceContext'
import { deriveFunction, deriveSeniority, functionLabel, getFunctionHome, seniorityLabel } from '../lib/functionHome'
import {
  fetchBusinessBrain,
  fetchBusinessHealth,
  fetchOpenRecommendations,
  fetchValueLedger,
  type BusinessBrain,
  type BusinessHealth,
  type Recommendation,
  type ValueLedger,
} from '../lib/businessOS'

interface ActionItem { id: string; title: string; to: string; tone: 'red' | 'amber' | 'blue'; detail?: string }

export default function BusinessHomeExperience() {
  const { session, staff, membership } = useAuth()
  const ctx = useExperienceContext()
  const bid = staff?.business_id ?? null
  const [brain, setBrain] = useState<BusinessBrain | null>(null)
  const [health, setHealth] = useState<BusinessHealth | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [ledger, setLedger] = useState<ValueLedger | null>(null)
  const [actions, setActions] = useState<ActionItem[]>([])

  const fn = useMemo(() => deriveFunction(staff?.job_title, staff?.department, ctx.activeTools ?? []), [staff?.job_title, staff?.department, ctx.activeTools])
  const sen = useMemo(() => deriveSeniority(staff?.active_role ?? staff?.role ?? null), [staff?.active_role, staff?.role])
  const homeConfig = useMemo(() => getFunctionHome(fn, sen), [fn, sen])

  useEffect(() => {
    // Membership resolution is authoritative. Do not start tenant-scoped
    // queries while auth is still hydrating or before staff membership exists.
    // This closes the intermittent first-load window where PostgREST can see
    // an incomplete auth state and return a transient 4xx for tenant queries.
    if (membership !== 'member' || !session?.user?.id || !bid) {
      setBrain(null)
      setHealth(null)
      setRecommendations([])
      setLedger(null)
      setActions([])
      return
    }

    let active = true

    const load = async () => {
      // Do not let one optional intelligence source take down the whole home surface.
      // Each loader already owns its domain-specific error handling; the home surface
      // treats unavailable signals as unavailable, not as an empty successful dataset.
      const [brainResult, healthResult, recommendationsResult, ledgerResult, approvalsResult, tasksResult] = await Promise.all([
        fetchBusinessBrain(bid).catch(() => null),
        fetchBusinessHealth(bid).catch(() => null),
        fetchOpenRecommendations(bid, 20).catch(() => []),
        fetchValueLedger(bid).catch(() => null),
        supabase.from('approvals').select('id, description, status').eq('business_id', bid).eq('status', 'pending').limit(5),
        supabase.from('tasks').select('id, title, due_date').eq('business_id', bid).neq('status', 'done').limit(8),
      ])

      if (!active) return
      setBrain(brainResult)
      setHealth(healthResult)
      setRecommendations(recommendationsResult ?? [])
      setLedger(ledgerResult)

      const next: ActionItem[] = []
      if (!approvalsResult.error) {
        ;(approvalsResult.data ?? []).forEach((item: any) => next.push({
          id: item.id,
          title: item.description || 'Approval needed',
          to: '/app/approvals',
          tone: 'red',
          detail: 'Needs your approval',
        }))
      }
      if (!tasksResult.error) {
        ;(tasksResult.data ?? []).forEach((item: any) => {
          const overdue = item.due_date && new Date(item.due_date).getTime() < Date.now()
          next.push({
            id: item.id,
            title: item.title,
            to: '/app/tasks',
            tone: overdue ? 'red' : 'amber',
            detail: overdue ? 'Overdue — act now' : 'Assigned to you',
          })
        })
      }
      setActions(next)
    }

    void load()
    return () => { active = false }
  }, [bid, membership, session?.user?.id])

  return (
    <main aria-label={`${functionLabel(fn)} home`} style={{ background: 'var(--av-home-bg)', minHeight: '100%' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10">
        <BusinessCommandCenter
          brain={brain}
          health={health}
          recommendations={recommendations}
          ledger={ledger}
          actions={actions}
          functionLabel={functionLabel(fn)}
          seniorityLabel={seniorityLabel(sen)}
          businessFunction={fn}
          homeConfig={homeConfig}
        />
      </div>
    </main>
  )
}
