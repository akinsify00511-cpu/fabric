/**
 * Beta Feedback Button
 * In-app bug reporting with automatic context capture
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  Bug,
  X,
  Send,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { getCapturedErrors, clearCapturedErrors, formatErrorsForDisplay } from '../lib/errorCapture'
import * as Sentry from '@sentry/react'

interface BetaFeedbackButtonProps {
  className?: string
}

export default function BetaFeedbackButton({ className = '' }: BetaFeedbackButtonProps) {
  const { staff, business } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Get captured errors
  const capturedErrors = getCapturedErrors()

  const submitFeedback = useCallback(async () => {
    if (!description.trim()) {
      setSubmitError('Please describe what happened')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const errorsJson = JSON.stringify(capturedErrors.slice(-10))
      const appVersion = import.meta.env.VITE_GIT_SHA || 'unknown'

      const { error } = await supabase.from('beta_feedback').insert({
        business_id: staff?.business_id,
        staff_id: staff?.id,
        route: window.location.pathname,
        description: description.trim(),
        user_agent: navigator.userAgent,
        console_errors: errorsJson,
        app_version: appVersion,
      })

      if (error) throw error

      // Also send to Sentry for correlation
      Sentry.captureFeedback({
        message: description.trim(),
        tags: {
          business_id: staff?.business_id,
          route: window.location.pathname,
          is_beta_tester: String(staff?.is_beta_tester ?? false),
        },
      })

      // Clear errors after successful submission
      clearCapturedErrors()
      setSubmitted(true)
      setDescription('')

      // Reset after 3 seconds
      setTimeout(() => {
        setSubmitted(false)
        setIsOpen(false)
      }, 3000)
    } catch (err) {
      console.error('Failed to submit feedback:', err)
      setSubmitError('Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [description, staff, capturedErrors])

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Don't show for non-beta testers
  if (!staff?.is_beta_tester) {
    return null
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-24 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 ${className}`}
        title="Report a bug"
      >
        <Bug size={18} />
        <span className="text-sm font-medium">Feedback</span>
        {capturedErrors.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {capturedErrors.length}
          </span>
        )}
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-black/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Bug size={20} className="text-amber-600" />
                </div>
                <div>
                  <h2 className="font-semibold">Report a Bug</h2>
                  <p className="text-xs text-black/50">
                    Current page: {window.location.pathname}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-black/5 rounded-lg transition"
              >
                <X size={20} className="text-black/40" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {submitted ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={32} className="text-green-600" />
                  </div>
                  <h3 className="font-semibold text-lg">Thanks for your feedback!</h3>
                  <p className="text-sm text-black/50 mt-1">
                    We'll look into this issue right away.
                  </p>
                </div>
              ) : (
                <>
                  {/* Description */}
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      What happened?
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the issue you're experiencing..."
                      className="w-full px-4 py-3 rounded-xl border border-black/10 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      rows={4}
                      autoFocus
                    />
                  </div>

                  {/* Captured Errors */}
                  {capturedErrors.length > 0 && (
                    <div className="bg-red-50 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setShowErrors(!showErrors)}
                        className="w-full flex items-center justify-between p-3 hover:bg-red-100/50 transition"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={16} className="text-red-500" />
                          <span className="text-sm font-medium text-red-700">
                            {capturedErrors.length} console error
                            {capturedErrors.length !== 1 ? 's' : ''} captured
                          </span>
                        </div>
                        {showErrors ? (
                          <ChevronUp size={16} className="text-red-500" />
                        ) : (
                          <ChevronDown size={16} className="text-red-500" />
                        )}
                      </button>
                      {showErrors && (
                        <div className="px-3 pb-3">
                          <pre className="text-xs text-red-700 bg-red-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                            {formatErrorsForDisplay()}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* App Version */}
                  <div className="text-xs text-black/30">
                    App version: {import.meta.env.VITE_GIT_SHA || 'development'}
                  </div>

                  {/* Error Message */}
                  {submitError && (
                    <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      {submitError}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {!submitted && (
              <div className="px-4 py-4 border-t border-black/5 flex justify-end gap-3">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm text-black/50 hover:text-black transition"
                >
                  Cancel
                </button>
                <button
                  onClick={submitFeedback}
                  disabled={submitting || !description.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium rounded-lg hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Send Feedback
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
