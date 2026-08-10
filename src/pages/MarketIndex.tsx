// Market Index Intelligence — dedicated page for the market/benchmark
// intelligence domain (Intelligence Addendum §8, dev_exp §22). The
// market_intelligence RPC already exists; this surfaces it with the
// evidence model: every figure tagged fact/inference/estimate with
// confidence and source.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useDbState, DbStateBanner } from '../lib/useDbState'
import { ClaimTag, ClaimNote } from '../components/Evidence'
import { Globe, Loader2, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react'

export default function MarketIndex() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const dbState = useDbState()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bid) return
    let active = true
    setLoading(true); setError(null)
    ;(async () => {
      const { data, error } = await supabase.rpc('market_intelligence', { p_business_id: bid })
      if (!active) return
      if (error) { setError(error.message); setLoading(false); return }
      setData(data); setLoading(false)
    })()
    return () => { active = false }
  }, [bid])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <DbStateBanner state={dbState} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
          <Globe size={24} className="text-[var(--av-primary)]" /> Market Index
        </h1>
        <p className="text-sm text-[var(--av-text-secondary)] mt-1">
          How the business compares to its market and benchmarks. Every figure is tagged by what it is — fact, inference or estimate.
        </p>
      </div>

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>
      ) : error ? (
        <ClaimNote tone="warn">Market intelligence isn't available yet: {error}</ClaimNote>
      ) : !data ? (
        <ClaimNote>No market data available for this business yet.</ClaimNote>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Stat label="Market position" value={data.position || data.market_position || '—'} claim={data.position_confidence ? 'INFERENCE' : 'INFERENCE'} confidence={data.position_confidence} />
            <Stat label="Benchmark gap" value={data.benchmark_gap != null ? `${data.benchmark_gap > 0 ? '+' : ''}${Math.round(data.benchmark_gap)}%` : '—'} claim="INFERENCE" confidence={data.gap_confidence} trend={data.benchmark_gap >= 0 ? 'up' : 'down'} />
            <Stat label="Index score" value={data.index_score != null ? String(Math.round(data.index_score)) : '—'} claim="ESTIMATE" confidence={data.index_confidence} />
          </div>

          {data.signals && Array.isArray(data.signals) && data.signals.length > 0 && (
            <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)] mb-4">
              <h2 className="font-semibold text-[var(--av-text)] mb-3 flex items-center gap-2">Market signals <ClaimTag type="INFERENCE" /></h2>
              <div className="space-y-2">
                {data.signals.map((s: any, i: number) => (
                  <div key={i} className="text-sm flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-[var(--av-text)]">{s.label || s.name || s.metric}</div>
                      {s.detail && <div className="text-xs text-[var(--av-text-secondary)]">{s.detail}</div>}
                    </div>
                    {s.value != null && <span className="font-medium text-[var(--av-text)]">{typeof s.value === 'number' ? (s.value > 1 ? s.value.toLocaleString() : `${Math.round(s.value*100)}%`) : s.value}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.benchmarks && Array.isArray(data.benchmarks) && data.benchmarks.length > 0 && (
            <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)] mb-4">
              <h2 className="font-semibold text-[var(--av-text)] mb-3 flex items-center gap-2">Benchmarks <ClaimTag type="FACT" /></h2>
              <div className="space-y-2">
                {data.benchmarks.map((b: any, i: number) => (
                  <div key={i} className="text-sm flex justify-between">
                    <span className="text-[var(--av-text-secondary)]">{b.label || b.name}</span>
                    <span className="font-medium text-[var(--av-text)]">{b.value}{b.unit || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.sources && Array.isArray(data.sources) && data.sources.length > 0 && (
            <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)]">
              <h2 className="font-semibold text-[var(--av-text)] mb-3">Sources</h2>
              <div className="space-y-1.5">
                {data.sources.map((src: any, i: number) => (
                  <div key={i} className="text-sm flex items-center gap-2 text-[var(--av-text-secondary)]">
                    <ExternalLink size={13} /> {typeof src === 'string' ? src : (src.name || src.url)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            <ClaimNote tone="info">
              Market figures are <b>inferences</b> built from your recorded data and external benchmarks — not facts. Use them to ask better questions, not as the final word.
            </ClaimNote>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, claim, confidence, trend }: { label: string; value: string; claim: any; confidence?: number; trend?: 'up'|'down' }) {
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[var(--av-text-secondary)]">{label}</span>
        {trend && <Icon size={15} className={trend === 'up' ? 'text-[var(--av-success)]' : 'text-[var(--av-danger)]'} />}
      </div>
      <div className="text-2xl font-bold text-[var(--av-text)]">{value}</div>
      <div className="mt-2"><ClaimTag type={claim} confidence={confidence} /></div>
    </div>
  )
}
