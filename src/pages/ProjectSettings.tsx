import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import {
  ChevronRight, Plus, Edit2, Trash2, GripVertical,
  Check, X, Palette, Settings
} from 'lucide-react'

type JobType = {
  id: string
  label: string
  color: string
  sort_order: number
  is_active: boolean
}

const COLORS = [
  { id: 'indigo', value: '#6366F1', label: 'Indigo' },
  { id: 'green', value: '#10B981', label: 'Green' },
  { id: 'amber', value: '#F59E0B', label: 'Amber' },
  { id: 'purple', value: '#8B5CF6', label: 'Purple' },
  { id: 'red', value: '#EF4444', label: 'Red' },
  { id: 'blue', value: '#3B82F6', label: 'Blue' },
  { id: 'pink', value: '#EC4899', label: 'Pink' },
  { id: 'cyan', value: '#06B6D4', label: 'Cyan' },
]

export default function ProjectSettings() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [jobTypes, setJobTypes] = useState<JobType[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState('#6366F1')
  const [showNewForm, setShowNewForm] = useState(false)

  useEffect(() => {
    loadJobTypes()
  }, [])

  const loadJobTypes = async () => {
    if (!staff?.business_id) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('job_types')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('sort_order', { ascending: true })

      if (error) throw error
      setJobTypes((data as JobType[]) ?? [])
    } catch (err) {
      console.error('Failed to load job types:', err)
      showToast('Failed to load job types', 'error')
    } finally {
      setLoading(false)
    }
  }

  const addJobType = async () => {
    if (!staff?.business_id || !newLabel.trim()) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('job_types')
        .insert({
          business_id: staff.business_id,
          label: newLabel.trim(),
          color: newColor,
          sort_order: jobTypes.length,
          is_active: true,
        })

      if (error) throw error

      await loadJobTypes()
      setNewLabel('')
      setNewColor('#6366F1')
      setShowNewForm(false)
      showToast('Job type added', 'success')
    } catch (err) {
      console.error('Failed to add job type:', err)
      showToast('Failed to add job type', 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateJobType = async (id: string, label: string, color: string) => {
    if (!staff?.business_id || !label.trim()) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('job_types')
        .update({ label: label.trim(), color })
        .eq('id', id)
        .eq('business_id', staff.business_id)

      if (error) throw error

      await loadJobTypes()
      setEditingId(null)
      showToast('Job type updated', 'success')
    } catch (err) {
      console.error('Failed to update job type:', err)
      showToast('Failed to update job type', 'error')
    } finally {
      setSaving(false)
    }
  }

  const deleteJobType = async (id: string) => {
    if (!staff?.business_id) return
    if (!confirm('Are you sure you want to delete this job type?')) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('job_types')
        .delete()
        .eq('id', id)
        .eq('business_id', staff.business_id)

      if (error) throw error

      await loadJobTypes()
      showToast('Job type deleted', 'success')
    } catch (err) {
      console.error('Failed to delete job type:', err)
      showToast('Failed to delete job type', 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (jobType: JobType) => {
    if (!staff?.business_id) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('job_types')
        .update({ is_active: !jobType.is_active })
        .eq('id', jobType.id)
        .eq('business_id', staff.business_id)

      if (error) throw error

      await loadJobTypes()
      showToast(jobType.is_active ? 'Job type disabled' : 'Job type enabled', 'success')
    } catch (err) {
      console.error('Failed to toggle job type:', err)
      showToast('Failed to update job type', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-20">
      <h1 className="text-xl font-medium text-black mb-6">Project Settings</h1>

      {/* Job Types Section */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        <div className="p-4 border-b border-black/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <Palette size={18} className="text-purple-500" />
              </div>
              <div>
                <h2 className="font-medium">Job Types</h2>
                <p className="text-xs text-black/50">Manage project/job categories for your business</p>
              </div>
            </div>
            {!showNewForm && (
              <button
                onClick={() => setShowNewForm(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#4285F4] text-white rounded-lg text-sm font-medium"
              >
                <Plus size={16} />
                Add Type
              </button>
            )}
          </div>
        </div>

        {/* New Job Type Form */}
        {showNewForm && (
          <div className="p-4 bg-white border-b border-black/[0.06]">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-black/50 mb-1">Label</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g., Consulting, Construction"
                  className="w-full px-3 py-2 rounded-lg border border-black/[0.1] text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-black/50 mb-1">Color</label>
                <div className="flex gap-1">
                  {COLORS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setNewColor(c.value)}
                      className={`w-6 h-6 rounded-full ${newColor === c.value ? 'ring-2 ring-offset-2 ring-black' : ''}`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={addJobType}
                disabled={saving || !newLabel.trim()}
                className="p-2 bg-green-500 text-white rounded-lg disabled:opacity-50"
              >
                <Check size={18} />
              </button>
              <button
                onClick={() => { setShowNewForm(false); setNewLabel(''); setNewColor('#6366F1'); }}
                className="p-2 hover:bg-black/[0.05] rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Job Types List */}
        {loading ? (
          <div className="p-8 text-center text-black/50">Loading...</div>
        ) : jobTypes.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-black/50 mb-2">No job types configured</p>
            <p className="text-sm text-black/30">Add job types to categorize your projects</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {jobTypes.map((jt) => (
              <div key={jt.id} className={`p-4 flex items-center gap-3 ${!jt.is_active ? 'opacity-50' : ''}`}>
                <GripVertical size={16} className="text-black/20" />
                
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: jt.color }}
                />

                {editingId === jt.id ? (
                  <>
                    <input
                      type="text"
                      defaultValue={jt.label}
                      id={`edit-${jt.id}`}
                      className="flex-1 px-2 py-1 border border-black/[0.1] rounded text-sm"
                    />
                    <div className="flex gap-1">
                      {COLORS.map(c => (
                        <button
                          key={c.id}
                          onClick={() => {
                            const input = document.getElementById(`edit-${jt.id}`) as HTMLInputElement
                            updateJobType(jt.id, input.value, c.value)
                          }}
                          className={`w-5 h-5 rounded-full ${jt.color === c.value ? 'ring-2 ring-offset-1 ring-black' : ''}`}
                          style={{ backgroundColor: c.value }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 hover:bg-black/[0.05] rounded"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 font-medium">{jt.label}</span>
                    <span className="text-xs text-black/30">{jt.is_active ? 'Active' : 'Inactive'}</span>
                    <button
                      onClick={() => toggleActive(jt)}
                      className={`px-2 py-1 text-xs rounded ${jt.is_active ? 'bg-green-100 text-green-600' : 'bg-white text-black'}`}
                    >
                      {jt.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => setEditingId(jt.id)}
                      className="p-1.5 hover:bg-black/[0.05] rounded text-black/50"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => deleteJobType(jt.id)}
                      className="p-1.5 hover:bg-red-50 rounded text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 rounded-xl">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> Job types help categorize your projects. They appear in the Projects page filter and can be used to organize your work. Disabling a type won't delete existing projects using it.
        </p>
      </div>
    </div>
  )
}
