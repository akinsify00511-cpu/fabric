import { Link } from 'react-router-dom'
import { Home, ArrowLeft, Search } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {/* 404 Graphic */}
        <div className="mb-8">
          <div className="text-[120px] font-bold text-transparent bg-clip-text bg-gradient-to-br from-indigo-500 to-purple-600 leading-none" style={{ WebkitTextStroke: '2px #E0E7FF' }}>
            404
          </div>
          <div className="flex justify-center gap-2 -mt-4">
            <span className="text-6xl">🔍</span>
          </div>
        </div>

        {/* Message */}
        <h1 className="text-2xl font-bold text-black mb-2">
          Page Not Found
        </h1>
        <p className="text-black mb-8">
          Sorry, we couldn't find the page you're looking for. It might have been moved or doesn't exist.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[var(--av-text)] text-white rounded-xl font-medium hover:bg-black/90 transition"
          >
            <Home size={18} />
            Go Home
          </Link>
          <Link
            to="/app"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border border-black/10 text-black rounded-xl font-medium hover:bg-black/10 transition"
          >
            <ArrowLeft size={18} />
            Back to App
          </Link>
        </div>

        {/* Search suggestion */}
        <div className="mt-8 p-4 bg-white rounded-2xl border border-black/5">
          <p className="text-sm text-black mb-2">Need help finding something?</p>
          <a
            href="/app"
            className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <Search size={14} />
            Browse all features
          </a>
        </div>

        {/* Quick Links */}
        <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
          <Link to="/pricing" className="text-black hover:text-black">Pricing</Link>
          <Link to="/login" className="text-black hover:text-black">Login</Link>
          <Link to="/signup" className="text-black hover:text-black">Sign Up</Link>
          <Link to="/contact" className="text-black hover:text-black">Contact</Link>
        </div>
      </div>
    </div>
  )
}
