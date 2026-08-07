import { useState, useEffect } from 'react'
import { 
  Bug, Activity, Heart, AlertTriangle, Clock, TrendingUp, 
  Database, Zap, Wifi, Shield, RefreshCw, Trash2, Download,
  ChevronDown, ChevronRight, X, CheckCircle, XCircle, AlertCircle
} from 'lucide-react'
import { qcLogger, performanceMonitor, healthChecker, issueReporter } from '../lib/quality-control'

type TabType = 'logs' | 'performance' | 'health' | 'reports'

export default function QCDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('health')
  const [isOpen, setIsOpen] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [healthStatus, setHealthStatus] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [reports, setReports] = useState<any[]>([])
  const [filterLevel, setFilterLevel] = useState<string>('all')

  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen, activeTab])

  function loadData() {
    if (activeTab === 'logs') {
      setLogs(qcLogger.getLogs(filterLevel === 'all' ? undefined : filterLevel as any, 100))
      setStats(qcLogger.getStats())
    } else if (activeTab === 'performance') {
      // Performance data will be loaded from metrics
    } else if (activeTab === 'health') {
      healthChecker.checkAll().then(setHealthStatus)
    } else if (activeTab === 'reports') {
      setReports(issueReporter.getReports())
    }
  }

  function clearAll() {
    if (confirm('Clear all QC data? This cannot be undone.')) {
      qcLogger.clearLogs()
      performanceMonitor.clearMetrics()
      issueReporter.clearReports()
      loadData()
    }
  }

  function exportData() {
    const data = {
      logs: qcLogger.getLogs(undefined, 1000),
      metrics: performanceMonitor.getMetrics(undefined, 500),
      reports: issueReporter.getReports(),
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `qc-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function reportIssue() {
    const title = prompt('Issue title:')
    if (!title) return
    const description = prompt('Description:')
    const severity = prompt('Severity (low/medium/high/critical):') || 'medium'
    
    issueReporter.reportBug(title, description || '', {
      page: window.location.pathname,
      userAgent: navigator.userAgent,
      severity,
    })
    loadData()
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-50 w-12 h-12 bg-[#4285F4] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-[#4285F4]/90 transition"
        title="Quality Control"
      >
        <Bug size={20} />
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-black/10">
          <div className="flex items-center gap-3">
            <Bug size={24} className="text-[#4285F4]" />
            <div>
              <h2 className="font-bold">Quality Control Dashboard</h2>
              <p className="text-xs text-black/50">Internal tools for monitoring and debugging</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="p-2 rounded-lg hover:bg-black/5"
              title="Refresh"
            >
              <RefreshCw size={18} />
            </button>
            <button
              onClick={exportData}
              className="p-2 rounded-lg hover:bg-black/5"
              title="Export Data"
            >
              <Download size={18} />
            </button>
            <button
              onClick={reportIssue}
              className="px-3 py-1.5 rounded-lg bg-red-100 text-red-600 text-sm font-medium hover:bg-red-200"
            >
              Report Issue
            </button>
            <button
              onClick={clearAll}
              className="p-2 rounded-lg hover:bg-black/5 text-red-500"
              title="Clear All Data"
            >
              <Trash2 size={18} />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-lg hover:bg-black/5"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-black/10">
          <TabButton 
            active={activeTab === 'health'} 
            onClick={() => setActiveTab('health')}
            icon={<Heart size={16} />}
            label="Health"
          />
          <TabButton 
            active={activeTab === 'logs'} 
            onClick={() => setActiveTab('logs')}
            icon={<Activity size={16} />}
            label="Logs"
          />
          <TabButton 
            active={activeTab === 'performance'} 
            onClick={() => setActiveTab('performance')}
            icon={<TrendingUp size={16} />}
            label="Performance"
          />
          <TabButton 
            active={activeTab === 'reports'} 
            onClick={() => setActiveTab('reports')}
            icon={<AlertTriangle size={16} />}
            label="Reports"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'health' && <HealthTab status={healthStatus} onCheck={() => healthChecker.checkAll().then(setHealthStatus)} />}
          {activeTab === 'logs' && <LogsTab logs={logs} stats={stats} filterLevel={filterLevel} onFilterChange={setFilterLevel} />}
          {activeTab === 'performance' && <PerformanceTab />}
          {activeTab === 'reports' && <ReportsTab reports={reports} />}
        </div>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition border-b-2 ${
        active 
          ? 'border-[#4285F4] text-[#4285F4]' 
          : 'border-transparent text-black/50 hover:text-black/70'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function HealthTab({ status, onCheck }: { status: any; onCheck: () => void }) {
  const checks = [
    { key: 'api', label: 'API', icon: <Zap size={18} />, description: 'Supabase API' },
    { key: 'database', label: 'Database', icon: <Database size={18} />, description: 'PostgreSQL' },
    { key: 'auth', label: 'Auth', icon: <Shield size={18} />, description: 'Authentication' },
    { key: 'realtime', label: 'Realtime', icon: <Wifi size={18} />, description: 'WebSocket' },
    { key: 'storage', label: 'Storage', icon: <Database size={18} />, description: 'File Storage' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">System Health</h3>
        <button
          onClick={onCheck}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#4285F4] text-white text-sm"
        >
          <RefreshCw size={14} />
          Check Now
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {checks.map((check) => {
          const isHealthy = status?.[check.key]
          return (
            <div 
              key={check.key}
              className={`p-4 rounded-xl border-2 ${
                isHealthy 
                  ? 'border-green-200 bg-green-50' 
                  : status?.[check.key] === false 
                    ? 'border-red-200 bg-red-50' 
                    : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                {check.icon}
                {isHealthy ? (
                  <CheckCircle size={18} className="text-green-500" />
                ) : status?.[check.key] === false ? (
                  <XCircle size={18} className="text-red-500" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                )}
              </div>
              <div className="font-medium">{check.label}</div>
              <div className="text-xs text-black/50">{check.description}</div>
            </div>
          )
        })}
      </div>

      {status?.responseTime && (
        <div className="mt-4 p-3 bg-black/5 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <Clock size={14} />
            <span>Last check response time:</span>
            <span className="font-mono font-medium">{Math.round(status.responseTime)}ms</span>
          </div>
          <div className="text-xs text-black/50 mt-1">
            Last checked: {new Date(status.lastChecked).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  )
}

function LogsTab({ logs, stats, filterLevel, onFilterChange }: { logs: any[]; stats: any; filterLevel: string; onFilterChange: (level: string) => void }) {
  const levelColors: Record<string, string> = {
    debug: 'bg-gray-100 text-gray-900',
    info: 'bg-blue-100 text-blue-600',
    warn: 'bg-amber-100 text-amber-600',
    error: 'bg-red-100 text-red-600',
    critical: 'bg-red-200 text-red-800 font-bold',
  }

  return (
    <div>
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          {Object.entries(stats.byLevel).map(([level, count]) => (
            <div key={level} className="p-3 bg-black/5 rounded-lg">
              <div className="text-xs text-black/50 capitalize">{level}</div>
              <div className="text-xl font-bold">{count as number}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-black/50">Filter:</span>
        {['all', 'debug', 'info', 'warn', 'error', 'critical'].map((level) => (
          <button
            key={level}
            onClick={() => onFilterChange(level)}
            className={`px-2 py-1 rounded text-xs font-medium ${
              filterLevel === level 
                ? 'bg-[#4285F4] text-white' 
                : 'bg-black/5 hover:bg-black/10'
            }`}
          >
            {level === 'all' ? 'All' : level.charAt(0).toUpperCase() + level.slice(1)}
          </button>
        ))}
      </div>

      {/* Log List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="text-center py-8 text-black/40">
            <Activity size={32} className="mx-auto mb-2" />
            <p>No logs recorded</p>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="p-3 bg-black/[0.02] rounded-lg text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${levelColors[log.level]}`}>
                  {log.level}
                </span>
                <span className="text-xs text-black/40">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-xs text-black/40">{log.page}</span>
              </div>
              <div className="font-medium">{log.message}</div>
              {log.context && Object.keys(log.context).length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-black/50 cursor-pointer">Context</summary>
                  <pre className="mt-1 p-2 bg-black/5 rounded text-xs overflow-x-auto">
                    {JSON.stringify(log.context, null, 2)}
                  </pre>
                </details>
              )}
              {log.error && (
                <details className="mt-2">
                  <summary className="text-xs text-red-500 cursor-pointer">Error</summary>
                  <pre className="mt-1 p-2 bg-red-50 rounded text-xs overflow-x-auto">
                    {log.error.stack || `${log.error.name}: ${log.error.message}`}
                  </pre>
                </details>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function PerformanceTab() {
  const [metrics, setMetrics] = useState<any[]>([])
  
  useEffect(() => {
    setMetrics(performanceMonitor.getMetrics(undefined, 50))
  }, [])

  const apiMetrics = metrics.filter(m => m.name.includes('_api'))
  const renderMetrics = metrics.filter(m => m.name.includes('_render'))

  const avgApi = apiMetrics.length > 0 
    ? apiMetrics.reduce((sum, m) => sum + m.value, 0) / apiMetrics.length 
    : 0
  const avgRender = renderMetrics.length > 0 
    ? renderMetrics.reduce((sum, m) => sum + m.value, 0) / renderMetrics.length 
    : 0

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-black/5 rounded-xl">
          <div className="text-sm text-black/50 mb-1">Average API Response</div>
          <div className={`text-2xl font-bold ${avgApi > 3000 ? 'text-red-500' : avgApi > 1000 ? 'text-amber-500' : 'text-green-500'}`}>
            {Math.round(avgApi)}ms
          </div>
        </div>
        <div className="p-4 bg-black/5 rounded-xl">
          <div className="text-sm text-black/50 mb-1">Average Render Time</div>
          <div className={`text-2xl font-bold ${avgRender > 500 ? 'text-red-500' : avgRender > 100 ? 'text-amber-500' : 'text-green-500'}`}>
            {Math.round(avgRender)}ms
          </div>
        </div>
      </div>

      <h4 className="font-medium mb-3">Recent API Calls</h4>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {apiMetrics.slice(0, 20).map((metric, i) => (
          <div key={i} className="flex items-center justify-between p-2 bg-black/[0.02] rounded">
            <span className="text-sm font-mono">{metric.name.replace('_api', '')}</span>
            <span className={`text-sm font-mono ${
              metric.value > 3000 ? 'text-red-500' : 
              metric.value > 1000 ? 'text-amber-500' : 'text-green-500'
            }`}>
              {Math.round(metric.value)}ms
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportsTab({ reports }: { reports: any[] }) {
  const severityColors: Record<string, string> = {
    low: 'bg-blue-100 text-blue-600',
    medium: 'bg-amber-100 text-amber-600',
    high: 'bg-orange-100 text-orange-600',
    critical: 'bg-red-100 text-red-600',
  }

  const statusIcons: Record<string, React.ReactNode> = {
    open: <AlertCircle size={14} className="text-amber-500" />,
    investigating: <RefreshCw size={14} className="text-blue-500" />,
    fixed: <CheckCircle size={14} className="text-green-500" />,
    wontfix: <XCircle size={14} className="text-gray-900" />,
  }

  return (
    <div>
      {reports.length === 0 ? (
        <div className="text-center py-12 text-black/40">
          <AlertTriangle size={32} className="mx-auto mb-2" />
          <p>No issues reported</p>
          <p className="text-xs mt-1">Use "Report Issue" to document problems</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div key={report.id} className="p-4 bg-black/[0.02] rounded-xl">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityColors[report.severity]}`}>
                      {report.severity}
                    </span>
                    <span className="text-xs text-black/40">{report.type}</span>
                    <span className="flex items-center gap-1 text-xs text-black/40">
                      {statusIcons[report.status]}
                      {report.status}
                    </span>
                  </div>
                  <div className="font-medium">{report.title}</div>
                  <div className="text-sm text-black/60 mt-1">{report.description}</div>
                </div>
                <div className="text-xs text-black/40 text-right">
                  {new Date(report.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
