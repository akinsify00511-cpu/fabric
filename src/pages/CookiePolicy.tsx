import { Link } from 'react-router-dom'
import { ArrowLeft, Cookie, Settings } from 'lucide-react'

export default function CookiePolicy() {
  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-black hover:text-indigo-600 transition">
            <ArrowLeft size={20} />
            <span className="font-medium">Back</span>
          </Link>
          <h1 className="text-lg font-semibold text-black">Cookie Policy</h1>
          <div className="w-20"></div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-black/5 p-8 md:p-12">
          {/* Title */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
              <Cookie className="w-8 h-8 text-amber-600" />
            </div>
            <h1 className="text-3xl font-bold text-black mb-2">Cookie Policy</h1>
            <p className="text-black">Last updated: August 3, 2026</p>
          </div>

          {/* Quick Summary */}
          <div className="bg-blue-50 rounded-xl p-4 mb-8">
            <p className="text-blue-800 text-sm">
              <strong>TL;DR:</strong> We use cookies to improve your experience. You can manage your preferences below.
              We don't sell cookies to third parties.
            </p>
          </div>

          {/* Sections */}
          <div className="prose prose-slate max-w-none space-y-8">
            <section>
              <h2>1. What Are Cookies?</h2>
              <p>
                Cookies are small text files stored on your device when you visit a website. They help websites remember your preferences, login status, and browsing behavior.
              </p>
            </section>

            <section>
              <h2>2. Types of Cookies We Use</h2>
              
              <h3>Essential Cookies</h3>
              <p>Required for the website to function. Cannot be disabled.</p>
              <ul>
                <li><strong>Session cookies:</strong> Remember your login status and preferences</li>
                <li><strong>Security cookies:</strong> Protect against fraud and unauthorized access</li>
                <li><strong>Load balancing:</strong> Ensure website performance</li>
              </ul>

              <h3>Performance Cookies</h3>
              <p>Help us understand how visitors interact with our website.</p>
              <ul>
                <li><strong>Analytics:</strong> Track page views, bounce rates, and user journeys</li>
                <li><strong>Error tracking:</strong> Identify and fix technical issues</li>
                <li><strong>A/B testing:</strong> Test different website versions</li>
              </ul>

              <h3>Functionality Cookies</h3>
              <p>Remember your preferences and settings.</p>
              <ul>
                <li><strong>Language preferences:</strong> Remember your language selection</li>
                <li><strong>Theme settings:</strong> Remember dark/light mode preference</li>
                <li><strong>Form data:</strong> Auto-fill form information</li>
              </ul>

              <h3>Marketing Cookies</h3>
              <p>Used to deliver relevant advertisements.</p>
              <ul>
                <li><strong>Advertising:</strong> Show relevant ads based on your interests</li>
                <li><strong>Conversion tracking:</strong> Measure ad effectiveness</li>
                <li><strong>Retargeting:</strong> Reach you on other platforms</li>
              </ul>
            </section>

            <section>
              <h2>3. Third-Party Cookies</h2>
              <p>We use services from third parties that may set their own cookies:</p>
              <ul>
                <li><strong>Google Analytics:</strong> Website analytics and performance tracking</li>
                <li><strong>Intercom:</strong> Customer support and live chat</li>
                <li><strong>Mixpanel:</strong> User behavior analytics</li>
                <li><strong>Google Ads:</strong> Advertising and conversion tracking</li>
              </ul>
              <p>
                These third parties have their own privacy policies and cookie policies. We recommend reviewing their policies for more information.
              </p>
            </section>

            <section>
              <h2>4. How Long Do Cookies Last?</h2>
              <ul>
                <li><strong>Session cookies:</strong> Deleted when you close your browser</li>
                <li><strong>Persistent cookies:</strong> Remain until they expire or you delete them</li>
                <li><strong>Typical expiration:</strong> 30 days to 2 years</li>
              </ul>
            </section>

            <section>
              <h2>5. Managing Your Cookie Preferences</h2>
              <p>
                You can manage your cookie preferences in multiple ways:
              </p>
              
              <h3>Browser Settings</h3>
              <p>
                Most browsers allow you to:
              </p>
              <ul>
                <li>View what cookies are stored</li>
                <li>Delete specific or all cookies</li>
                <li>Block cookies from all or certain sites</li>
                <li>Block third-party cookies</li>
                <li>Clear all cookies when you close the browser</li>
              </ul>
              <p className="text-sm text-black">
                Note: Blocking essential cookies may affect website functionality.
              </p>

              <h3>Cookie Consent Banner</h3>
              <p>
                When you first visit our website, you can accept or customize your cookie preferences through our consent banner.
              </p>

              <h3>Privacy Settings</h3>
              <p>
                You can also manage your preferences in your account settings.
              </p>
            </section>

            <section>
              <h2>6. Updates to This Policy</h2>
              <p>
                We may update this Cookie Policy periodically. Changes will be posted on this page with an updated revision date.
              </p>
            </section>

            <section>
              <h2>7. Contact Us</h2>
              <p>
                For questions about our use of cookies, please contact us:
              </p>
              <p className="mt-2">
                <strong>Email:</strong> <a href="mailto:privacy@avenize.com" className="text-indigo-600 hover:underline">privacy@avenize.com</a>
              </p>
            </section>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/privacy"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border border-black/10 text-black rounded-xl font-medium hover:bg-black/10 transition"
          >
            <Settings size={18} />
            Privacy Policy
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#202124] text-white rounded-xl font-medium hover:bg-black/90 transition"
          >
            Contact Us
          </Link>
        </div>

        {/* Footer Links */}
        <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm">
          <Link to="/terms" className="text-black hover:text-black">Terms of Service</Link>
          <Link to="/privacy" className="text-black hover:text-black">Privacy Policy</Link>
          <Link to="/contact" className="text-black hover:text-black">Contact Us</Link>
        </div>
      </main>
    </div>
  )
}
