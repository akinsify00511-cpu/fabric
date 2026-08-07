import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Wrench, Plus, Loader2, AlertCircle, CheckCircle2, Clock, Calendar
} from 'lucide-react'

export default function Equipment() {
  const { staff } = useAuth()
  const businessId = staff?.business_id
  const [equipment, setEquipment] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    name: '',
    equipment_type: 'general',
    serial_number: '',
    location: '',
  })

  useEffect(() => {
    loadEquipment()
  }, [])

  async function loadEquipment() {
    setLoading(true)
    const { data } = await supabase
      .from('equipment')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    setEquipment(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('equipment').insert({
      ...form,
      business_id: businessId,
    })
    showToast('Equipment added!', 'success')
    setShowForm(false)
    setForm({ name: '', equipment_type: 'general', serial_number: '', location: '' })
    loadEquipment()
  }

  const operationalCount = equipment.filter(e => e.status === 'operational').length
  const maintenanceCount = equipment.filter(e => e.status === 'maintenance').length
  const brokenCount = equipment.filter(e => e.status === 'broken').length

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-black">Equipment & Maintenance</h1>
          <p className="text-sm text-black">Track assets and maintenance schedules</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4285F4] text-white text-sm"
        >
          <Plus size={16} /> Add Equipment
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white text-center">
          <CheckCircle2 size={24} className="mx-auto mb-1" />
          <div className="text-2xl font-bold">{operationalCount}</div>
          <div className="text-sm opacity-80">Operational</div>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white text-center">
          <Wrench size={24} className="mx-auto mb-1" />
          <div className="text-2xl font-bold">{maintenanceCount}</div>
          <div className="text-sm opacity-80">Maintenance</div>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-4 text-white text-center">
          <AlertCircle size={24} className="mx-auto mb-1" />
          <div className="text-2xl font-bold">{brokenCount}</div>
          <div className="text-sm opacity-80">Broken</div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-6 space-y-3">
          <input
            type="text"
            placeholder="Equipment Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            required
          />
          <select
            value={form.equipment_type}
            onChange={(e) => setForm({ ...form, equipment_type: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
          >
            <option value="general">General</option>
            <option value="machinery">Machinery</option>
            <option value="vehicle">Vehicle</option>
            <option value="computer">Computer/IT</option>
            <option value="furniture">Furniture</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Serial Number"
              value={form.serial_number}
              onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="w-full py-2 rounded-lg bg-[#4285F4] text-white">
            Add Equipment
          </button>
        </form>
      )}

      {/* Equipment List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-black" /></div>
      ) : equipment.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Wrench size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No equipment registered</p>
          <p className="text-sm text-black mt-1">Add your first piece of equipment</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {equipment.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    item.status === 'operational' ? 'bg-green-500/10' :
                    item.status === 'maintenance' ? 'bg-amber-500/10' :
                    'bg-red-500/10'
                  }`}>
                    <Wrench size={24} className={
                      item.status === 'operational' ? 'text-green-500' :
                      item.status === 'maintenance' ? 'text-amber-500' :
                      'text-red-500'
                    } />
                  </div>
                  <div>
                    <h3 className="font-medium">{item.name}</h3>
                    <p className="text-sm text-black capitalize">{item.equipment_type}</p>
                  </div>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full capitalize ${
                  item.status === 'operational' ? 'bg-green-100 text-green-700' :
                  item.status === 'maintenance' ? 'bg-amber-100 text-amber-700' :
                  item.status === 'broken' ? 'bg-red-100 text-red-700' :
                  'bg-white text-black'
                }`}>
                  {item.status}
                </span>
              </div>
              
              {item.serial_number && (
                <div className="text-sm text-black mb-2">
                  <span className="font-medium">S/N:</span> {item.serial_number}
                </div>
              )}
              
              {item.location && (
                <div className="text-sm text-black">
                  <span className="font-medium">Location:</span> {item.location}
                </div>
              )}
              
              {item.warranty_expiry && (
                <div className="flex items-center gap-2 mt-3 text-xs text-black">
                  <Calendar size={14} />
                  <span>Warranty: {new Date(item.warranty_expiry).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
