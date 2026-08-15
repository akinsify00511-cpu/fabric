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
import { Globe, Loader2, ExternalLink } from 'lucide-react'

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
      // market_intelligence(p_metric, p_geography) returns { benchmarks, count, type, note }.
      // Fetch a few benchmark metrics so the page shows real, sourced data.
      const metrics = ['revenue', 'customer_acquisition_cost', 'gross_margin', 'churn_rate']
      const results = await Promise.all(
        metrics.map(m => supabase.rpc('market_intelligence', { p_metric: m }).then(({ data }) => ({ metric: m, data })))
      )
      if (!active) return
      const benchmarks = results.flatMap(r => (r.data?.benchmarks || []).map((b: any) => ({ ...b, metric: r.metric })))
      setData(benchmarks.length ? { benchmarks } : null)
      setLoading(false)
    })().catch(() => { if (active) { setError('Market intelligence data could not be loaded.'); setLoading(false) } })
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
        <ClaimNote tone="warn">{error}</ClaimNote>
      ) : !data ? (
        <ClaimNote>No market benchmark data is available yet. This populates as external benchmark figures are added to your market dataset.</ClaimNote>
      ) : (
        <>
          <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)] mb-4">
            <h2 className="font-semibold text-[var(--av-text)] mb-3 flex items-center gap-2">Benchmarks <ClaimTag type="FACT" /></h2>
            <div className="space-y-3">
              {data.benchmarks.map((b: any, i: number) => (
                <div key={i} className="text-sm border-b border-[var(--av-border)] last:border-0 pb-3 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-[var(--av-text)] capitalize">{b.metric || 'Metric'}</div>
                      {b.geography && <div className="text-xs text-[var(--av-text-secondary)]">{b.geography}{b.industry ? ` · ${b.industry}` : ''}</div>}
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-[var(--av-text)]">{b.value}{b.currency && b.value != null ? ` ${b.currency}` : ''}</span>
                      {b.confidence != null && <span className="ml-2 text-xs text-[var(--av-text-muted)]">{Math.round(b.confidence * 100)}% conf</span>}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-[var(--av-text-muted)]">
                    {b.source && <span className="flex items-center gap-1"><ExternalLink size={11} /> {b.source}</span>}
                    {b.source_date && <span>{new Date(b.source_date).toLocaleDateString()}</span>}
                    {b.freshness && <span className="capitalize">{b.freshness}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <ClaimNote tone="info">
              Market figures are <b>facts</b> drawn from external sources with mandatory provenance (source, date, methodology). Treat them as reference, not truth — use them to ask better questions about your own numbers.
            </ClaimNote>
          </div>
        </>
      )}
    </div>
  )
}
