import { Link } from 'react-router-dom'
import { ArrowLeft, Shield, Lock, Eye, FileText, Mail } from 'lucide-react'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-black hover:text-[#4285F4] transition">
            <ArrowLeft size={20} />
            <span className="font-medium">Back</span>
          </Link>
          <h1 className="text-lg font-semibold text-black">Privacy Policy</h1>
          <div className="w-20"></div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-black/5 p-8 md:p-12">
          {/* Title */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-[#4285F4]/10 rounded-full mb-4">
              <Shield className="w-8 h-8 text-[#4285F4]" />
            </div>
            <h1 className="text-3xl font-bold text-black mb-2">Privacy Policy</h1>
            <p className="text-black">Last updated: August 3, 2026</p>
          </div>

          {/* Quick Summary */}
          <div className="grid md:grid-cols-3 gap-4 mb-12">
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <Lock className="w-6 h-6 text-green-600 mx-auto mb-2" />
              <h3 className="font-semibold text-green-800">Your Data is Secure</h3>
              <p className="text-sm text-green-700 mt-1">256-bit encryption protects all data</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <Eye className="w-6 h-6 text-blue-600 mx-auto mb-2" />
              <h3 className="font-semibold text-blue-800">We Don't Sell Data</h3>
              <p className="text-sm text-blue-700 mt-1">Your information stays private</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-4 text-center">
              <FileText className="w-6 h-6 text-purple-600 mx-auto mb-2" />
              <h3 className="font-semibold text-purple-800">GDPR Compliant</h3>
              <p className="text-sm text-purple-700 mt-1">Full EU compliance</p>
            </div>
          </div>

          {/* Sections */}
          <div className="prose prose-slate max-w-none space-y-8">
            <section>
              <h2>1. Information We Collect</h2>
              <p>
                We collect information you provide directly to us, including:
              </p>
              <ul>
                <li><strong>Account Information:</strong> Name, email address, phone number, company name, and profile picture when you sign up</li>
                <li><strong>Business Data:</strong> Customer records, deals, invoices, projects, tasks, and other business information you choose to store</li>
                <li><strong>Usage Information:</strong> How you interact with our platform, features you use, and time spent</li>
                <li><strong>Device Information:</strong> Browser type, operating system, and device identifiers</li>
              </ul>
            </section>

            <section>
              <h2>2. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul>
                <li>Provide, maintain, and improve our services</li>
                <li>Process transactions and send related information</li>
                <li>Send technical notices, updates, and support messages</li>
                <li>Respond to your comments, questions, and requests</li>
                <li>Monitor and analyze trends, usage, and activities</li>
                <li>Detect, investigate, and prevent fraudulent or unauthorized activities</li>
              </ul>
            </section>

            <section>
              <h2>3. Information Sharing</h2>
              <p>
                We do not sell, trade, or otherwise transfer your personal information to third parties, except in the following circumstances:
              </p>
              <ul>
                <li><strong>With Your Consent:</strong> When you have given explicit permission</li>
                <li><strong>Service Providers:</strong> Trusted third parties who assist in operating our platform (hosting, analytics, payment processing)</li>
                <li><strong>Legal Requirements:</strong> When required by law, court order, or governmental regulation</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              </ul>
            </section>

            <section>
              <h2>4. Data Security</h2>
              <p>
                We implement industry-standard security measures to protect your data:
              </p>
              <ul>
                <li>256-bit SSL/TLS encryption for data in transit</li>
                <li>AES-256 encryption for data at rest</li>
                <li>Regular security audits and penetration testing</li>
                <li>SOC 2 Type II certified infrastructure</li>
                <li>Multi-factor authentication support</li>
                <li>Automatic session timeout</li>
              </ul>
            </section>

            <section>
              <h2>5. Cookies and Tracking</h2>
              <p>
                We use cookies and similar tracking technologies to:
              </p>
              <ul>
                <li>Remember your preferences and settings</li>
                <li>Understand how you use our platform</li>
                <li>Deliver personalized content and advertisements</li>
                <li>Improve our services</li>
              </ul>
              <p>
                You can control cookies through your browser settings. Disabling cookies may affect functionality.
              </p>
            </section>

            <section>
              <h2>6. Your Rights (GDPR & CCPA)</h2>
              <p>
                Depending on your location, you may have the right to:
              </p>
              <ul>
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Correction:</strong> Request correction of inaccurate data</li>
                <li><strong>Deletion:</strong> Request deletion of your data</li>
                <li><strong>Portability:</strong> Receive your data in a portable format</li>
                <li><strong>Object:</strong> Object to certain processing activities</li>
                <li><strong>Restrict:</strong> Request restricted processing</li>
              </ul>
              <p>
                To exercise these rights, contact us at <a href="mailto:privacy@avenize.com" className="text-[#4285F4] hover:underline">privacy@avenize.com</a>.
              </p>
            </section>

            <section>
              <h2>7. Data Retention</h2>
              <p>
                We retain your information for as long as your account is active or as needed to provide services. You may request deletion of your data at any time. We may retain certain information for legal, compliance, or fraud prevention purposes.
              </p>
            </section>

            <section>
              <h2>8. Children's Privacy</h2>
              <p>
                Our services are not directed to individuals under 18 years of age. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately.
              </p>
            </section>

            <section>
              <h2>9. International Transfers</h2>
              <p>
                Your information may be transferred to and processed in countries other than your country of residence. We ensure appropriate safeguards are in place for such transfers, including Standard Contractual Clauses.
              </p>
            </section>

            <section>
              <h2>10. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last updated" date. Your continued use of our services after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2>11. Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy or our privacy practices, please contact us:
              </p>
              <div className="bg-white rounded-xl p-4 mt-4">
                <p className="font-medium text-black">Avenize, Inc.</p>
                <p>123 Business Avenue, Suite 400</p>
                <p>San Francisco, CA 94105</p>
                <p className="mt-2">
                  <a href="mailto:privacy@avenize.com" className="text-[#4285F4] hover:underline inline-flex items-center gap-1">
                    <Mail size={14} />
                    privacy@avenize.com
                  </a>
                </p>
              </div>
            </section>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm">
          <Link to="/terms" className="text-black hover:text-black">Terms of Service</Link>
          <Link to="/cookies" className="text-black hover:text-black">Cookie Policy</Link>
          <Link to="/contact" className="text-black hover:text-black">Contact Us</Link>
          <Link to="/signup" className="text-black hover:text-black">Sign Up</Link>
        </div>
      </main>
    </div>
  )
}
