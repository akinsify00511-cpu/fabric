// Governance Assistant panel — natural-language routing inside the
// Control Plane. Every query maps to governanceControl RPCs via the
// deterministic ROUTES; matched hits show their rule id so the answer is
// explainable (not a helper to hallucinate).

import { useState } from 'react'
import { MessageSquare, Loader2 } from 'lucide-react'
import { askGovernance, describeMatch, type AssistantAnswer } from '../../lib/governanceAssistant'
import { Badge, Section } from './SystemGovernanceSection'

export default function GovernanceAssistantPanel() {
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [history, setHistory] = useState<AssistantAnswer[]>([])

  const run = async (q: string) => {
    if (!q.trim()) return
    setPending(true)
    const hit = await askGovernance(q)
    setHistory(prev => [hit, ...prev].slice(0, 40))
    setPending(false)
  }

  return (
    <Section title="Governance Assistant (deterministic routing — no hallucination)">
      <form
        onSubmit={e => { e.preventDefault(); void run(query); }}
        className="flex items-center gap-2 mb-3"
      >
        <MessageSquare className="w-5 h-5 text-[var(--av-primary)]" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Ask: incidents / autonomy / decisions / audit / health / registry / what broke today?"
          className="flex-1 rounded-lg border border-[var(--av-border)] bg-[var(--av-surface)] px-3 py-2 text-sm"
        />
        <button type="submit" disabled={pending}
          className="px-3 py-2 rounded-lg bg-[var(--av-primary)] text-white text-sm disabled:opacity-50">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ask'}
        </button>
      </form>
      {history.length === 0 ? (
        <p className="text-xs text-[var(--av-text-muted)]">The assistant routes governance keywords against registry + live feeds. Unmatched prompts say &quot;I don't know&quot; instead of fabricating.</p>
      ) : (
        <div className="space-y-3">
          {history.map((h, i) => (
            <div key={i} className="rounded-lg border border-[var(--av-border)] bg-[var(--av-surface-2)] p-3">
              <div className="text-sm text-[var(--av-text)] mb-1">{h.query}</div>
              <div className="text-sm font-medium text-[var(--av-text)]">{h.answer}</div>
              {h.fired.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge text={`rule: ${h.fired[0]}`} style="bg-[var(--av-surface-2)] text-[var(--av-text-muted)]" />
                  <Badge text={`confidence: ${h.confidence}`} style="bg-[var(--av-success-soft)] text-[var(--av-success)]" />
                </div>
              )}
              {Array.isArray(h.matches) && h.matches.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {h.matches.slice(0, 5).map((m, j) => (
                    <li key={j} className="text-xs text-[var(--av-text-muted)]">{describeMatch(m)}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
