import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import {
  FileText, ArrowLeft, Loader2, Send, Printer,
  Gavel, ListChecks, Calendar, MapPin, Clock, Users, CheckCircle2,
} from 'lucide-react'
import {
  fetchMeetingReports, generateMeetingReport,
  type MeetingReport,
} from '../lib/businessOS'

const BRAND = {
  primary: '#155BB4',
  primarySoft: 'rgba(21, 91, 180, 0.08)',
  surface: '#FFFFFF',
  surface2: '#F8F9FA',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
  success: '#157342',
  danger: '#EA4335',
  warning: '#B45309',
}

export default function MeetingReportView() {
  const { meetingId } = useParams<{ meetingId: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [reports, setReports] = useState<MeetingReport[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedReport, setSelectedReport] = useState<MeetingReport | null>(null)

  const load = useCallback(async () => {
    if (!meetingId) return
    setLoading(true)
    const list = await fetchMeetingReports(meetingId)
    setReports(list)
    setSelectedReport(list[0] ?? null)
    setLoading(false)
  }, [meetingId])

  useEffect(() => { load() }, [load])

  const handleGenerate = async () => {
    if (!meetingId) return
    setGenerating(true)
    const result = await generateMeetingReport(meetingId, true)
    setGenerating(false)
    if (result) {
      showToast(`Report generated${result.notified > 0 ? ` — ${result.notified} attendee${result.notified > 1 ? 's' : ''} notified` : ''}`, 'success')
      await load()
    } else {
      showToast('Failed to generate report. Make sure the meeting has a transcript.', 'error')
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const formatTime = (timeStr: string) => {
    try {
      const [h, m] = timeStr.split(':')
      const hour = parseInt(h, 10)
      const ampm = hour >= 12 ? 'PM' : 'AM'
      const hour12 = hour % 12 || 12
      return `${hour12}:${m} ${ampm}`
    } catch {
      return timeStr
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F9FA' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: BRAND.primary }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8F9FA' }}>
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 no-print">
          <button
            onClick={() => navigate(`/app/meetings/${meetingId}/intelligence`)}
            className="p-2 rounded-lg"
            style={{ color: BRAND.textSecondary }}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold" style={{ color: BRAND.text }}>
              Meeting Report
            </h1>
            <p className="text-sm" style={{ color: BRAND.textSecondary }}>
              A composed snapshot of the meeting intelligence — printable + shareable.
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: BRAND.primary }}
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {generating ? 'Generating...' : 'Generate + Notify'}
          </button>
          {selectedReport && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm"
              style={{ backgroundColor: BRAND.surface2, color: BRAND.textSecondary }}
            >
              <Printer size={16} /> Print
            </button>
          )}
        </div>

        {/* Report selector */}
        {reports.length > 1 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-2 no-print">
            {reports.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedReport(r)}
                className="flex-shrink-0 px-3 py-2 rounded-lg text-xs"
                style={{
                  backgroundColor: selectedReport?.id === r.id ? BRAND.primarySoft : BRAND.surface,
                  border: `1px solid ${selectedReport?.id === r.id ? BRAND.primary : BRAND.border}`,
                  color: selectedReport?.id === r.id ? BRAND.primary : BRAND.textSecondary,
                }}
              >
                {new Date(r.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </button>
            ))}
          </div>
        )}

        {/* Report content */}
        {!selectedReport ? (
          <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: BRAND.surface, boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
            <FileText size={48} className="mx-auto mb-3" style={{ color: BRAND.textMuted }} />
            <h3 className="text-lg font-semibold mb-1" style={{ color: BRAND.text }}>
              No reports yet
            </h3>
            <p className="text-sm" style={{ color: BRAND.textSecondary }}>
              Generate a report to compose the summary, decisions, and action items into a shareable document.
              Attendees will be notified.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl p-8" style={{ backgroundColor: BRAND.surface, boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
            {/* Meeting header */}
            <div className="mb-6 pb-6" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
              <h1 className="text-2xl font-bold mb-3" style={{ color: BRAND.text }}>
                {selectedReport.report_data.meeting.title}
              </h1>
              <div className="flex flex-wrap gap-4 text-sm" style={{ color: BRAND.textSecondary }}>
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} /> {formatDate(selectedReport.report_data.meeting.date)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={14} /> {formatTime(selectedReport.report_data.meeting.start_time)}
                  {selectedReport.report_data.meeting.end_time && ` — ${formatTime(selectedReport.report_data.meeting.end_time)}`}
                </span>
                {selectedReport.report_data.meeting.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={14} /> {selectedReport.report_data.meeting.location}
                  </span>
                )}
                {selectedReport.report_data.attendees.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Users size={14} /> {selectedReport.report_data.attendees.length} attendee{selectedReport.report_data.attendees.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Summary */}
            {selectedReport.report_data.summary && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3" style={{ color: BRAND.text }}>
                  Summary
                </h2>
                <div className="text-sm whitespace-pre-wrap" style={{ color: BRAND.textSecondary }}>
                  {selectedReport.report_data.summary}
                </div>
              </div>
            )}

            {/* Key points */}
            {selectedReport.report_data.key_points.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3" style={{ color: BRAND.text }}>
                  Key Points
                </h2>
                <ul className="space-y-1.5">
                  {selectedReport.report_data.key_points.map((pt, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: BRAND.textSecondary }}>
                      <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" style={{ color: BRAND.success }} />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Decisions */}
            {selectedReport.report_data.decisions.length > 0 && (
              <div className="mb-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold mb-3" style={{ color: BRAND.text }}>
                  <Gavel size={16} style={{ color: BRAND.primary }} />
                  Decisions ({selectedReport.report_data.decisions.length})
                </h2>
                <div className="space-y-2">
                  {selectedReport.report_data.decisions.map(dec => (
                    <div key={dec.id} className="p-3 rounded-lg" style={{ backgroundColor: BRAND.surface2 }}>
                      <p className="text-sm font-medium" style={{ color: BRAND.text }}>{dec.text}</p>
                      {dec.rationale && (
                        <p className="text-xs mt-1" style={{ color: BRAND.textSecondary }}>{dec.rationale}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {selectedReport.report_data.actions.length > 0 && (
              <div className="mb-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold mb-3" style={{ color: BRAND.text }}>
                  <ListChecks size={16} style={{ color: BRAND.primary }} />
                  Action Items ({selectedReport.report_data.actions.length})
                </h2>
                <div className="space-y-2">
                  {selectedReport.report_data.actions.map(act => (
                    <div key={act.id} className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: BRAND.surface2 }}>
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                        style={{ backgroundColor: act.priority === 'urgent' ? BRAND.danger : act.priority === 'high' ? BRAND.warning : BRAND.primary }}
                      />
                      <div className="flex-1">
                        <p className="text-sm" style={{ color: BRAND.text }}>{act.text}</p>
                        <div className="flex gap-3 mt-1">
                          <span className="text-xs" style={{ color: BRAND.textMuted }}>{act.priority}</span>
                          {act.due_date && (
                            <span className="text-xs" style={{ color: BRAND.textMuted }}>Due: {formatDate(act.due_date)}</span>
                          )}
                          {act.task_id && (
                            <span className="text-xs" style={{ color: BRAND.success }}>Linked to task</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="pt-6 mt-6 text-xs text-center no-print" style={{ borderTop: `1px solid ${BRAND.border}`, color: BRAND.textMuted }}>
              Generated {formatDate(selectedReport.report_data.generated_at)} at{' '}
              {new Date(selectedReport.report_data.generated_at).toLocaleTimeString('en-GB', { timeStyle: 'short' })}
              {selectedReport.sent_at && (
                <> · Notified {selectedReport.sent_to.length} attendee{selectedReport.sent_to.length > 1 ? 's' : ''}</>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
