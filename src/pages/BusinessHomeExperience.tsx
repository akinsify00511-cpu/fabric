import { useEffect, useMemo, useState } from 'react'
import BusinessHome from './BusinessHome'
import BusinessCommandCenter from '../components/BusinessCommandCenter'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useExperienceContext } from '../lib/useExperienceContext'
import { deriveFunction, deriveSeniority, functionLabel, seniorityLabel } from '../lib/functionHome'
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
  const { staff } = useAuth()
  const ctx = useExperienceContext()
  const bid = staff?.business_id ?? null
  const [brain, setBrain] = useState<BusinessBrain | null>(null)
  const [health, setHealth] = useState<BusinessHealth | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [ledger, setLedger] = useState<ValueLedger | null>(null)
  const [actions, setActions] = useState<ActionItem[]>([])

  const fn = useMemo(
    () => deriveFunction(staff?.job_title, staff?.department, ctx.activeTools ?? []),
    [staff?.job_title, staff?.department, ctx.activeTools],
  )
  const sen = useMemo(() => deriveSeniority(staff?.active_role ?? staff?.role ?? null), [staff?.active_role, staff?.role])

  useEffect(() => {
    if (!bid) return
    let active = true
    const load = async () => {
      const [brainResult, healthResult, recommendationsResult, ledgerResult, attentionResult] = await Promise.all([
        fetchBusinessBrain(bid).catch(() => null),
        fetchBusinessHealth(bid).catch(() => null),
        fetchOpenRecommendations(bid, 20).catch(() => []),
        fetchValueLedger(bid).catch(() => null),
        Promise.all([
          supabase.from('approvals').select('id, description, status').eq('business_id', bid).eq('status', 'pending').limit(5),
          supabase.from('tasks').select('id, title, due_date').eq('business_id', bid).neq('status', 'done').limit(8),
        ]).catch(() => [{ data: [] }, { data: [] }]),
      ])
      if (!active) return
      setBrain(brainResult)
      setHealth(healthResult)
      setRecommendations(recommendationsResult ?? [])
      setLedger(ledgerResult)

      const [approvals, tasks] = attentionResult
      const next: ActionItem[] = []
      ;(approvals?.data ?? []).forEach((item: any) => next.push({
        id: item.id,
        title: item.description || 'Approval needed',
        to: '/app/approvals',
        tone: 'red',
        detail: 'Needs approval',
      }))
      ;(tasks?.data ?? []).forEach((item: any) => {
        const overdue = item.due_date && new Date(item.due_date).getTime() < Date.now()
        next.push({
          id: item.id,
          title: item.title,
          to: '/app/tasks',
          tone: overdue ? 'red' : 'amber',
          detail: overdue ? 'Overdue' : 'Open task',
        })
      })
      setActions(next)
    }
    void load()
    return () => { active = false }
  }, [bid])

  return (
    <>
      <div style={{ background: 'var(--av-home-bg)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <BusinessCommandCenter
            brain={brain}
            health={health}
            recommendations={recommendations}
            ledger={ledger}
            actions={actions}
            functionLabel={functionLabel(fn)}
            seniorityLabel={seniorityLabel(sen)}
          />
        </div>
      </div>
      <BusinessHome />
    </>
  )
}
