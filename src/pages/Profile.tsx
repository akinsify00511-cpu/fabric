import { useState, useEffect, type FormEvent, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useWorkspaceSelection } from '../lib/useWorkspaceSelection'
import { TOOLS } from '../lib/useToolAccess'
import { roleLabel } from '../lib/roleHomeConfig'
import { deriveFunction, functionLabel, deriveSeniority, seniorityLabel } from '../lib/functionHome'
import { Camera, Loader2, Trash2, AlertTriangle, Briefcase, Check, X } from 'lucide-react'

export default function Profile() {
  const navigate = useNavigate()
  const { staff, refreshStaff, signOut } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { selectedTools, toggleTool, selectionCompleted } = useWorkspaceSelection()

  const [activeTab, setActiveTab] = useState<'profile' | 'tools' | 'security'>('profile')
  
  // Profile state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  // Personal / humanizing fields — feed HR, People, and the Company Wall
  // (birthdays). date_of_birth already exists on the staff table.
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [bio, setBio] = useState('')
  const [hobbies, setHobbies] = useState('')
  const [location, setLocation] = useState('')
  const [emergencyContact, setEmergencyContact] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)

  // Security state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [securityLoading, setSecurityLoading] = useState(false)
  const [securityError, setSecurityError] = useState<string | null>(null)
  const [securitySuccess, setSecuritySuccess] = useState(false)

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  useEffect(() => {
    if (staff) {
      setFullName(staff.full_name || staff.name || '')
      setEmail(staff.user?.email || '')
      setPhone(staff.phone || '')
      setJobTitle(staff.job_title || '')
      setDepartment(staff.department || '')
      setAvatarUrl(staff.avatar_url || null)
      setDateOfBirth(staff.date_of_birth || '')
      setPronouns(staff.pronouns || '')
      setBio(staff.bio || '')
      setHobbies(staff.hobbies || '')
      setLocation(staff.location || '')
      setEmergencyContact(staff.emergency_contact || '')
    }
  }, [staff])

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !staff?.user_id) return

    setUploadingAvatar(true)
    setProfileError(null)

    const fileExt = file.name.split('.').pop()
    const fileName = `${staff.user_id}-${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      console.error('Avatar upload error:', uploadError)
      setProfileError('Failed to upload avatar')
      setUploadingAvatar(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName)

    const { error: updateError } = await supabase
      .from('staff')
      .update({ avatar_url: publicUrl })
      .eq('id', staff.id)

    if (updateError) {
      console.error('Failed to update avatar URL:', updateError)
      setProfileError('Failed to save avatar')
    } else {
      setAvatarUrl(publicUrl)
      await refreshStaff()
    }

    setUploadingAvatar(false)
  }

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setProfileLoading(true)
    setProfileError(null)
    setProfileSuccess(false)

    if (!staff?.id) return

    const { error: updateError } = await supabase
      .from('staff')
      .update({
        full_name: fullName,
        phone,
        job_title: jobTitle || null,
        department: department || null,
        date_of_birth: dateOfBirth || null,
        pronouns: pronouns || null,
        bio: bio || null,
        hobbies: hobbies || null,
        location: location || null,
        emergency_contact: emergencyContact || null,
      })
      .eq('id', staff.id)

    if (updateError) {
      setProfileError(updateError.message)
      setProfileLoading(false)
      return
    }

    const { error: authError } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    })

    if (authError) {
      console.error('Auth update error:', authError)
    }

    await refreshStaff()
    setProfileSuccess(true)
    setProfileLoading(false)
    setTimeout(() => setProfileSuccess(false), 3000)
  }

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault()
    setSecurityError(null)

    if (newPassword.length < 8) {
      setSecurityError('Password must be at least 8 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setSecurityError('Passwords do not match')
      return
    }

    setSecurityLoading(true)

    // Re-authenticate user before changing password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })

    if (signInError) {
      setSecurityError('Current password is incorrect')
      setSecurityLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      setSecurityError(error.message)
    } else {
      setSecuritySuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSecuritySuccess(false), 3000)
    }

    setSecurityLoading(false)
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return

    if (!confirm('This will permanently delete your account and all associated data. This action cannot be undone.')) {
      return
    }

    setDeletingAccount(true)

    try {
      // Delete staff record first
      if (staff?.id) {
        await supabase.from('staff').delete().eq('id', staff.id)
      }

      // Delete auth user
      const { error } = await supabase.auth.admin.deleteUser(staff?.user_id || '')
      
      if (error) {
        console.error('Failed to delete user:', error)
        setProfileError('Failed to delete account. Please contact support.')
        setDeletingAccount(false)
        return
      }

      await signOut()
      navigate('/')
    } catch (err) {
      console.error('Delete account error:', err)
      setProfileError('Failed to delete account. Please contact support.')
      setDeletingAccount(false)
    }
  }

  return (
    <div className="pb-20">
      <div className="flex items-center gap-3 mb-6">
        <button 
          onClick={() => navigate('/app/settings')}
          className="text-black hover:text-black"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-medium text-black">Account Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-black/[0.06] mb-6 w-fit">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'profile'
              ? 'bg-[var(--av-primary)] text-white'
              : 'text-black hover:text-black'
          }`}
        >
          Profile
        </button>
        <button
          onClick={() => setActiveTab('tools')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'tools'
              ? 'bg-[var(--av-primary)] text-white'
              : 'text-black hover:text-black'
          }`}
        >
          Role & Tools
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'security'
              ? 'bg-[var(--av-primary)] text-white'
              : 'text-black hover:text-black'
          }`}
        >
          Security
        </button>
      </div>

      {activeTab === 'profile' && (
        <>
          {/* Avatar Section */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6 mb-6">
            <div className="flex items-center gap-6">
              <div className="relative">
                {avatarUrl ? (
                  <img 
                    src={avatarUrl} 
                    alt={fullName}
                    className="w-24 h-24 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full avenize-gradient flex items-center justify-center text-white text-3xl font-bold">
                    {fullName?.charAt(0) || '?'}
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full shadow-sm flex items-center justify-center hover:bg-black/10 transition"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                  ) : (
                    <Camera className="w-4 h-4 text-black" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{fullName || 'Your Name'}</h3>
                <p className="text-sm text-black">{email}</p>
                <p className="text-xs text-black mt-1">JPG, PNG or GIF. Max 2MB.</p>
              </div>
            </div>
          </div>

          {/* Profile Form */}
          <form onSubmit={handleProfileSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-6 space-y-5">
            {profileError && (
              <div className="bg-[var(--av-danger-soft)] border border-[var(--av-danger)]/30 text-[var(--av-danger)] rounded-lg px-4 py-3 text-sm">
                {profileError}
              </div>
            )}

            {profileSuccess && (
              <div className="bg-[var(--av-success-soft)] border border-[var(--av-success)]/30 text-[var(--av-success)] rounded-lg px-4 py-3 text-sm">
                Profile updated successfully!
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/30"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm bg-black/[0.02] text-black cursor-not-allowed"
              />
              <p className="text-xs text-black mt-1">Email cannot be changed here</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/30"
                placeholder="+234..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">
                Job Title
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/30"
                placeholder="e.g. Sales Manager"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">
                Department
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/30"
                placeholder="e.g. Sales, Operations, Finance"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-black/70 mb-1.5">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/30"
                />
                <p className="text-xs text-black mt-1">Shown on the Company Wall for birthdays.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-black/70 mb-1.5">
                  Pronouns
                </label>
                <input
                  type="text"
                  value={pronouns}
                  onChange={(e) => setPronouns(e.target.value)}
                  className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/30"
                  placeholder="e.g. she/her, he/him, they/them"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/30"
                placeholder="e.g. Lagos, Nigeria"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">
                About You
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/30 resize-none"
                placeholder="A short intro — who you are and what you do at the company."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">
                Hobbies & Interests
              </label>
              <input
                type="text"
                value={hobbies}
                onChange={(e) => setHobbies(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/30"
                placeholder="e.g. Football, reading, travel"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">
                Emergency Contact
              </label>
              <input
                type="text"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/30"
                placeholder="Name and phone number"
              />
              <p className="text-xs text-black mt-1">Visible to HR / admins only.</p>
            </div>

            <button
              type="submit"
              disabled={profileLoading}
              className="w-full rounded-lg bg-[var(--av-primary)] text-white py-3 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {profileLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </span>
              ) : (
                'Save Changes'
              )}
            </button>
          </form>

          {/* OAuth Account Info */}
          {staff?.user?.app_metadata?.provider && (
            <div className="mt-6 bg-black/[0.02] rounded-xl p-4">
              <p className="text-xs text-black">
                Signed up with: <span className="capitalize font-medium">{staff.user.app_metadata.provider}</span>
              </p>
            </div>
          )}
        </>
      )}

      {activeTab === 'tools' && staff && (
        <RoleAndToolsSection
          staff={staff}
          selectedTools={selectedTools}
          toggleTool={toggleTool}
          selectionCompleted={selectionCompleted}
        />
      )}

      {activeTab === 'security' && (
        <>
          {/* Change Password */}
          <form onSubmit={handlePasswordChange} className="bg-white rounded-2xl border border-black/[0.06] p-6 mb-6 space-y-5">
            <h3 className="font-semibold">Change Password</h3>
            
            {securityError && (
              <div className="bg-[var(--av-danger-soft)] border border-[var(--av-danger)]/30 text-[var(--av-danger)] rounded-lg px-4 py-3 text-sm">
                {securityError}
              </div>
            )}

            {securitySuccess && (
              <div className="bg-[var(--av-success-soft)] border border-[var(--av-success)]/30 text-[var(--av-success)] rounded-lg px-4 py-3 text-sm">
                Password updated successfully!
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/30"
                placeholder="Enter current password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-black/10 px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/30"
                  placeholder="Min. 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-black hover:text-black"
                >
                  {showNewPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/30"
                placeholder="Re-enter new password"
              />
            </div>

            <button
              type="submit"
              disabled={securityLoading || !currentPassword || !newPassword || !confirmPassword}
              className="w-full rounded-lg bg-[var(--av-primary)] text-white py-3 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {securityLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating...
                </span>
              ) : (
                'Update Password'
              )}
            </button>
          </form>

          {/* Delete Account */}
          <div className="bg-white rounded-2xl border border-[var(--av-danger)]/30 p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-[var(--av-danger-soft)] flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-[var(--av-danger)]" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-[var(--av-danger)]">Delete Account</h3>
                <p className="text-sm text-black/60 mt-1">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="mt-4 px-4 py-2 rounded-lg border border-[var(--av-danger)]/30 text-[var(--av-danger)] text-sm font-medium hover:bg-[var(--av-danger-soft)] transition"
                  >
                    Delete Account
                  </button>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="p-3 bg-[var(--av-danger-soft)] rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-[var(--av-danger)] mt-0.5" />
                        <p className="text-xs text-[var(--av-danger)]">
                          Type <strong>DELETE</strong> to confirm. This will remove all your data permanently.
                        </p>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE to confirm"
                      className="w-full rounded-lg border border-[var(--av-danger)]/30 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowDeleteConfirm(false)
                          setDeleteConfirmText('')
                        }}
                        className="flex-1 py-2 rounded-lg border border-black/10 text-sm font-medium hover:bg-black/10"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                        className="flex-1 py-2 rounded-lg bg-[var(--av-danger)] text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deletingAccount ? 'Deleting...' : 'Delete Forever'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Role & Tools section — surfaces the user's role, derived function, and
// the tools they use vs. have hidden. Lets the user adjust their workspace
// (the same toggle as WorkspaceSettings, surfaced here as a personal pref).
function RoleAndToolsSection({
  staff, selectedTools, toggleTool, selectionCompleted,
}: {
  staff: any
  selectedTools: string[]
  toggleTool: (tool: string) => Promise<void>
  selectionCompleted: boolean
}) {
  const role = staff.active_role ?? staff.role ?? 'staff'
  const fn = deriveFunction(staff.job_title, staff.department, selectedTools)
  const sen = deriveSeniority(role)
  const curated = selectionCompleted && selectedTools.length > 0

  // A tool is "used" (kept visible) when the user hasn't curated, OR curated
  // and kept it. "Hidden" = curated and removed it.
  const isUsed = (key: string) => !curated || selectedTools.includes(key)

  return (
    <div className="space-y-6">
      {/* Role + function summary */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--av-primary-soft, rgba(66,133,244,0.1))' }}>
            <Briefcase size={22} style={{ color: 'var(--av-primary)' }} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg" style={{ color: 'var(--av-text)' }}>Your role</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--av-text-secondary)' }}>
              {roleLabel(role)}{seniorityLabel(sen) ? ` · ${seniorityLabel(sen)}` : ''} — {functionLabel(fn)} window
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--av-text-muted)' }}>
              {staff.job_title || 'No job title set'}{staff.department ? ` · ${staff.department}` : ''}
            </p>
            <p className="text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--av-text-muted)' }}>
              Your home adapts to this role. Update your job title or department above to change which function Avenize emphasizes.
            </p>
          </div>
        </div>
      </div>

      {/* Tools you use / have hidden */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-lg" style={{ color: 'var(--av-text)' }}>Your tools</h3>
          <span className="text-xs px-2 py-1 rounded-md" style={{ background: 'var(--av-surface-2, #F1F3F4)', color: 'var(--av-text-secondary)' }}>
            {curated ? `${selectedTools.length} shown` : 'All shown (not curated)'}
          </span>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--av-text-secondary)' }}>
          {curated
            ? "Tools you keep visible vs. ones you've hidden from your workspace."
            : "You're seeing every tool you're authorized for. Turn one off to declutter your workspace."}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TOOLS.map(tool => {
            const used = isUsed(tool.key)
            return (
              <button
                key={tool.key}
                onClick={() => toggleTool(tool.key)}
                className="flex items-center gap-3 p-3 rounded-xl text-left transition"
                style={used
                  ? { background: 'var(--av-surface-2, #F1F3F4)', border: '1px solid var(--av-border, #E8EAED)' }
                  : { background: 'transparent', border: '1px solid var(--av-border, #E8EAED)', opacity: 0.6 }}
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: used ? 'var(--av-success, #34A853)' : 'var(--av-text-disabled, #DADCE0)' }}>
                  {used ? <Check size={13} className="text-white" /> : <X size={13} className="text-white" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium" style={{ color: 'var(--av-text)' }}>{tool.label}</span>
                  <span className="block text-[11px] truncate" style={{ color: 'var(--av-text-muted)' }}>{tool.description}</span>
                </span>
                <span className="text-[10px] uppercase tracking-wide font-medium" style={{ color: used ? 'var(--av-success, #34A853)' : 'var(--av-text-muted)' }}>
                  {used ? 'Using' : 'Hidden'}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] mt-4" style={{ color: 'var(--av-text-muted)' }}>
          Hiding a tool removes it from your sidebar and dashboard — it doesn't revoke access. You can still reach any tool by URL.
        </p>
      </div>
    </div>
  )
}
