import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Cookie, X, Settings } from 'lucide-react'

type CookiePreferences = {
  essential: boolean
  analytics: boolean
  marketing: boolean
  functional: boolean
}

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [preferences, setPreferences] = useState<CookiePreferences>({
    essential: true,
    analytics: false,
    marketing: false,
    functional: false,
  })

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem('cookie_consent')
    if (!consent) {
      // Show banner after a short delay
      const timer = setTimeout(() => setShowBanner(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleAcceptAll = () => {
    setPreferences({
      essential: true,
      analytics: true,
      marketing: true,
      functional: true,
    })
    saveConsent({
      essential: true,
      analytics: true,
      marketing: true,
      functional: true,
    })
    setShowBanner(false)
  }

  const handleRejectAll = () => {
    saveConsent({
      essential: true,
      analytics: false,
      marketing: false,
      functional: false,
    })
    setShowBanner(false)
  }

  const handleSavePreferences = () => {
    saveConsent({
      ...preferences,
      essential: true, // Always required
    })
    setShowBanner(false)
    setShowSettings(false)
  }

  const saveConsent = (prefs: CookiePreferences) => {
    localStorage.setItem('cookie_consent', JSON.stringify({
      ...prefs,
      timestamp: new Date().toISOString(),
    }))
    // Enable/disable cookies based on preferences
    if (prefs.analytics) {
      // Enable analytics
      ;(window as any).gtag?.('consent', 'update', { analytics_storage: 'granted' })
    }
    if (prefs.marketing) {
      // Enable marketing
      ;(window as any).gtag?.('consent', 'update', { ad_storage: 'granted' })
    }
  }

  if (!showBanner) return null

  return (
    <>
      {/* Backdrop */}
      {showSettings && (
        <div 
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setShowSettings(false)}
        />
      )}

      {/* Banner */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 p-4 ${showSettings ? 'pb-4' : 'pb-safe'}`}>
        <div className="max-w-4xl mx-auto">
          {showSettings ? (
            // Settings Panel
            <div className="bg-white rounded-2xl shadow-2xl border border-black/5 p-6 animate-slide-up">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-gray-800" />
                  <h3 className="font-semibold text-[var(--avenize-black)]">Cookie Preferences</h3>
                </div>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-black/5 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-gray-800" />
                </button>
              </div>

              <div className="space-y-4 mb-6">
                {/* Essential - Always On */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <h4 className="font-medium text-[var(--avenize-black)]">Essential Cookies</h4>
                    <p className="text-sm text-gray-900">Required for the website to function</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-900">Always on</span>
                    <div className="w-11 h-6 bg-indigo-600 rounded-full relative">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Analytics */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <h4 className="font-medium text-[var(--avenize-black)]">Analytics</h4>
                    <p className="text-sm text-gray-900">Help us understand how visitors use our site</p>
                  </div>
                  <button
                    onClick={() => setPreferences(p => ({ ...p, analytics: !p.analytics }))}
                    className={`w-11 h-6 rounded-full relative transition-colors ${
                      preferences.analytics ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      preferences.analytics ? 'right-1' : 'left-1'
                    }`} />
                  </button>
                </div>

                {/* Marketing */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <h4 className="font-medium text-[var(--avenize-black)]">Marketing</h4>
                    <p className="text-sm text-gray-900">Used to deliver relevant advertisements</p>
                  </div>
                  <button
                    onClick={() => setPreferences(p => ({ ...p, marketing: !p.marketing }))}
                    className={`w-11 h-6 rounded-full relative transition-colors ${
                      preferences.marketing ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      preferences.marketing ? 'right-1' : 'left-1'
                    }`} />
                  </button>
                </div>

                {/* Functional */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <h4 className="font-medium text-[var(--avenize-black)]">Functional</h4>
                    <p className="text-sm text-gray-900">Remember your preferences and settings</p>
                  </div>
                  <button
                    onClick={() => setPreferences(p => ({ ...p, functional: !p.functional }))}
                    className={`w-11 h-6 rounded-full relative transition-colors ${
                      preferences.functional ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      preferences.functional ? 'right-1' : 'left-1'
                    }`} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleSavePreferences}
                  className="flex-1 px-6 py-3 bg-[var(--avenize-black)] text-white rounded-xl font-medium hover:bg-black/90 transition"
                >
                  Save Preferences
                </button>
                <button
                  onClick={handleAcceptAll}
                  className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition"
                >
                  Accept All
                </button>
              </div>

              <p className="text-xs text-gray-800 text-center mt-4">
                By clicking "Accept All", you consent to all cookies. You can update your preferences at any time.
              </p>
            </div>
          ) : (
            // Main Banner
            <div className="bg-white rounded-2xl shadow-2xl border border-black/5 p-6 animate-slide-up">
              <div className="flex items-start gap-4">
                <div className="hidden sm:flex items-center justify-center w-12 h-12 bg-amber-100 rounded-full shrink-0">
                  <Cookie className="w-6 h-6 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-[var(--avenize-black)] mb-1">
                    We value your privacy
                  </h3>
                  <p className="text-sm text-gray-900 mb-4">
                    We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic. By clicking "Accept All", you consent to our use of cookies.
                    {' '}
                    <Link to="/cookies" className="text-indigo-600 hover:underline">
                      Learn more
                    </Link>
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => setShowSettings(true)}
                      className="px-4 py-2 bg-white border border-black/10 text-[var(--avenize-black)] rounded-lg text-sm font-medium hover:bg-black/5 transition flex items-center justify-center gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      Customize
                    </button>
                    <button
                      onClick={handleRejectAll}
                      className="px-4 py-2 bg-white border border-black/10 text-gray-900 rounded-lg text-sm font-medium hover:bg-black/5 transition"
                    >
                      Reject All
                    </button>
                    <button
                      onClick={handleAcceptAll}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
                    >
                      Accept All
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleRejectAll}
                  className="p-2 hover:bg-black/5 rounded-lg transition shrink-0"
                >
                  <X className="w-5 h-5 text-gray-800" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .pb-safe {
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
        }
      `}</style>
    </>
  )
}
