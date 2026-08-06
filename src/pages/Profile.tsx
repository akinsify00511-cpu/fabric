import { useState, useEffect, type FormEvent, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Camera, Loader2, Trash2, AlertTriangle } from 'lucide-react'

export default function Profile() {
  const navigate = useNavigate()
  const { staff, refreshStaff, signOut } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile')
  
  // Profile state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
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
      setJobTitle((staff as any).job_title || '')
      setDepartment((staff as any).department || '')
      setAvatarUrl(staff.avatar_url || null)
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
          className="text-black/50 hover:text-black"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-medium text-[var(--avenize-black)]">Account Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-black/[0.06] mb-6 w-fit">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'profile'
              ? 'avenize-gradient text-white'
              : 'text-black/50 hover:text-black'
          }`}
        >
          Profile
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'security'
              ? 'avenize-gradient text-white'
              : 'text-black/50 hover:text-black'
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
                  className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full border border-black/10 shadow-sm flex items-center justify-center hover:bg-black/5 transition"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="w-4 h-4 animate-spin text-black/50" />
                  ) : (
                    <Camera className="w-4 h-4 text-black/50" />
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
                <p className="text-sm text-black/50">{email}</p>
                <p className="text-xs text-black/30 mt-1">JPG, PNG or GIF. Max 2MB.</p>
              </div>
            </div>
          </div>

          {/* Profile Form */}
          <form onSubmit={handleProfileSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-6 space-y-5">
            {profileError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {profileError}
              </div>
            )}

            {profileSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
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
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
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
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm bg-black/[0.02] text-black/50 cursor-not-allowed"
              />
              <p className="text-xs text-black/40 mt-1">Email cannot be changed here</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
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
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
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
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
                placeholder="e.g. Sales, Operations, Finance"
              />
            </div>

            <button
              type="submit"
              disabled={profileLoading}
              className="w-full rounded-lg avenize-gradient text-white py-3 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
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
              <p className="text-xs text-black/50">
                Signed up with: <span className="capitalize font-medium">{staff.user.app_metadata.provider}</span>
              </p>
            </div>
          )}
        </>
      )}

      {activeTab === 'security' && (
        <>
          {/* Change Password */}
          <form onSubmit={handlePasswordChange} className="bg-white rounded-2xl border border-black/[0.06] p-6 mb-6 space-y-5">
            <h3 className="font-semibold">Change Password</h3>
            
            {securityError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {securityError}
              </div>
            )}

            {securitySuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
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
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
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
                  className="w-full rounded-lg border border-black/10 px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
                  placeholder="Min. 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/50"
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
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
                placeholder="Re-enter new password"
              />
            </div>

            <button
              type="submit"
              disabled={securityLoading || !currentPassword || !newPassword || !confirmPassword}
              className="w-full rounded-lg avenize-gradient text-white py-3 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
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
          <div className="bg-white rounded-2xl border border-red-200 p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-700">Delete Account</h3>
                <p className="text-sm text-black/60 mt-1">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="mt-4 px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition"
                  >
                    Delete Account
                  </button>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="p-3 bg-red-50 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
                        <p className="text-xs text-red-700">
                          Type <strong>DELETE</strong> to confirm. This will remove all your data permanently.
                        </p>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE to confirm"
                      className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowDeleteConfirm(false)
                          setDeleteConfirmText('')
                        }}
                        className="flex-1 py-2 rounded-lg border border-black/10 text-sm font-medium hover:bg-black/[0.02]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                        className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
