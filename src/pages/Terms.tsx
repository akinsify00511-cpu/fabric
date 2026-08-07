import { Link } from 'react-router-dom'
import { ArrowLeft, FileText, AlertTriangle, Scale, Users, Mail } from 'lucide-react'

export default function Terms() {
  return (
    <div className="min-h-screen bg-[var(--avenize-offwhite)]">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-gray-900 hover:text-indigo-600 transition">
            <ArrowLeft size={20} />
            <span className="font-medium">Back</span>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">Terms of Service</h1>
          <div className="w-20"></div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-black/5 p-8 md:p-12">
          {/* Title */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
              <Scale className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
            <p className="text-gray-500">Last updated: August 3, 2026</p>
          </div>

          {/* Important Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <strong>Important:</strong> By using Avenize, you agree to these Terms of Service. Please read them carefully before using our platform.
            </p>
          </div>

          {/* Sections */}
          <div className="prose prose-slate max-w-none space-y-8">
            <section>
              <h2>1. Acceptance of Terms</h2>
              <p>
                By accessing and using Avenize ("the Service"), you accept and agree to be bound by the terms and conditions of this agreement. If you do not agree to these terms, you may not use the Service.
              </p>
              <p>
                These Terms of Service ("Terms") apply to all users of Avenize, including but not limited to browsers, customers, merchants, and contributors of content.
              </p>
            </section>

            <section>
              <h2>2. Description of Service</h2>
              <p>
                Avenize is a business management platform that provides:
              </p>
              <ul>
                <li>Customer Relationship Management (CRM)</li>
                <li>Project Management</li>
                <li>Finance and Accounting tools</li>
                <li>Team Collaboration features</li>
                <li>Automation and workflow tools</li>
                <li>Reporting and analytics</li>
              </ul>
              <p>
                We reserve the right to modify, suspend, or discontinue any part of the Service at any time without prior notice.
              </p>
            </section>

            <section>
              <h2>3. User Accounts</h2>
              <p>
                To access certain features, you must create an account. You agree to:
              </p>
              <ul>
                <li>Provide accurate, current, and complete information</li>
                <li>Maintain and update your information to keep it accurate</li>
                <li>Keep your password secure and confidential</li>
                <li>Notify us immediately of any unauthorized access</li>
                <li>Be responsible for all activities under your account</li>
              </ul>
              <p>
                We reserve the right to suspend or terminate accounts that violate these terms or engage in prohibited activities.
              </p>
            </section>

            <section>
              <h2>4. Acceptable Use</h2>
              <p>
                You agree NOT to use the Service to:
              </p>
              <ul>
                <li>Violate any laws, regulations, or third-party rights</li>
                <li>Upload or transmit viruses, malware, or harmful code</li>
                <li>Attempt to gain unauthorized access to any systems</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Collect user information without consent</li>
                <li>Send spam, unsolicited communications, or promotional content</li>
                <li>Impersonate any person or entity</li>
                <li>Engage in any activity that could damage our reputation</li>
              </ul>
            </section>

            <section>
              <h2>5. Data and Content</h2>
              <p>
                <strong>Your Data:</strong> You retain ownership of all data, content, and information you submit to the Service ("User Content"). By submitting User Content, you grant us a license to use, store, and process it to provide the Service.
              </p>
              <p>
                <strong>Backups:</strong> We perform regular backups of your data but cannot guarantee data recovery in all circumstances.
              </p>
              <p>
                <strong>Export:</strong> You can export your data at any time through the Service's export features.
              </p>
            </section>

            <section>
              <h2>6. Intellectual Property</h2>
              <p>
                The Service and its original content, features, and functionality are owned by Avenize, Inc. and are protected by international copyright, trademark, patent, and other intellectual property laws.
              </p>
              <p>
                You may not copy, modify, distribute, sell, or lease any part of the Service without our written permission.
              </p>
            </section>

            <section>
              <h2>7. Subscription and Payments</h2>
              <p>
                <strong>Free Tier:</strong> We offer a free tier with limited features. Usage beyond these limits requires a paid subscription.
              </p>
              <p>
                <strong>Paid Plans:</strong> Paid subscriptions are billed according to the plan selected. All fees are non-refundable except as required by law.
              </p>
              <p>
                <strong>Billing:</strong> Subscriptions automatically renew unless cancelled before the renewal date. You authorize us to charge the applicable fees to your designated payment method.
              </p>
              <p>
                <strong>Price Changes:</strong> We may change pricing with 30 days notice before the next billing cycle.
              </p>
            </section>

            <section>
              <h2>8. Cancellation and Termination</h2>
              <p>
                You may cancel your subscription at any time through your account settings. Upon cancellation:
              </p>
              <ul>
                <li>Access to paid features ends at the current billing period</li>
                <li>Your data is retained for 30 days</li>
                <li>After 30 days, data may be permanently deleted</li>
              </ul>
              <p>
                We reserve the right to terminate or suspend access immediately for violations of these Terms.
              </p>
            </section>

            <section>
              <h2>9. Disclaimer of Warranties</h2>
              <p>
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT WARRANT THAT:
              </p>
              <ul>
                <li>The Service will be uninterrupted, secure, or error-free</li>
                <li>The results from using the Service will be accurate or reliable</li>
                <li>The quality of any products, services, or information will meet your expectations</li>
                <li>Any errors in the Service will be corrected</li>
              </ul>
            </section>

            <section>
              <h2>10. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, Avenize shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from:
              </p>
              <ul>
                <li>Your use or inability to use the Service</li>
                <li>Any unauthorized access to your data</li>
                <li>Any conduct of third parties on the Service</li>
                <li>Any errors, omissions, or inaccuracies in content</li>
              </ul>
              <p>
                Our total liability shall not exceed the amount paid by you for the Service in the 12 months preceding the claim.
              </p>
            </section>

            <section>
              <h2>11. Indemnification</h2>
              <p>
                You agree to indemnify, defend, and hold harmless Avenize and its affiliates, officers, directors, employees, and agents from any claims, damages, losses, or expenses (including legal fees) arising from:
              </p>
              <ul>
                <li>Your use of the Service</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any rights of a third party</li>
                <li>Your User Content</li>
              </ul>
            </section>

            <section>
              <h2>12. Modifications to Terms</h2>
              <p>
                We reserve the right to modify these Terms at any time. We will notify you of material changes via email or through the Service. Your continued use after changes constitutes acceptance of the new Terms.
              </p>
            </section>

            <section>
              <h2>13. Governing Law</h2>
              <p>
                These Terms shall be governed by the laws of the State of California, USA, without regard to conflict of law principles. Any disputes shall be resolved in the courts of San Francisco County, California.
              </p>
            </section>

            <section>
              <h2>14. Dispute Resolution</h2>
              <p>
                Before filing a claim, you agree to try to resolve the dispute informally by contacting us. If we cannot resolve the dispute within 60 days, either party may proceed with formal dispute resolution.
              </p>
              <p>
                For EU users, you may also use the European Commission's Online Dispute Resolution platform: <a href="https://ec.europa.eu/consumers/odr/" className="text-indigo-600 hover:underline">https://ec.europa.eu/consumers/odr/</a>
              </p>
            </section>

            <section>
              <h2>15. General Information</h2>
              <p>
                <strong>Entire Agreement:</strong> These Terms constitute the entire agreement between you and Avenize regarding your use of the Service.
              </p>
              <p>
                <strong>Severability:</strong> If any provision is found unenforceable, the remaining provisions shall remain in effect.
              </p>
              <p>
                <strong>Waiver:</strong> Our failure to enforce any right shall not constitute a waiver of that right.
              </p>
              <p>
                <strong>Assignment:</strong> We may assign these Terms without notice. You may not assign these Terms without our consent.
              </p>
            </section>

            <section>
              <h2>16. Contact Information</h2>
              <p>
                Questions about these Terms should be sent to us:
              </p>
              <div className="bg-gray-50 rounded-xl p-4 mt-4">
                <p className="font-medium text-gray-900">Avenize, Inc.</p>
                <p>123 Business Avenue, Suite 400</p>
                <p>San Francisco, CA 94105</p>
                <p className="mt-2">
                  <a href="mailto:legal@avenize.com" className="text-indigo-600 hover:underline inline-flex items-center gap-1">
                    <Mail size={14} />
                    legal@avenize.com
                  </a>
                </p>
              </div>
            </section>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm">
          <Link to="/privacy" className="text-gray-500 hover:text-gray-700">Privacy Policy</Link>
          <Link to="/cookies" className="text-gray-500 hover:text-gray-700">Cookie Policy</Link>
          <Link to="/contact" className="text-gray-500 hover:text-gray-700">Contact Us</Link>
          <Link to="/signup" className="text-gray-500 hover:text-gray-700">Sign Up</Link>
        </div>
      </main>
    </div>
  )
}
