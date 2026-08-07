// ============================================
// STAFF PROFILE PAGE
// Clean design matching Avenize design system
// ============================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { 
  Mail, Phone, MapPin, Building2, User, 
  Target, CheckCircle, MessageCircle, RefreshCw
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

interface WorkspaceAccess {
  name: string
  color: string
  access: 'Full access' | 'View only' | 'No access'
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
      default: return 'bg-slate-700 text-black'
    }
  }

  // Role history data
  const roleHistory: RoleHistory[] = profile ? [
    {
      title: profile.job_title || 'Team member',
      period: '2024 – now',
      workspace: 'CRM workspace',
      achievements: [
        `Closed ₦18M in new business`,
        `Top performer, Q3 2023`,
        `Promoted to ${profile.job_title || profile.role}, Jan 2024`
      ]
    },
    {
      title: 'Sales representative',
      period: '2023 – 2024',
      workspace: 'CRM workspace',
      achievements: [
        `Closed ₦12M in new business`,
        `Rookie of the year`
      ]
    }
  ] : []

  // Workspace access data
  const workspaceAccess: WorkspaceAccess[] = [
    { name: 'CRM', color: '#3B82F6', access: 'Full access' },
    { name: 'Finance', color: '#10B981', access: 'View only' },
    { name: 'Projects', color: '#F59E0B', access: 'No access' },
  ]

  // Quick links
  const quickLinks = profile ? [
    { icon: Target, label: 'View deals', href: `/app/crm?owner=${profile.id}` },
    { icon: CheckCircle, label: 'View tasks', href: `/app/tasks?assignee=${profile.id}` },
    { icon: MessageCircle, label: 'Message', href: `/app/chat?to=${profile.id}` },
  ] : []

  // Focus areas
  const focusAreas = profile?.department ? [
    { icon: Building2, label: profile.department },
    { icon: User, label: 'Team member' },
  ] : [
    { icon: User, label: 'Team member' },
  ]

  if (loading) {
    return (
      <div className="pb-20">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-black/10 rounded-2xl"></div>
          <div className="h-48 bg-black/10 rounded-2xl"></div>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="pb-20">
        <div className="bg-white rounded-2xl border border-black/[0.06] p-8 text-center">
          <p className="text-black">Profile not found</p>
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
      {/* Topbar */}
      <div className="flex items-center gap-2.5 px-8 py-4 bg-white border-b border-black/[0.05]">
        <svg width="22" height="22" viewBox="0 0 1254 1254" aria-hidden="true" fill="#111111">
          <path d="M613.7 269.1c-36.4 3.9-70.6 23.9-91.9 53.6-3 4.3-31.8 55.5-63.9 113.8-32 58.3-62.3 113.2-67.1 122-39.2 71.1-34.9 137 11.5 177.3 11.2 9.7 36.3 23 38.7 20.5 1.1-1 97.6-176.1 121-219.3 3.1-5.8 12.1-22.2 20-36.5s18.1-32.9 22.7-41.4c10.9-20.1 15.7-27.3 23.2-35.4 30.8-32.9 80.2-40.8 124.9-20.1 8.8 4 25.4 14.9 29.6 19.3 1.7 1.7 3.4 3.1 3.9 3.1 1.1 0-42.1-85-48.5-95.3-26.3-42.8-74.8-66.8-124.1-61.6"/>
          <path d="M696 416.6c-22.5 3.4-37.8 11-51.6 25.5-6.9 7.4-14.4 18.3-14.4 21.1 0 .8 5.5 10.4 12.1 21.4 21.1 34.6 98.1 163.2 110.9 185 69.7 118.8 71.4 121.9 76.5 136.6 6.5 18.8 7.4 43.4 2.1 61.3-11.1 37.5-40.2 67.2-76.4 78.1-4.8 1.4-9.3 2.8-10.1 3-.8.3-1.2.5-1 .7.2.1 35.7 0 78.9-.3l78.5-.6 9.5-2.6c47.3-12.9 78.8-45.8 86.5-90.2 4.8-27.9-1.6-55.5-20.2-87.2-7.8-13.1-20.1-34.6-77.3-134.4-86.8-151.4-82.7-144.4-92.8-159-22.5-32.4-56.2-54.1-90.1-58-8.4-1-16.1-1.1-21.1-.4"/>
          <path d="M339.9 647.2c-1.2 2.4-16.1 29.3-33.2 59.8-39.8 71.2-44.2 80.6-49.2 104.5-13.2 63.8 27.5 122.9 93.4 135.5 10.5 2 13.4 2.1 61.8 1.7 77.6-.6 69.4 2.1 184.8-61.4 33-18.1 90.2-49.3 127-69.3 36.9-20 67.4-36.6 67.8-37 1.1-.9-35.1-62.9-40.2-69-19.7-23.4-62.3-28.2-102.6-11.5-9.8 4-12.4 5.3-55 28.8-91.9 50.6-90 49.7-110.4 53.1-74.3 12.5-141.2-46.1-141.5-124.1-.1-8.4-.2-15.3-.3-15.3-.2 0-1.2 1.9-2.4 4.2"/>
        </svg>
        <span className="text-sm font-semibold">Avenize</span>
        <span className="text-[13px] text-[#888780]">/ People / {profile.full_name}</span>
      </div>

      <div className="max-w-[900px] mx-auto px-6 py-8">
        {/* Header Grid: Avatar + Bio */}
        <div className="grid grid-cols-[128px_1fr] gap-4 mb-3">
          {/* Avatar */}
          <div className="w-32 h-32 rounded-2xl bg-[#E6F1FB] flex items-center justify-center overflow-hidden">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[56px] font-medium text-[#185FA5]">
                {getInitials(profile.full_name)}
              </span>
            )}
          </div>

          {/* Bio Card */}
          <div className="bg-[#111111] rounded-2xl p-4 flex flex-col justify-center">
            <div className="text-[12px] text-[#A8A8A8] mb-1.5">
              {profile.full_name} · {profile.job_title || profile.role}
            </div>
            <p className="text-[15px] leading-relaxed text-white/80">
              Team member at the business. Joined {new Date(profile.created_at).toLocaleDateString()}.
            </p>
          </div>
        </div>

        {/* Focus Areas */}
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-3">
          <div className="flex items-center gap-3.5 flex-wrap">
            <span className="text-[14px] font-medium">Focus areas</span>
            <div className="w-px h-5 bg-[#E8E8E8]"></div>
            {focusAreas.map((area, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 bg-[#F7F7F5] rounded-lg px-3 py-1.5 text-[13px]">
                <area.icon size={14} className="text-black" />
                {area.label}
              </span>
            ))}
          </div>
        </div>

        {/* Role History - Two Up */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {roleHistory.map((role, i) => (
            <div key={i} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[16px] font-medium">{role.title}</span>
                <span className="text-[11px] bg-[#F7F7F5] rounded-lg px-2.5 py-1 text-black">
                  {role.period}
                </span>
              </div>
              <p className="text-[12px] text-black mb-2.5">{role.workspace}</p>
              <div className="border-t border-black/[0.05] pt-2.5 space-y-1.5">
                {role.achievements.map((achievement, j) => (
                  <div key={j} className="flex items-start gap-2 text-[13px]">
                    <span className="text-black">•</span>
                    <span className="text-black/70">{achievement}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Workspace Access + This Quarter - Two Up */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Workspace Access */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <div className="text-[14px] font-medium mb-3">Workspace access</div>
            <div className="space-y-2">
              {workspaceAccess.map((ws, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: ws.color }}
                    />
                    <span className="text-[13px]">{ws.name}</span>
                  </div>
                  <span className="text-[11px] text-black">{ws.access}</span>
                </div>
              ))}
            </div>
          </div>

          {/* This Quarter */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <div className="text-[14px] font-medium mb-3">This quarter</div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <div className="text-[20px] font-medium">14</div>
                <div className="text-[11px] text-black">Deals closed</div>
              </div>
              <div>
                <div className="text-[20px] font-medium">112%</div>
                <div className="text-[11px] text-[#639922]">Of quota</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-3">
          <div className="flex items-center gap-3.5 flex-wrap">
            <span className="text-[14px] font-medium">Quick links</span>
            <div className="w-px h-5 bg-[#E8E8E8]"></div>
            {quickLinks.map((link, i) => (
              <Link 
                key={i}
                to={link.href}
                className="inline-flex items-center gap-1.5 bg-[#F7F7F5] rounded-lg px-3 py-1.5 text-[13px] hover:bg-[#E8E8E8] transition-colors"
              >
                <link.icon size={14} className="text-black" />
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-3.5 flex-wrap">
            <span className="text-[14px] font-medium">Details</span>
            <div className="w-px h-5 bg-[#E8E8E8]"></div>
            {profile.email && (
              <a 
                href={`mailto:${profile.email}`}
                className="inline-flex items-center gap-1.5 bg-[#F7F7F5] rounded-lg px-3 py-1.5 text-[13px] hover:bg-[#E8E8E8] transition-colors"
              >
                <Mail size={14} className="text-black" />
                {profile.email}
              </a>
            )}
            {profile.phone && (
              <a 
                href={`tel:${profile.phone}`}
                className="inline-flex items-center gap-1.5 bg-[#F7F7F5] rounded-lg px-3 py-1.5 text-[13px] hover:bg-[#E8E8E8] transition-colors"
              >
                <Phone size={14} className="text-black" />
                {profile.phone}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
