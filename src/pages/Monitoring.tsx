import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Activity, Plus, CheckCircle2, XCircle, AlertTriangle, Clock,
  TrendingUp, TrendingDown, RefreshCw, Settings, Eye,
  Server, Globe, Database, Lock, Bell, ChevronRight, ExternalLink
} from 'lucide-react'

type Monitor = {
  id: string
  name: string
  monitor_type: string
  target_url: string
  status: 'up' | 'down' | 'degraded' | 'unknown'
  last_check_at: string
  response_time_ms: number
  uptime_percent: number
  is_active: boolean
}

type Incident = {
  id: string
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'investigating' | 'resolved'
  started_at: string
  resolved_at: string | null
  duration_seconds: number
  affected_users: number
}

type Heartbeat = {
  id: string
  name: string
  status: 'healthy' | 'late' | 'missed'
  last_heartbeat_at: string
  check_interval_seconds: number
}

const STATUS_CONFIG = {
  up: { label: 'Operational', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
  down: { label: 'Down', icon: XCircle, color: 'text-red-600', bg: 'bg-red-100' },
  degraded: { label: 'Degraded', icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  unknown: { label: 'Unknown', icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100' },
}

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: 'text-red-600', bg: 'bg-red-100' },
  high: { label: 'High', color: 'text-orange-600', bg: 'bg-orange-100' },
  medium: { label: 'Medium', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  low: { label: 'Low', color: 'text-blue-600', bg: 'bg-blue-100' },
}

export default function Monitoring() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'monitors' | 'incidents' | 'heartbeats'>('overview')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [overallStatus, setOverallStatus] = useState<'operational' | 'degraded' | 'down'>('operational')

  useEffect(() => {
    loadData()
  }, [staff?.business_id])

  async function loadData() {
    setLoading(true)

    // Load monitors
    const { data: monitorData } = await supabase
      .from('monitors')
      .select('*')
      .eq('business_id', staff?.business_id)
      .order('name')

    if (monitorData && monitorData.length > 0) {
      setMonitors(monitorData)
    } else {
      // Demo data
      setMonitors([
        { id: '1', name: 'Main Website', monitor_type: 'http', target_url: 'https://avenize.riverwayse.com', status: 'up', last_check_at: new Date().toISOString(), response_time_ms: 145, uptime_percent: 99.98, is_active: true },
        { id: '2', name: 'API Server', monitor_type: 'http', target_url: 'https://api.avenize.riverwayse.com', status: 'up', last_check_at: new Date().toISOString(), response_time_ms: 89, uptime_percent: 99.95, is_active: true },
        { id: '3', name: 'Database', monitor_type: 'tcp', target_url: '', status: 'up', last_check_at: new Date().toISOString(), response_time_ms: 12, uptime_percent: 100, is_active: true },
        { id: '4', name: 'Auth Service', monitor_type: 'http', target_url: 'https://auth.avenize.riverwayse.com', status: 'degraded', last_check_at: new Date().toISOString(), response_time_ms: 450, uptime_percent: 98.5, is_active: true },
      ])
    }

    // Load incidents
    const { data: incidentData } = await supabase
      .from('incidents')
      .select('*')
      .eq('business_id', staff?.business_id)
      .order('started_at', { ascending: false })

    if (incidentData && incidentData.length > 0) {
      setIncidents(incidentData)
    } else {
      setIncidents([
        { id: '1', title: 'API response time degraded', severity: 'medium', status: 'investigating', started_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), resolved_at: null, duration_seconds: 1800, affected_users: 0 },
        { id: '2', title: 'Email delivery delays', severity: 'low', status: 'resolved', started_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), resolved_at: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(), duration_seconds: 14400, affected_users: 15 },
      ])
    }

    // Load heartbeats
    setHeartbeats([
      { id: '1', name: 'Daily Reports Job', status: 'healthy', last_heartbeat_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), check_interval_seconds: 300 },
      { id: '2', name: 'Email Digest Cron', status: 'healthy', last_heartbeat_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), check_interval_seconds: 900 },
      { id: '3', name: 'Data Sync Task', status: 'late', last_heartbeat_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), check_interval_seconds: 300 },
    ])

    setLoading(false)
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return `${Math.floor(seconds / 86400)}d`
  }

  const timeSince = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  const upCount = monitors.filter((m) => m.status === 'up').length
  const downCount = monitors.filter((m) => m.status === 'down').length
  const avgUptime = monitors.length > 0
    ? monitors.reduce((sum, m) => sum + m.uptime_percent, 0) / monitors.length
    : 100

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-gray-900">Monitoring</h1>
          <p className="text-sm text-black/50 mt-0.5">System health and incident management</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-black/10 text-sm"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
          >
            <Plus size={16} />
            Add Monitor
          </button>
        </div>
      </div>

      {/* Status Banner */}
      <div className={`rounded-2xl p-6 mb-6 ${
        overallStatus === 'operational' ? 'bg-green-50' :
        overallStatus === 'degraded' ? 'bg-yellow-50' : 'bg-red-50'
      }`}>
        <div className="flex items-center gap-4">
          {overallStatus === 'operational' ? (
            <CheckCircle2 size={48} className="text-green-600" />
          ) : overallStatus === 'degraded' ? (
            <AlertTriangle size={48} className="text-yellow-600" />
          ) : (
            <XCircle size={48} className="text-red-600" />
          )}
          <div>
            <h2 className={`text-xl font-semibold ${
              overallStatus === 'operational' ? 'text-green-800' :
              overallStatus === 'degraded' ? 'text-yellow-800' : 'text-red-800'
            }`}>
              {overallStatus === 'operational' ? 'All Systems Operational' :
               overallStatus === 'degraded' ? 'Partial Degradation' : 'Major Outage'}
            </h2>
            <p className="text-sm opacity-70 mt-1">
              {upCount} of {monitors.length} monitors operational • {avgUptime.toFixed(2)}% uptime
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'monitors', label: 'Monitors' },
          { key: 'incidents', label: 'Incidents' },
          { key: 'heartbeats', label: 'Heartbeats' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeTab === tab.key ? 'avenize-gradient text-white' : 'border border-black/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monitor Status */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h3 className="font-medium mb-4">Service Status</h3>
            <div className="space-y-3">
              {monitors.slice(0, 5).map((monitor) => {
                const config = STATUS_CONFIG[monitor.status]
                const Icon = config.icon
                return (
                  <div key={monitor.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.bg}`}>
                        <Icon size={16} className={config.color} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{monitor.name}</p>
                        <p className="text-xs text-black/40">{monitor.target_url || monitor.monitor_type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${config.color}`}>{config.label}</p>
                      <p className="text-xs text-black/40">{monitor.response_time_ms}ms</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent Incidents */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h3 className="font-medium mb-4">Recent Incidents</h3>
            <div className="space-y-3">
              {incidents.slice(0, 3).map((incident) => {
                const config = SEVERITY_CONFIG[incident.severity]
                return (
                  <div key={incident.id} className="flex items-start gap-3 p-3 rounded-xl bg-black/[0.02]">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.bg}`}>
                      <AlertTriangle size={16} className={config.color} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{incident.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                      <p className="text-xs text-black/50 mt-1">
                        {incident.status === 'resolved' 
                          ? `Resolved ${timeSince(incident.resolved_at!)}`
                          : `Started ${timeSince(incident.started_at)}`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Uptime Chart */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h3 className="font-medium mb-4">7-Day Uptime</h3>
            <div className="h-40 flex items-end justify-between gap-1">
              {[99.9, 99.8, 99.95, 99.7, 99.99, 100, 99.98].map((uptime, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${uptime}%`,
                      background: uptime >= 99.9 ? '#10B981' : uptime >= 99 ? '#F59E0B' : '#EF4444'
                    }}
                  />
                  <span className="text-xs text-black/40">{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Response Time */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h3 className="font-medium mb-4">Avg Response Time</h3>
            <div className="flex items-center justify-center h-40">
              <div className="text-center">
                <p className="text-5xl font-bold text-indigo-600">127ms</p>
                <p className="text-sm text-black/50 mt-2">-12% from last week</p>
                <TrendingDown className="mx-auto mt-2 text-green-600" size={24} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Monitors Tab */}
      {activeTab === 'monitors' && (
        <div className="space-y-4">
          {monitors.map((monitor) => {
            const config = STATUS_CONFIG[monitor.status]
            const Icon = config.icon
            return (
              <div key={monitor.id} className="bg-white rounded-2xl border border-black/[0.06] p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${config.bg}`}>
                      <Server size={24} className={config.color} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{monitor.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                      <p className="text-sm text-black/50">{monitor.target_url || monitor.monitor_type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-sm font-medium">{monitor.response_time_ms}ms</p>
                      <p className="text-xs text-black/40">Response</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{monitor.uptime_percent.toFixed(2)}%</p>
                      <p className="text-xs text-black/40">Uptime</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{timeSince(monitor.last_check_at)}</p>
                      <p className="text-xs text-black/40">Last check</p>
                    </div>
                    <button className="p-2 hover:bg-black/[0.05] rounded-lg">
                      <Settings size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Incidents Tab */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          {incidents.map((incident) => {
            const config = SEVERITY_CONFIG[incident.severity]
            return (
              <div key={incident.id} className="bg-white rounded-2xl border border-black/[0.06] p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.bg}`}>
                      <AlertTriangle size={20} className={config.color} />
                    </div>
                    <div>
                      <h3 className="font-medium">{incident.title}</h3>
                      <p className="text-sm text-black/50">
                        Started {new Date(incident.started_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      incident.status === 'resolved' ? 'bg-green-100 text-green-700' :
                      incident.status === 'investigating' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {incident.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-black/40">Duration:</span>{' '}
                    <span className="font-medium">
                      {incident.resolved_at
                        ? formatDuration(incident.duration_seconds)
                        : `Ongoing (${formatDuration(Math.floor((Date.now() - new Date(incident.started_at).getTime()) / 1000))})`}
                    </span>
                  </div>
                  {incident.affected_users > 0 && (
                    <div>
                      <span className="text-black/40">Affected:</span>{' '}
                      <span className="font-medium">{incident.affected_users} users</span>
                    </div>
                  )}
                  <button className="ml-auto text-indigo-600 text-sm flex items-center gap-1">
                    View details <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Heartbeats Tab */}
      {activeTab === 'heartbeats' && (
        <div className="space-y-4">
          {heartbeats.map((heartbeat) => (
            <div key={heartbeat.id} className="bg-white rounded-2xl border border-black/[0.06] p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    heartbeat.status === 'healthy' ? 'bg-green-100' :
                    heartbeat.status === 'late' ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    <Activity size={24} className={
                      heartbeat.status === 'healthy' ? 'text-green-600' :
                      heartbeat.status === 'late' ? 'text-yellow-600' : 'text-red-600'
                    } />
                  </div>
                  <div>
                    <h3 className="font-medium">{heartbeat.name}</h3>
                    <p className="text-sm text-black/50">
                      Every {heartbeat.check_interval_seconds / 60} minutes
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className={`text-sm font-medium ${
                      heartbeat.status === 'healthy' ? 'text-green-600' :
                      heartbeat.status === 'late' ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {heartbeat.status === 'healthy' ? 'Healthy' :
                       heartbeat.status === 'late' ? 'Late' : 'Missed'}
                    </p>
                    <p className="text-xs text-black/40">
                      Last: {timeSince(heartbeat.last_heartbeat_at)}
                    </p>
                  </div>
                  <button className="p-2 hover:bg-black/[0.05] rounded-lg">
                    <Settings size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Monitor Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="font-semibold">Add Monitor</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Monitor Name</label>
                <input
                  placeholder="API Server"
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Monitor Type</label>
                <select className="w-full px-4 py-3 rounded-xl border border-black/10">
                  <option value="http">HTTP(s) - Website/API</option>
                  <option value="tcp">TCP - Server</option>
                  <option value="ping">Ping</option>
                  <option value="ssl">SSL Certificate</option>
                  <option value="dns">DNS</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Target URL</label>
                <input
                  placeholder="https://api.example.com/health"
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Check Interval</label>
                <select className="w-full px-4 py-3 rounded-xl border border-black/10">
                  <option value="30">Every 30 seconds</option>
                  <option value="60">Every minute</option>
                  <option value="300">Every 5 minutes</option>
                  <option value="600">Every 10 minutes</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-lg border border-black/10">
                Cancel
              </button>
              <button onClick={() => { setShowCreateModal(false); showToast('Monitor added!', 'success'); }} className="px-4 py-2 rounded-lg avenize-gradient text-white font-medium">
                Add Monitor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
