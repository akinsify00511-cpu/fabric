import { useEffect, useState } from 'react'
import { LocateFixed, ShieldCheck } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import { MotionButton, MotionCard } from './OrganismMotion'

export default function PresencePolicyCard() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const canManage = ['owner','admin'].includes(staff?.role || '')
  const [location, setLocation] = useState<any>(null)
  const [radius, setRadius] = useState('150')
  const [required, setRequired] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!canManage || !staff?.business_id) return
    ;(async () => {
      const [{ data: loc }, { data: policy }] = await Promise.all([
        supabase.from('business_locations').select('id,name,address,latitude,longitude,radius_meters').eq('business_id', staff.business_id).eq('is_primary', true).eq('is_active', true).maybeSingle(),
        supabase.from('attendance_policies').select('radius:default_radius_meters,require_location').eq('business_id', staff.business_id).maybeSingle(),
      ])
      setLocation(loc)
      setRadius(String(policy?.radius ?? loc?.radius_meters ?? 150))
      setRequired(Boolean(policy?.require_location))
    })()
  }, [canManage, staff?.business_id])

  if (!canManage) return null

  const saveCurrentLocation = async () => {
    if (!navigator.geolocation || !staff?.business_id) return
    setSaving(true)
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const payload = { business_id: staff.business_id, name: 'Primary workplace', latitude: position.coords.latitude, longitude: position.coords.longitude, radius_meters: Number(radius) || 150, is_primary: true, is_active: true }
        if (location?.id) {
          const { data, error } = await supabase.from('business_locations').update(payload).eq('id', location.id).select('id,name,address,latitude,longitude,radius_meters').single()
          if (error) throw error
          setLocation(data)
        } else {
          const { data, error } = await supabase.from('business_locations').insert(payload).select('id,name,address,latitude,longitude,radius_meters').single()
          if (error) throw error
          setLocation(data)
        }
        showToast('Primary workplace location saved.', 'success')
      } catch (error: any) { showToast(error?.message || 'Could not save workplace location.', 'error') }
      finally { setSaving(false) }
    }, () => { setSaving(false); showToast('Location permission is required to set the workplace.', 'error') }, { enableHighAccuracy: true, timeout: 10000 })
  }

  const savePolicy = async () => {
    if (!staff?.business_id) return
    setSaving(true)
    try {
      const { error } = await supabase.from('attendance_policies').upsert({ business_id: staff.business_id, default_radius_meters: Number(radius) || 150, require_location: required }, { onConflict: 'business_id' })
      if (error) throw error
      showToast('Presence policy saved.', 'success')
    } catch (error: any) { showToast(error?.message || 'Could not save presence policy.', 'error') }
    finally { setSaving(false) }
  }

  return <MotionCard className="rounded-2xl border border-black/10 bg-white p-5">
    <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-green-600"/><h2 className="font-semibold">Workplace verification</h2></div><p className="text-xs text-black/50 mt-1">Set the reference point used to verify staff clock-ins. Location evidence is event-based and visible.</p></div></div>
    <div className="grid md:grid-cols-3 gap-4 mt-5">
      <label className="text-sm">Radius (metres)<input value={radius} onChange={e=>setRadius(e.target.value)} type="number" min="10" max="5000" className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
      <label className="flex items-center gap-2 text-sm md:col-span-2 mt-6"><input type="checkbox" checked={required} onChange={e=>setRequired(e.target.checked)} /> Require location evidence for clock-in/out</label>
    </div>
    <div className="mt-4 flex flex-wrap gap-2"><MotionButton onClick={()=>void saveCurrentLocation()} disabled={saving} className="px-4 py-2 rounded-lg bg-black text-white flex items-center gap-2"><LocateFixed size={16}/> Use current location as workplace</MotionButton><button onClick={()=>void savePolicy()} disabled={saving} className="px-4 py-2 rounded-lg border">Save policy</button></div>
    {location && <p className="text-xs text-black/50 mt-3">Primary workplace: {Number(location.latitude).toFixed(5)}, {Number(location.longitude).toFixed(5)} · {location.radius_meters}m radius</p>}
  </MotionCard>
}
