import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import type { LeaveRequest } from '../lib/types'

type StaffRow = {
  id: string
  full_name: string
  role: string
  job_title: string | null
  active: boolean
}

export default function People() {
  const { staff } = useAuth()
  const [staffList, setStaffList] = useState<StaffRow[]>([])
  const [leave, setLeave] = useState<LeaveRequest[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'manager' | 'staff'>('staff')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = async () => {
    const [{ data: s }, { data: l }] = await Promise.all([
      supabase.from('staff').select('id, full_name, role, job_title, active').order('full_name'),
      supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),
    ])
    setStaffList((s as StaffRow[]) ?? [])
    setLeave((l as LeaveRequest[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  const requestLeave = async () => {
    if (!startDate || !endDate || !staff) return
    await supabase.from('leave_requests').insert({
      staff_id: staff.id,
      start_date: startDate,
      end_date: endDate,
      reason,
    })
    setStartDate('')
    setEndDate('')
    setReason('')
    load()
  }

  const decide = async (id: string, status: LeaveRequest['status']) => {
    await supabase.from('leave_requests').update({ status, approved_by: staff?.id }).eq('id', id)
    load()
  }

  const createInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviteError(null)
    setCopied(false)
    const { data, error } = await supabase.rpc('create_invite', {
      invite_email: inviteEmail,
      invite_role: inviteRole,
    })
    if (error) {
      setInviteError(error.message)
      return
    }
    setInviteLink(`${window.location.origin}/join/${data}`)
    setInviteEmail('')
  }

  const copyLink = async () => {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
  }

  const canApprove = staff?.role === 'owner' || staff?.role === 'manager'
  const canInvite = canApprove

  return (
    <div>
      <h1 className="text-xl font-medium text-[var(--fabric-black)] mb-6">People</h1>

      {canInvite && (
        <>
          <h2 className="text-sm font-medium text-black/60 mb-3">Invite a teammate</h2>
          <div className="bg-white rounded-2xl border border-black/5 p-4 mb-10 space-y-3">
            <div className="flex flex-wrap gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Their email"
                className="flex-1 min-w-40 rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'manager' | 'staff')}
                className="rounded-lg border border-black/10 px-3 py-2 text-sm"
              >
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
              <button onClick={createInvite} className="rounded-lg bg-[var(--fabric-black)] text-white px-4 py-2 text-sm">
                Generate link
              </button>
            </div>
            {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
            {inviteLink && (
              <div className="flex items-center gap-2 bg-black/[0.03] rounded-lg px-3 py-2">
                <span className="flex-1 text-xs text-black/50 truncate">{inviteLink}</span>
                <button onClick={copyLink} className="text-xs text-[#4F46E5] font-medium shrink-0">
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
            <p className="text-xs text-black/40">
              No email is sent automatically yet — copy this link and share it directly (WhatsApp, email, etc).
              Expires in 7 days.
            </p>
          </div>
        </>
      )}

      <h2 className="text-sm font-medium text-black/60 mb-3">Staff</h2>
      <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5 mb-10">
        {staffList.map((s) => (
          <div key={s.id} className="px-4 py-3 flex justify-between text-sm">
            <span className="text-[var(--fabric-black)]">{s.full_name}</span>
            <span className="text-black/40">
              {s.job_title ?? s.role} {!s.active && '· inactive'}
            </span>
          </div>
        ))}
        {staffList.length === 0 && <p className="px-4 py-3 text-sm text-black/40">No staff yet.</p>}
      </div>

      <h2 className="text-sm font-medium text-black/60 mb-3">Request leave</h2>
      <div className="flex flex-wrap gap-2 mb-6">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-lg border border-black/10 px-3 py-2 text-sm" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-lg border border-black/10 px-3 py-2 text-sm" />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
          className="flex-1 min-w-40 rounded-lg border border-black/10 px-3 py-2 text-sm"
        />
        <button onClick={requestLeave} className="rounded-lg bg-[var(--fabric-black)] text-white px-4 py-2 text-sm">
          Submit
        </button>
      </div>

      <h2 className="text-sm font-medium text-black/60 mb-3">Leave requests</h2>
      <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5">
        {leave.map((l) => (
          <div key={l.id} className="px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-[var(--fabric-black)]">
              {l.start_date} → {l.end_date} {l.reason && `· ${l.reason}`}
            </span>
            {canApprove && l.status === 'pending' ? (
              <div className="flex gap-2">
                <button onClick={() => decide(l.id, 'approved')} className="text-xs text-green-700">
                  Approve
                </button>
                <button onClick={() => decide(l.id, 'rejected')} className="text-xs text-red-600">
                  Reject
                </button>
              </div>
            ) : (
              <span className="text-xs text-black/40">{l.status}</span>
            )}
          </div>
        ))}
        {leave.length === 0 && <p className="px-4 py-3 text-sm text-black/40">No leave requests yet.</p>}
      </div>
    </div>
  )
}
