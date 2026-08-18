/**
 * SubsidiarySwitcher — lets a group owner/admin switch which subsidiary they
 * are currently operating in, and create new subsidiaries.
 *
 * Sits in the Shell header (desktop) + mobile. Only rendered when
 * `canSwitch` (the user has >1 accessible business) or the user is a group
 * owner/admin (can create subsidiaries).
 *
 * SECURITY: the switcher only offers businesses returned by
 * get_current_accessible_businesses() (server-side gate). The create flow
 * calls the create_subsidiary RPC, which re-verifies authorization
 * server-side. The UI is UX only; RLS + the RPCs are the authority.
 */
import { useState } from 'react'
import { ChevronDown, Building2, Plus, Check, Loader2, X } from 'lucide-react'
import { useBusiness } from '../lib/BusinessContext'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'

export function SubsidiarySwitcher() {
  const { activeBusinessId, accessibleBusinesses, canSwitch, setActiveBusiness, refresh } = useBusiness()
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  // A user can create subsidiaries if they're a group_owner/group_admin in
  // their accessible set. (The RPC re-verifies server-side regardless.)
  const canCreate = accessibleBusinesses.some(b => b.access_role === 'group_owner' || b.access_role === 'group_admin')

  if (!canSwitch && !canCreate) return null

  const active = accessibleBusinesses.find(b => b.business_id === activeBusinessId)
  const label = active?.name ?? 'Select business'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition"
        style={{ background: 'var(--av-glass-bg-strong)', color: 'var(--av-text)', border: '1px solid var(--av-glass-border)' }}
        aria-label="Switch subsidiary"
      >
        <Building2 size={15} style={{ color: 'var(--av-primary)' }} />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown size={14} style={{ color: 'var(--av-text-muted)' }} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-2 w-72 rounded-2xl p-2 z-50"
            style={{ background: 'var(--av-surface-elevated)', border: '1px solid var(--av-glass-border)', boxShadow: 'var(--av-shadow-lg)' }}
          >
            <p className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--av-text-muted)' }}>
              Your businesses
            </p>
            <div className="max-h-64 overflow-y-auto">
              {accessibleBusinesses.map(b => (
                <button
                  key={b.business_id}
                  onClick={() => { setActiveBusiness(b.business_id); setOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition hover:bg-[var(--av-surface-2)]"
                >
                  <Building2 size={15} style={{ color: b.business_id === activeBusinessId ? 'var(--av-primary)' : 'var(--av-text-muted)' }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate" style={{ color: 'var(--av-text)' }}>{b.name ?? 'Untitled'}</span>
                    <span className="block text-[11px] capitalize" style={{ color: 'var(--av-text-muted)' }}>
                      {b.entity_type ?? 'company'} · {b.access_role.replace('group_', '')}
                    </span>
                  </span>
                  {b.business_id === activeBusinessId && <Check size={15} style={{ color: 'var(--av-primary)' }} />}
                </button>
              ))}
            </div>
            {canCreate && (
              <>
                <div className="my-1 border-t" style={{ borderColor: 'var(--av-glass-border)' }} />
                <button
                  onClick={() => { setShowCreate(true); setOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition hover:bg-[var(--av-surface-2)]"
                  style={{ color: 'var(--av-primary)' }}
                >
                  <Plus size={15} /> New subsidiary
                </button>
              </>
            )}
          </div>
        </>
      )}

      {showCreate && (
        <CreateSubsidiaryModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { refresh(); setShowCreate(false) }}
        />
      )}
    </div>
  )
}

function CreateSubsidiaryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [entityType, setEntityType] = useState<'subsidiary' | 'branch' | 'business_unit'>('subsidiary')
  const [industry, setIndustry] = useState('')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) { toast('error', 'Enter a subsidiary name'); return }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('create_subsidiary', {
        p_name: name.trim(),
        p_entity_type: entityType,
        p_industry: industry.trim() || null,
      })
      if (error) throw error
      toast('success', `${entityType} created`)
      onCreated()
    } catch (e: any) {
      toast('error', e.message || 'Could not create subsidiary')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--av-surface-elevated)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--av-text)' }}>New subsidiary</h3>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--av-text-muted)' }} /></button>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--av-text-secondary)' }}>
          Add a subsidiary, branch, or business unit under your organization. You'll be able to switch into it immediately.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--av-text-secondary)' }}>Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Lagos Branch"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--av-surface-2)', border: '1px solid var(--av-glass-border)', color: 'var(--av-text)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--av-text-secondary)' }}>Type</label>
            <div className="flex gap-2">
              {(['subsidiary', 'branch', 'business_unit'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setEntityType(t)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm capitalize transition"
                  style={entityType === t
                    ? { background: 'var(--av-primary)', color: 'white' }
                    : { background: 'var(--av-surface-2)', color: 'var(--av-text-secondary)', border: '1px solid var(--av-glass-border)' }}
                >
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--av-text-secondary)' }}>Industry (optional)</label>
            <input
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              placeholder="e.g. retail"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--av-surface-2)', border: '1px solid var(--av-glass-border)', color: 'var(--av-text)' }}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium" style={{ background: 'var(--av-surface-2)', color: 'var(--av-text-secondary)' }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: 'var(--av-primary)' }}>
            {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
