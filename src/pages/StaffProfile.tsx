// ============================================
// STAFF PROFILE PAGE
// View staff member details with role history and access
// ============================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { 
  Mail, Phone, MapPin, Building2, Refresh, Users, 
  Target, DollarSign, Calendar, MessageCircle
} from 'lucide-react'

interface StaffProfile {
  id: string
  full_name: string
  email: string
  phone?: string
  role: string
  job_title?: string
  department?: string
  avatar_url?: string
  created_at: string
}

interface RoleHistory {
  title: string
  period: string
  workspace: string
  achievements: string[]
}

export default function StaffProfile() {
  const { staffId } = useParams<{ staffId: string }>()
  const navigate = useNavigate()
  const { staff: currentStaff } = useAuth()
  
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (staffId) {
      loadProfile()
    }
  }, [staffId])

  const loadProfile = async () => {
    if (!staffId || !currentStaff?.business_id) return

    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('id', staffId)
        .eq('business_id', currentStaff.business_id)
        .single()

      if (error) throw error
      setProfile(data)
    } catch (err) {
      console.error('Error loading profile:', err)
      setError('Failed to load profile')
    }

    setLoading(false)
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-amber-100 text-amber-800'
      case 'admin': return 'bg-purple-100 text-purple-800'
      case 'manager': return 'bg-blue-100 text-blue-800'
      case 'team_lead': return 'bg-emerald-100 text-emerald-800'
      default: return 'bg-slate-100 text-slate-800'
    }
  }

  // Mock role history data
  const roleHistory: RoleHistory[] = profile ? [
    {
      title: profile.job_title || profile.role,
      period: '2024 – now',
      workspace: 'CRM workspace',
      achievements: [
        `Closed ₦18M in new business`,
        `Top performer, Q3 2023`,
        `Promoted to ${profile.job_title || profile.role}, Jan 2024`
      ]
    }
  ] : []

  if (loading) {
    return (
      <div className="pb-20">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-black/5 rounded-2xl"></div>
          <div className="h-48 bg-black/5 rounded-2xl"></div>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="pb-20">
        <div className="bg-white rounded-2xl border border-black/[0.06] p-8 text-center">
          <p className="text-black/50">Profile not found</p>
          <button 
            onClick={() => navigate(-1)}
            className="mt-4 px-4 py-2 bg-black text-white rounded-lg text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20">
      {/* Header Grid: Avatar + Bio */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        <div className="col-span-12 md:col-span-3">
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6 flex flex-col items-center">
            {profile.avatar_url ? (
              <img 
                src={profile.avatar_url} 
                alt={profile.full_name}
                className="w-28 h-28 rounded-2xl object-cover mb-4"
              />
            ) : (
              <div className="w-28 h-28 rounded-2xl bg-[#E6F1FB] flex items-center justify-center mb-4">
                <span className="text-3xl font-medium text-[#185FA5]">
                  {getInitials(profile.full_name)}
                </span>
              </div>
            )}
            <div className="text-center">
              <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(profile.role)}`}>
                {profile.role}
              </div>
              <p className="text-sm text-black/50 mt-2">{profile.job_title || profile.role}</p>
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-9">
          <div className="bg-[#111111] rounded-2xl p-6 h-full flex flex-col justify-center">
            <div className="text-xs text-[#A8A8A8] mb-1">
              {profile.full_name} · {profile.job_title || profile.role}
            </div>
            <p className="text-white/70 text-sm leading-relaxed">
              Team member at the business. Joined {new Date(profile.created_at).toLocaleDateString()}.
            </p>
          </div>
        </div>
      </div>

      {/* Focus Areas */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">Focus areas</span>
          <div className="w-px h-4 bg-black/10"></div>
          {profile.department && (
            <span className="inline-flex items-center gap-1.5 bg-[#F7F7F5] rounded-lg px-3 py-1.5 text-xs">
              <Building2 size={14} className="text-black/40" />
              {profile.department}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 bg-[#F7F7F5] rounded-lg px-3 py-1.5 text-xs">
            <Users size={14} className="text-black/40" />
            Team member
          </span>
        </div>
      </div>

      {/* Role History + Access */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        {/* Role History */}
        <div className="col-span-12 md:col-span-6">
          <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">{profile.job_title || profile.role}</span>
              <span className="text-xs bg-[#F7F7F5] rounded-lg px-2 py-1 text-black/50">2024 – now</span>
            </div>
            <p className="text-xs text-black/50 mb-3">CRM workspace</p>
            <div className="border-t border-black/5 pt-3 space-y-2">
              {roleHistory[0]?.achievements.map((achievement, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-black/30">•</span>
                  <span className="text-black/70">{achievement}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Workspace Access */}
        <div className="col-span-12 md:col-span-6">
          <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <div className="text-sm font-medium mb-3">Workspace access</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#3B82F6]"></div>
                  <span className="text-sm">CRM</span>
                </div>
                <span className="text-xs text-black/50">Full access</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10B981]"></div>
                  <span className="text-sm">Finance</span>
                </div>
                <span className="text-xs text-black/50">View only</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#F59E0B]"></div>
                  <span className="text-sm">Projects</span>
                </div>
                <span className="text-xs text-black/50">No access</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links + Details */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 md:col-span-6">
          <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <div className="text-sm font-medium mb-3">Quick links</div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link 
                to={`/app/crm?owner=${profile.id}`}
                className="inline-flex items-center gap-1.5 bg-[#F7F7F5] rounded-lg px-3 py-1.5 text-xs hover:bg-black/5"
              >
                <Target size={14} className="text-black/40" />
                View deals
              </Link>
              <Link 
                to={`/app/tasks?assignee=${profile.id}`}
                className="inline-flex items-center gap-1.5 bg-[#F7F7F5] rounded-lg px-3 py-1.5 text-xs hover:bg-black/5"
              >
                <Calendar size={14} className="text-black/40" />
                View tasks
              </Link>
              <button className="inline-flex items-center gap-1.5 bg-[#F7F7F5] rounded-lg px-3 py-1.5 text-xs hover:bg-black/5">
                <MessageCircle size={14} className="text-black/40" />
                Message
              </button>
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-6">
          <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <div className="text-sm font-medium mb-3">Details</div>
            <div className="flex items-center gap-2 flex-wrap">
              {profile.email && (
                <a 
                  href={`mailto:${profile.email}`}
                  className="inline-flex items-center gap-1.5 bg-[#F7F7F5] rounded-lg px-3 py-1.5 text-xs hover:bg-black/5"
                >
                  <Mail size={14} className="text-black/40" />
                  {profile.email}
                </a>
              )}
              {profile.phone && (
                <a 
                  href={`tel:${profile.phone}`}
                  className="inline-flex items-center gap-1.5 bg-[#F7F7F5] rounded-lg px-3 py-1.5 text-xs hover:bg-black/5"
                >
                  <Phone size={14} className="text-black/40" />
                  {profile.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
