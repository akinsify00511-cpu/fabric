import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react'
import { Link } from 'react-router-dom'
import { qcLogger, issueReporter } from '../lib/quality-control'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: any) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorId: string | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorId: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  async componentDidCatch(error: Error, errorInfo: any) {
    // Generate error ID for tracking
    const errorId = crypto.randomUUID()
    
    // Log to QC system
    qcLogger.error('React Error Boundary caught an error', {
      errorId,
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo?.componentStack,
    })

    // Report to issue tracker
    await issueReporter.reportBug(
      `UI Error: ${error.message.slice(0, 100)}`,
      `${error.name}: ${error.message}\n\nStack:\n${error.stack || 'No stack trace'}`,
      {
        errorId,
        componentStack: errorInfo?.componentStack,
        page: window.location.pathname,
        userAgent: navigator.userAgent,
      }
    )

    this.setState({ errorId })
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorId: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} className="text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-gray-900 mb-6">
              We encountered an unexpected error. This has been logged automatically.
            </p>

            {this.state.errorId && (
              <div className="mb-4 p-3 bg-black/5 rounded-lg">
                <p className="text-xs text-black/50">Reference ID</p>
                <p className="font-mono text-sm text-black/70">{this.state.errorId}</p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={this.handleRetry}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-600 transition"
              >
                <RefreshCw size={18} />
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/app'}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-900 rounded-lg font-medium hover:bg-gray-200 transition"
              >
                <Home size={18} />
                Go to Dashboard
              </button>
            </div>

            {/* Show detailed error in dev mode */}
            {import.meta.env.DEV && this.state.error && (
              <details className="mt-6 p-4 bg-red-50 rounded-lg text-left">
                <summary className="text-xs font-medium text-red-600 cursor-pointer">
                  Technical Details
                </summary>
                <pre className="mt-2 p-2 bg-white rounded text-xs text-red-700 overflow-x-auto max-h-40">
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack?.split('\n').slice(0, 8).join('\n')}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Hook for manual error reporting
export function useErrorReporting() {
  const reportError = async (title: string, error: Error | string, context?: Record<string, any>) => {
    const errorMessage = typeof error === 'string' ? error : error.message
    const errorStack = typeof error === 'string' ? undefined : error.stack

    qcLogger.error(title, { message: errorMessage, stack: errorStack, ...context })

    await issueReporter.reportBug(
      title,
      errorMessage,
      { stack: errorStack, ...context }
    )
  }

  return { reportError }
}
