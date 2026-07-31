import { useAuth } from '../lib/AuthContext'

export default function Settings() {
  const { staff } = useAuth()

  return (
    <div>
      <h1 className="text-xl font-medium text-[var(--avenize-black)] mb-6">Settings</h1>
      <div className="bg-white rounded-2xl border border-black/[0.06] p-5 max-w-md space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-black/50">Name</span>
          <span className="text-[var(--avenize-black)]">{staff?.full_name ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black/50">Role</span>
          <span className="text-[var(--avenize-black)] capitalize">{staff?.role ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black/50">Job title</span>
          <span className="text-[var(--avenize-black)]">{staff?.job_title ?? '—'}</span>
        </div>
      </div>
      <p className="text-xs text-black/40 mt-4">
        Branding, module toggles, and billing settings land in a later build phase.
      </p>
    </div>
  )
}
