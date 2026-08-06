import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  FlaskConical, Plus, Loader2, CheckCircle2, AlertCircle, Clock, Beaker
} from 'lucide-react'

export default function LabQC() {
  const { staff } = useAuth()
  const businessId = staff?.business_id
  const [samples, setSamples] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    sample_id: '',
    sample_type: '',
    client_name: '',
  })

  useEffect(() => {
    loadSamples()
  }, [])

  async function loadSamples() {
    setLoading(true)
    const { data } = await supabase
      .from('lab_samples')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    setSamples(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('lab_samples').insert({
      ...form,
      business_id: businessId,
      status: 'received',
    })
    showToast('Sample registered!', 'success')
    setShowForm(false)
    setForm({ sample_id: '', sample_type: '', client_name: '' })
    loadSamples()
  }

  const pendingCount = samples.filter(s => s.status === 'received' || s.status === 'testing').length
  const completedCount = samples.filter(s => s.status === 'completed').length
  const reportedCount = samples.filter(s => s.status === 'reported').length

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--avenize-black)]">Lab & Quality Control</h1>
          <p className="text-sm text-black/50">Samples, tests & QC reports</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--avenize-primary)] text-white text-sm"
        >
          <Plus size={16} /> Register Sample
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white text-center">
          <Clock size={24} className="mx-auto mb-1" />
          <div className="text-2xl font-bold">{pendingCount}</div>
          <div className="text-sm opacity-80">Pending</div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white text-center">
          <Beaker size={24} className="mx-auto mb-1" />
          <div className="text-2xl font-bold">{completedCount}</div>
          <div className="text-sm opacity-80">Tested</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white text-center">
          <CheckCircle2 size={24} className="mx-auto mb-1" />
          <div className="text-2xl font-bold">{reportedCount}</div>
          <div className="text-sm opacity-80">Reported</div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-6 space-y-3">
          <input
            type="text"
            placeholder="Sample ID (e.g., LAB-001)"
            value={form.sample_id}
            onChange={(e) => setForm({ ...form, sample_id: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Sample Type"
              value={form.sample_type}
              onChange={(e) => setForm({ ...form, sample_type: e.target.value })}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Client Name"
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--avenize-primary)] text-white">
            Register Sample
          </button>
        </form>
      )}

      {/* Samples List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-black/30" /></div>
      ) : samples.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <FlaskConical size={48} className="mx-auto text-black/20 mb-3" />
          <p className="text-black/50">No samples registered</p>
          <p className="text-sm text-black/30 mt-1">Register your first lab sample</p>
        </div>
      ) : (
        <div className="space-y-3">
          {samples.map((sample) => (
            <div key={sample.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    sample.status === 'reported' ? 'bg-green-500/10' :
                    sample.status === 'completed' ? 'bg-blue-500/10' :
                    sample.status === 'testing' ? 'bg-amber-500/10' :
                    'bg-gray-500/10'
                  }`}>
                    <FlaskConical size={24} className={
                      sample.status === 'reported' ? 'text-green-500' :
                      sample.status === 'completed' ? 'text-blue-500' :
                      sample.status === 'testing' ? 'text-amber-500' :
                      'text-gray-500'
                    } />
                  </div>
                  <div>
                    <h3 className="font-medium">{sample.sample_id}</h3>
                    <p className="text-sm text-black/50">
                      {sample.client_name || 'No client'} • {sample.sample_type || 'No type'}
                    </p>
                  </div>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full capitalize ${
                  sample.status === 'reported' ? 'bg-green-100 text-green-700' :
                  sample.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                  sample.status === 'testing' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {sample.status}
                </span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-black/5">
                <span className="text-xs text-black/40">
                  Registered: {new Date(sample.created_at).toLocaleDateString()}
                </span>
                <button 
                  onClick={async () => {
                    const nextStatus = sample.status === 'received' ? 'testing' : 
                                      sample.status === 'testing' ? 'completed' : 'reported'
                    await supabase.from('lab_samples').update({ status: nextStatus }).eq('id', sample.id)
                    showToast(`Status updated to ${nextStatus}`, 'success')
                    loadSamples()
                  }}
                  className="text-xs text-[var(--avenize-primary)] hover:underline"
                >
                  Update Status →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
