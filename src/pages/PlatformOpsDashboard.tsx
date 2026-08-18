// Riverwayse Platform Operations Dashboard
//
// A SEPARATE system from Owner Intelligence (#18). Owner Intelligence answers
// "is THIS business healthy" for one tenant. This answers "is THE PLATFORM
// working, right now, for everyone" across all tenants.
//
// Audience: Riverwayse on-call, NOT business owners. Sits behind the
// is_platform_admin() boundary (migration 20260101000012) — the platform-owner
// authorization boundary is the prerequisite the scope flagged, and it exists.
// A business owner/admin is NOT a platform admin and gets an "unauthorized"
// screen. The RPC gate is the real boundary; the client check is UX-only.
//
// Privacy boundary (critical): ops visibility is NOT data access. Defaults to
// aggregate + structural (error counts, which endpoint, which integration) —
// not customer PII, invoice contents, or business financials. Drilling into a
// specific tenant's data to investigate an incident is a separate, explicit,
// AUDIT-LOGGED action (investigate_business_incident).
//
// Realtime: subscribes to inserts on platform_error_events + platform_incidents
// — no polling. Per-mount channel name (avoids the cached-channel subscribe crash).

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import {
  fetchPlatformOps, resolvePlatformError, updatePlatformIncident,
  type PlatformOps,
} from '../lib/businessOS'
import { supabase } from '../lib/supabase'
import { ClaimTag } from '../components/Evidence'
import {
  Loader2, Lock, Activity, AlertTriangle, CheckCircle2, XCircle,
  Server, Zap, ShieldAlert, Bell, RefreshCw, ExternalLink,
} from 'lucide-react'

const SYSTEM_LABELS: Record<string, string> = {
  auth: 'Auth',
  database: 'Database',
  payments: 'Payments',
  notifications: 'Notifications',
  automations: 'Automations',
  onboarding: 'Onboarding',
}

function statusColor(status: string): string {
  switch (status) {
    case 'healthy': return '#157342'
    case 'degraded': return '#845400'
    case 'down': return '#A63A2F'
    default: return '#5F6368'
  }
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: 9999,
        background: statusColor(status),
        boxShadow: status === 'down' ? '0 0 0 3px rgba(166,58,47,0.18)' : 'none',
      }}
      aria-label={status}
    />
  )
}

export default function PlatformOpsDashboardPage() {
  const { session } = useAuth()
  const userEmail = session?.user?.email
  const [data, setData] = useState<PlatformOps | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterSeverity, setFilterSeverity] = useState<string>('all')
  const [livePulse, setLivePulse] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    try {
      const result = await fetchPlatformOps()
      if (!mountedRef.current) return
      setData(result)
      setError(null)
    } catch (e: unknown) {
      if (!mountedRef.current) return
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    load()

    // Realtime: per-mount random channel name (NotificationBell pattern).
    const suffix = Math.random().toString(36).slice(2)
    const channel = supabase
      .channel(`platform-ops:${suffix}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'platform_error_events' },
        () => { setLivePulse(true); load(); setTimeout(() => setLivePulse(false), 800) })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'platform_incidents' },
        () => { setLivePulse(true); load(); setTimeout(() => setLivePulse(false), 800) })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'platform_integration_status' },
        () => load())
      .subscribe()
    channelRef.current = channel

    return () => {
      mountedRef.current = false
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [load])

  const handleResolveError = async (errorId: string) => {
    try {
      await resolvePlatformError(errorId, 'Resolved from ops dashboard')
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    }
  }

  const handleIncidentAction = async (incidentId: string, status: string) => {
    try {
      await updatePlatformIncident({ incidentId, status, resolutionNotes: status === 'resolved' ? 'Resolved from ops dashboard' : undefined })
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  // Gate: non-platform-admins get the restricted screen (UX-only; RPC is the real boundary).
  if (data && !data.authorized) {
    return (
      <div style={{ maxWidth: 640, margin: '64px auto', padding: 24, textAlign: 'center' }}>
        <Lock style={{ width: 48, height: 48, color: '#9AA0A6', margin: '0 auto 16px' }} />
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#202124', marginBottom: 8 }}>
          Restricted — Platform operators only
        </h1>
        <p style={{ color: '#5F6368', lineHeight: 1.6 }}>
          This is the Riverwayse platform operations surface. It is not a business-owner
          feature. Access is granted via the platform-admin email allowlist
          (server-side), not a business role.
        </p>
        {userEmail && (
          <p style={{ marginTop: 16, fontSize: 13, color: '#9AA0A6' }}>
            Signed in as {userEmail}
          </p>
        )}
      </div>
    )
  }

  if (error && !data) {
    return (
      <div style={{ maxWidth: 640, margin: '64px auto', padding: 24 }}>
        <AlertTriangle style={{ color: '#A63A2F', marginBottom: 12 }} />
        <p style={{ color: '#5F6368' }}>
          Couldn't load platform ops data. The ops migration may not be applied to
          the live database yet. {error}
        </p>
        <button onClick={load} style={retryBtn}>Retry</button>
      </div>
    )
  }

  const systems = data?.systems ?? {}
  const integrations = data?.integrations ?? []
  const errors = (data?.recent_errors ?? []).filter(
    e => filterSeverity === 'all' || e.severity === filterSeverity
  )
  const openIncidents = data?.open_incidents ?? []
  const recentIncidents = data?.recent_incidents ?? []
  const counts = data?.error_counts

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#202124', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Server style={{ color: '#155BB4' }} />
            Platform Operations
          </h1>
          <p style={{ color: '#5F6368', marginTop: 4, fontSize: 14 }}>
            Is the app itself working, right now, for everyone.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: livePulse ? '#157342' : '#9AA0A6' }}>
            <span style={{ width: 8, height: 8, borderRadius: 9999, background: livePulse ? '#157342' : '#DADCE0', transition: 'background 200ms' }} />
            {livePulse ? 'Live' : 'Connected'}
          </span>
          <button onClick={load} style={iconBtn} title="Refresh">
            <RefreshCw style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>

      {/* Privacy boundary banner */}
      <div style={{ background: 'rgba(66,133,244,0.06)', border: '1px solid rgba(66,133,244,0.16)', borderRadius: 12, padding: 12, marginBottom: 20, fontSize: 13, color: '#5F6368' }}>
        <ClaimTag type="FACT" />
        <span style={{ marginLeft: 8 }}>
          Ops visibility is not data access. This shows error counts, endpoints, and
          integration health — never customer PII or business financials. Tenant
          drill-down is a separate, audit-logged action.
        </span>
      </div>

      {/* Live status strip — one glance, traffic-light per major system */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
        {Object.entries(SYSTEM_LABELS).map(([key, label]) => {
          const sys = systems[key] ?? { status: 'unknown' }
          return (
            <div key={key} style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#5F6368' }}>{label}</span>
                <StatusDot status={sys.status} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: statusColor(sys.status), textTransform: 'capitalize' }}>
                {sys.status}
              </div>
              {typeof sys.error_count_5m === 'number' && sys.error_count_5m > 0 && (
                <div style={{ fontSize: 12, color: '#9AA0A6', marginTop: 2 }}>
                  {sys.error_count_5m} errors / 5m
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Error counts summary */}
      {counts && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Last 5 min', value: counts.last_5m },
            { label: 'Last 1 hour', value: counts.last_1h },
            { label: 'Last 24 hours', value: counts.last_24h },
            { label: 'Unresolved', value: counts.unresolved },
          ].map(c => (
            <div key={c.label} style={{ background: '#fff', borderRadius: 12, padding: '12px 20px', boxShadow: '0 1px 2px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.06)', minWidth: 140 }}>
              <div style={{ fontSize: 13, color: '#5F6368' }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: c.value > 0 ? '#A63A2F' : '#202124' }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 20 }}>
        {/* Live error feed */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#202124', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity style={{ width: 18, height: 18, color: '#155BB4' }} />
              Live error feed
            </h2>
            <select
              value={filterSeverity}
              onChange={e => setFilterSeverity(e.target.value)}
              style={{ fontSize: 13, border: '1px solid #DADCE0', borderRadius: 8, padding: '4px 8px', background: '#fff', color: '#202124' }}
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
          {errors.length === 0 ? (
            <p style={{ color: '#9AA0A6', padding: '24px 0', textAlign: 'center' }}>
              No unresolved errors. Everything's quiet right now.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {errors.slice(0, 30).map(e => (
                <div key={e.id} style={{ border: '1px solid #E8EAED', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 9999,
                          background: e.severity === 'critical' ? 'rgba(166,58,47,0.1)' : e.severity === 'error' ? 'rgba(132,84,0,0.1)' : 'rgba(95,99,104,0.1)',
                          color: e.severity === 'critical' ? '#A63A2F' : e.severity === 'error' ? '#845400' : '#5F6368',
                        }}>{e.severity}</span>
                        <span style={{ fontSize: 12, color: '#9AA0A6' }}>{e.source}{e.source_detail ? ` · ${e.source_detail}` : ''}</span>
                      </div>
                      <div style={{ fontSize: 13, color: '#202124', wordBreak: 'break-word' }}>{e.message}</div>
                      <div style={{ fontSize: 11, color: '#9AA0A6', marginTop: 4 }}>
                        {new Date(e.captured_at).toLocaleString()}
                        {e.has_business && <span style={{ marginLeft: 8 }}>· tenant-specific</span>}
                      </div>
                    </div>
                    <button onClick={() => handleResolveError(e.id)} style={iconBtn} title="Mark resolved">
                      <CheckCircle2 style={{ width: 16, height: 16, color: '#157342' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: integrations + incidents */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Integration health panel */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.06)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#202124', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Zap style={{ width: 18, height: 18, color: '#155BB4' }} />
              Integration health
            </h2>
            {integrations.length === 0 ? (
              <p style={{ color: '#9AA0A6', fontSize: 13 }}>No integration data yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {integrations.map(i => (
                  <div key={i.integration} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F1F3F4' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#202124' }}>{i.display_name}</div>
                      <div style={{ fontSize: 11, color: '#9AA0A6' }}>
                        {i.consecutive_failures > 0 ? `${i.consecutive_failures} consecutive failures` : 'No failure streak'}
                        {i.last_error ? ` · ${i.last_error.slice(0, 60)}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <StatusDot status={i.status} />
                      <span style={{ fontSize: 12, color: statusColor(i.status), textTransform: 'capitalize' }}>{i.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Open incidents */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.06)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#202124', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <ShieldAlert style={{ width: 18, height: 18, color: '#A63A2F' }} />
              Open incidents
            </h2>
            {openIncidents.length === 0 ? (
              <p style={{ color: '#9AA0A6', fontSize: 13 }}>No open incidents.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {openIncidents.map(inc => (
                  <div key={inc.id} style={{ border: '1px solid #E8EAED', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: inc.severity === 'critical' ? '#A63A2F' : '#845400' }}>{inc.title}</div>
                        {inc.summary && <div style={{ fontSize: 12, color: '#5F6368', marginTop: 2 }}>{inc.summary}</div>}
                        <div style={{ fontSize: 11, color: '#9AA0A6', marginTop: 4 }}>
                          {new Date(inc.opened_at).toLocaleString()} · {inc.affected_business_count} tenant(s) affected
                        </div>
                      </div>
                      <button onClick={() => handleIncidentAction(inc.id, 'resolved')} style={iconBtn} title="Resolve incident">
                        <CheckCircle2 style={{ width: 16, height: 16, color: '#157342' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent incidents (with postmortem) */}
      {recentIncidents.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.06)', marginTop: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#202124', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Bell style={{ width: 18, height: 18, color: '#155BB4' }} />
            Incident history
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentIncidents.slice(0, 10).map(inc => (
              <div key={inc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F1F3F4' }}>
                <div>
                  <span style={{ fontSize: 13, color: '#202124' }}>{inc.title}</span>
                  {inc.summary && <span style={{ fontSize: 12, color: '#5F6368', marginLeft: 8 }}>{inc.summary}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#9AA0A6' }}>
                    {new Date(inc.opened_at).toLocaleDateString()}
                    {inc.closed_at ? ` → ${new Date(inc.closed_at).toLocaleDateString()}` : ''}
                  </span>
                  {inc.status === 'resolved'
                    ? <CheckCircle2 style={{ width: 14, height: 14, color: '#157342' }} />
                    : <XCircle style={{ width: 14, height: 14, color: '#A63A2F' }} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const retryBtn: React.CSSProperties = {
  marginTop: 12,
  padding: '8px 16px',
  background: '#155BB4',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  cursor: 'pointer',
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 6,
}
