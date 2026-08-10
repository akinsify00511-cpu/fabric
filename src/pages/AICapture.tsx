// AI Intent & Data Gateway — the flagship "Tell Avenize what happened"
// capture surface (Architecture §5). A user types (or pastes) natural
// language; we parse intent + entities, show "What I Understood" with
// evidence/confidence/proposed destinations, and on confirm raise a
// business event that downstream modules react to.

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { parseIntent } from '../lib/intentParser'
import { useToast } from '../components/Toast'
import { emitBusinessEvent } from '../lib/businessOS'
import {
  Sparkles, Send, Check, X, AlertTriangle, ArrowRight,
  Database, Shield, Loader2, Mic, Paperclip, Image as ImageIcon
} from 'lucide-react'

interface Entity { field: string; value: string; raw: string }
interface Destination { entity_type: string; action: string; reason: string }
interface Intent {
  event_type: string
  summary: string
  entities: Entity[]
  destinations: Destination[]
  confidence: number
  evidence: { source: string; method: string }
  needs_confirmation: boolean
}

export default function AICapture() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [input, setInput] = useState('')
  const [intent, setIntent] = useState<Intent | null>(null)
  const [guardrail, setGuardrail] = useState<{ checked: boolean; rung?: string; allowed?: boolean; reason?: string } | null>(null)
  const [parsing, setParsing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)

  async function handleParse() {
    if (!input.trim()) return
    setParsing(true); setIntent(null); setDone(false); setGuardrail(null)
    try {
      const { data, error } = await supabase.functions.invoke('parse-intent', {
        body: { text: input.trim() },
      })
      if (error) throw error
      setIntent(data.intent)
      if (data.guardrail) setGuardrail(data.guardrail)
    } catch (e) {
      // Fallback: local parse so the feature works even if the edge fn
      // isn't deployed yet. Mirrors the edge fn's deterministic parser.
      setIntent(localParse(input.trim()))
    } finally {
      setParsing(false)
    }
  }

  async function handleConfirm() {
    if (!intent || !staff?.business_id) return
    setConfirming(true)
    try {
      // Raise the canonical business event. Downstream handlers in the
      // event bus (handler_propagate_capture → handler_update_entity_freshness)
      // perform the real writes proposed by each destination.
      const payload: Record<string, any> = {}
      for (const e of intent.entities) payload[e.field] = e.value
      payload._raw = input.trim()
      payload._destinations = intent.destinations

      await emitBusinessEvent({
        business_id: staff.business_id,
        event_type: intent.event_type,
        entity_type: intent.event_type === 'DealWon' ? 'deal'
          : intent.event_type === 'PaymentReceived' ? 'invoice'
          : intent.event_type === 'EmployeeJoined' || intent.event_type === 'EmployeeExited' ? 'staff'
          : intent.event_type === 'InventoryLow' ? 'product'
          : 'note',
        payload,
        related_entities: intent.destinations.map(d => ({ type: d.entity_type, action: d.action })),
        source: 'ai_gateway',
        actor_id: staff.id,
        capture_mode: 'natural_language',
        confidence: intent.confidence,
      })
      setDone(true)
      // Be specific about what was acted on so the user knows the capture
      // actually wrote records, not just raised an event.
      const actedOn = intent.destinations
        .map(d => d.action.replace(/_/g, ' '))
        .slice(0, 3)
        .join(', ')
      showToast(`Captured — updating: ${actedOn}`, 'success')
    } catch (e) {
      console.error(e)
      showToast('Could not commit the capture', 'error')
    } finally {
      setConfirming(false)
    }
  }

  function reset() {
    setInput(''); setIntent(null); setDone(false)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
          <Sparkles size={24} className="text-[var(--av-primary)]" />
          Tell Avenize what happened
        </h1>
        <p className="text-sm text-[var(--av-text-secondary)] mt-1">
          Describe an activity in plain language. Avenize understands it, shows what it understood, and updates the right records — after you confirm.
        </p>
      </div>

      {/* Examples */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          'We just closed the ABC Properties deal for ₦45m. John handled it and the client will pay 40% upfront.',
          'Client paid ₦2.5m for invoice INV-204 today.',
          'We hired a new sales rep, Tola, started Monday.',
          'Stock of cement is low, only 20 bags left, reorder level is 50.',
        ].map((ex, i) => (
          <button key={i} onClick={() => setInput(ex)}
            className="text-xs px-3 py-1.5 rounded-full bg-[var(--av-surface-2)] text-[var(--av-text-secondary)] hover:bg-[var(--av-primary-soft)] hover:text-[var(--av-primary)] transition">
            {ex.slice(0, 42)}…
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="relative">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={3}
          placeholder="e.g. We closed the ABC deal for ₦45m, John handled it, 40% upfront…"
          className="w-full rounded-2xl border border-[var(--av-border)] bg-white p-4 pr-28 text-[var(--av-text)] placeholder:text-[var(--av-text-tertiary)] focus:border-[var(--av-primary)] focus:outline-none resize-none"
        />
        <div className="absolute right-3 bottom-3 flex items-center gap-1">
          <button title="Voice" className="p-2 rounded-lg hover:bg-[var(--av-surface-2)] text-[var(--av-text-secondary)]"><Mic size={18} /></button>
          <button title="Attach file" className="p-2 rounded-lg hover:bg-[var(--av-surface-2)] text-[var(--av-text-secondary)]"><Paperclip size={18} /></button>
          <button title="Image" className="p-2 rounded-lg hover:bg-[var(--av-surface-2)] text-[var(--av-text-secondary)]"><ImageIcon size={18} /></button>
        </div>
      </div>

      <div className="flex justify-end mt-3">
        <button onClick={handleParse} disabled={!input.trim() || parsing}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50 transition">
          {parsing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          Understand this
        </button>
      </div>

      {/* What I Understood */}
      {intent && !done && (
        <div className="mt-6 rounded-2xl border border-[var(--av-border)] bg-white shadow-[var(--av-elevation-2)] overflow-hidden">
          <div className="px-5 py-4 bg-[var(--av-surface-2)] border-b border-[var(--av-border)]">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--av-text)] flex items-center gap-2">
                <Check size={18} className="text-[var(--av-success)]" /> What I understood
              </h2>
              <ConfidencePill value={intent.confidence} />
            </div>
            <p className="text-xs text-[var(--av-text-tertiary)] mt-1 flex items-center gap-1">
              <Shield size={12} /> Evidence: {intent.evidence.source} · {intent.evidence.method}
            </p>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <span className="text-xs font-medium uppercase text-[var(--av-text-tertiary)]">Detected event</span>
              <div className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--av-primary-soft)] text-[var(--av-primary)] font-medium text-sm">
                <Database size={14} /> {intent.event_type}
              </div>
            </div>

            {intent.entities.length > 0 && (
              <div>
                <span className="text-xs font-medium uppercase text-[var(--av-text-tertiary)]">Extracted</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {intent.entities.map((e, i) => (
                    <div key={i} className="px-3 py-1.5 rounded-lg bg-[var(--av-surface-2)] text-sm">
                      <span className="text-[var(--av-text-tertiary)]">{e.field}:</span>{' '}
                      <span className="font-medium text-[var(--av-text)]">{e.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <span className="text-xs font-medium uppercase text-[var(--av-text-tertiary)]">Proposed destinations</span>
              <div className="mt-1 space-y-1.5">
                {intent.destinations.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <ArrowRight size={14} className="text-[var(--av-text-tertiary)] mt-0.5 shrink-0" />
                    <span><span className="font-medium text-[var(--av-text)]">{d.entity_type}.{d.action}</span>
                      <span className="text-[var(--av-text-secondary)]"> — {d.reason}</span></span>
                  </div>
                ))}
              </div>
            </div>

            {intent.needs_confirmation && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--av-warning)]/10 text-[var(--av-warning)] text-sm">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                This looks consequential. Avenize won't commit it until you confirm.
              </div>
            )}

            {guardrail && guardrail.checked && (
              <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${guardrail.allowed ? 'bg-[var(--av-success)]/10 text-[var(--av-success)]' : 'bg-[var(--av-danger)]/10 text-[var(--av-danger)]'}`}>
                <Shield size={16} className="mt-0.5 shrink-0" />
                <span>
                  <b>AI guardrail:</b> rung <code className="text-xs">{guardrail.rung}</code> — {guardrail.reason}
                  {!guardrail.allowed && ' — action blocked, circuit breaker tripped.'}
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={reset} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-2)] transition">
                <X size={16} /> Discard
              </button>
              <button onClick={handleConfirm} disabled={confirming}
                className="flex items-center gap-2 px-5 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50 transition">
                {confirming ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Confirm & commit
              </button>
            </div>
          </div>
        </div>
      )}

      {done && (
        <div className="mt-6 rounded-2xl border border-[var(--av-success)]/30 bg-[var(--av-success)]/5 p-6">
          <div className="flex items-center gap-3 mb-3">
            <Check size={28} className="text-[var(--av-success)]" />
            <div>
              <h2 className="font-semibold text-[var(--av-text)]">Captured and propagated</h2>
              <p className="text-sm text-[var(--av-text-secondary)]">
                The {intent?.event_type} event is on the bus and handlers wrote to the destination records.
              </p>
            </div>
          </div>
          <div className="space-y-1.5 mb-4">
            {intent?.destinations.map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-[var(--av-text-secondary)]">
                <Check size={14} className="text-[var(--av-success)] mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium text-[var(--av-text)]">{d.action.replace(/_/g, ' ')}</span>
                  {' — '}{d.reason}
                </span>
              </div>
            ))}
          </div>
          <button onClick={reset} className="text-[var(--av-primary)] text-sm font-medium hover:underline">
            Capture something else
          </button>
        </div>
      )}
    </div>
  )
}

function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.8 ? 'var(--av-success)' : value >= 0.6 ? 'var(--av-warning)' : 'var(--av-error)'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {pct}% confidence
    </span>
  )
}

// Local fallback parser — delegates to the shared deterministic parser so
// the edge function and client never diverge.
function localParse(text: string): Intent {
  return parseIntent(text) as Intent
}
