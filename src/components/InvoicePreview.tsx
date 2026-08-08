import { Invoice } from '../pages/FinanceNigeria'
import { useBranding } from '../lib/BrandingContext'

interface InvoicePreviewProps {
  invoice: Invoice
  onClose: () => void
  onSendEmail: () => void
  onDownloadPDF: () => void
  onGeneratePaymentLink: () => void
}

export default function InvoicePreview({ invoice, onClose, onSendEmail, onDownloadPDF, onGeneratePaymentLink }: InvoicePreviewProps) {
  const { branding } = useBranding()
  const companyName = branding.custom_name || 'Your Business'
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(amount)
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-white text-black',
    sent: 'bg-blue-100 text-blue-700',
    partially_paid: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-white text-black',
  }

  return (
    <div className="fixed inset-0 bg-black/100 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-lg">Invoice Preview</h2>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[invoice.status]}`}>
              {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
            </span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-lg text-black">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2 p-4 border-b border-white bg-white">
          <button onClick={onDownloadPDF} className="flex items-center gap-2 px-4 py-2 bg-[#4285F4] text-white rounded-lg text-sm font-medium hover:bg-[#4285F4] transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PDF
          </button>
          <button onClick={onSendEmail} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Send Email
          </button>
          <button onClick={onGeneratePaymentLink} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Payment Link
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-white">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-3xl mx-auto">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h1 className="text-2xl font-bold text-black">INVOICE</h1>
                <p className="text-black text-sm mt-1">{invoice.invoice_number}</p>
                {invoice.is_proforma && <span className="inline-block mt-2 px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded">PROFORMA</span>}
              </div>
              <div className="text-right">
                {branding.logo_url ? (
                  <img src={branding.logo_url} alt="Logo" className="h-10 w-auto object-contain mb-2 ml-auto" />
                ) : null}
                <h2 className="font-bold text-xl">{companyName}</h2>
                {branding.custom_tagline && <p className="text-black text-sm">{branding.custom_tagline}</p>}
                {branding.address && <p className="text-black text-sm">{branding.address}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-sm text-black mb-1">Bill To</p>
                <p className="font-semibold text-black">{invoice.client_name}</p>
                {invoice.client_address && <p className="text-black text-sm">{invoice.client_address}</p>}
                {invoice.client_email && <p className="text-black text-sm">{invoice.client_email}</p>}
                {invoice.job_reference && <p className="text-black text-sm mt-2">Job Ref: {invoice.job_reference}</p>}
              </div>
              <div className="text-right">
                <div className="mb-2">
                  <p className="text-sm text-black">Issue Date</p>
                  <p className="font-medium">{new Date(invoice.issue_date).toLocaleDateString('en-NG')}</p>
                </div>
                <div>
                  <p className="text-sm text-black">Due Date</p>
                  <p className="font-medium">{new Date(invoice.due_date).toLocaleDateString('en-NG')}</p>
                </div>
              </div>
            </div>

            <table className="w-full mb-8">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="text-left py-3 text-sm font-semibold text-black">Description</th>
                  <th className="text-center py-3 text-sm font-semibold text-black w-20">Qty</th>
                  <th className="text-right py-3 text-sm font-semibold text-black w-32">Unit Price</th>
                  <th className="text-right py-3 text-sm font-semibold text-black w-32">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr key={i} className="border-b border-white">
                    <td className="py-3 text-sm text-black">{item.description}</td>
                    <td className="py-3 text-sm text-black text-center">{item.quantity}</td>
                    <td className="py-3 text-sm text-black text-right">{formatCurrency(item.unit_price)}</td>
                    <td className="py-3 text-sm text-black text-right font-medium">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end mb-8">
              <div className="w-64">
                <div className="flex justify-between py-2 text-sm">
                  <span className="text-black">Subtotal</span>
                  <span className="text-black">{formatCurrency(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between py-2 text-sm">
                  <span className="text-black">VAT (7.5%)</span>
                  <span className="text-black">{formatCurrency(invoice.vat_amount)}</span>
                </div>
                {invoice.wht_amount > 0 && (
                  <div className="flex justify-between py-2 text-sm">
                    <span className="text-black">WHT ({invoice.wht_rate * 100}%)</span>
                    <span className="text-black">-{formatCurrency(invoice.wht_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between py-3 border-t-2 border-black font-bold text-lg">
                  <span>Total</span>
                  <span className="text-[#4285F4]">{formatCurrency(invoice.total)}</span>
                </div>
                {invoice.amount_paid > 0 && (
                  <>
                    <div className="flex justify-between py-2 text-sm">
                      <span className="text-black">Paid</span>
                      <span className="text-green-600">-{formatCurrency(invoice.amount_paid)}</span>
                    </div>
                    <div className="flex justify-between py-2 text-sm font-bold">
                      <span>Balance Due</span>
                      <span className="text-red-600">{formatCurrency(invoice.balance)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {invoice.notes && (
              <div className="border-t border-black pt-4">
                <p className="text-sm text-black mb-1">Notes</p>
                <p className="text-sm text-black">{invoice.notes}</p>
              </div>
            )}

            <div className="mt-8 pt-4 border-t border-black text-center text-xs text-black">
              <p>Thank you for your business!</p>
              {branding.website && <p className="mt-1">{branding.website}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
