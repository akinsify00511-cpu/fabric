import { supabase } from './supabase'

// jsPDF and autoTable are dynamically imported so the 137KB (gzip) PDF library
// only loads when a user actually generates a PDF — not on every page load.
// This keeps it out of the initial bundle and modulepreload chain.

interface InvoiceItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

interface QuoteData {
  quote_number: string
  client_name: string
  client_email?: string
  client_address?: string
  title: string
  items: InvoiceItem[]
  subtotal: number
  vat_amount: number
  total: number
  valid_until: string
  issue_date?: string
  business_id?: string
}

interface InvoiceData {
  invoice_number: string
  client_name: string
  client_email?: string
  client_address?: string
  items: InvoiceItem[]
  subtotal: number
  vat_amount: number
  wht_amount?: number
  total: number
  amount_paid?: number
  balance?: number
  status: string
  issue_date: string
  due_date: string
  job_reference?: string
  notes?: string
  business_id?: string
}

interface BrandingData {
  custom_name: string | null
  custom_tagline: string | null
  logo_url: string | null
  address: string | null
  website: string | null
  email: string | null
  phone: string | null
}

async function getBranding(businessId?: string): Promise<BrandingData> {
  if (!businessId) {
    return {
      custom_name: null,
      custom_tagline: null,
      logo_url: null,
      address: null,
      website: null,
      email: null,
      phone: null,
    }
  }
  
  const { data } = await supabase
    .from('business_branding')
    .select('custom_name, custom_tagline, logo_url, address, website, email, phone')
    .eq('business_id', businessId)
    .single()
  
  return data || {
    custom_name: null,
    custom_tagline: null,
    logo_url: null,
    address: null,
    website: null,
    email: null,
    phone: null,
  }
}

export async function generateQuotePDF(quote: QuoteData): Promise<void> {
  const branding = await getBranding(quote.business_id)
  const companyName = branding.custom_name || 'Your Business'
  const tagline = branding.custom_tagline || ''
  const address = branding.address || ''
  
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()
  
  // Header
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('QUOTE', 20, 30)
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`Quote #: ${quote.quote_number}`, 20, 40)
  doc.text(`Date: ${quote.issue_date ? new Date(quote.issue_date).toLocaleDateString() : new Date().toLocaleDateString()}`, 20, 47)
  doc.text(`Valid Until: ${new Date(quote.valid_until).toLocaleDateString()}`, 20, 54)
  
  // Company info
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(companyName, 140, 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  if (tagline) doc.text(tagline, 140, 37)
  if (address) doc.text(address, 140, tagline ? 44 : 37)
  if (branding.email) doc.text(branding.email, 140, (tagline ? 44 : 37) + (address ? 7 : 0))
  if (branding.phone) doc.text(branding.phone, 140, (tagline ? 44 : 37) + (address ? 14 : 7))
  
  // Bill To
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Bill To:', 20, 75)
  doc.setFont('helvetica', 'normal')
  doc.text(quote.client_name, 20, 82)
  if (quote.client_address) {
    doc.text(quote.client_address, 20, 89)
  }
  if (quote.client_email) {
    doc.text(quote.client_email, 20, 96)
  }
  
  // Title
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(quote.title, 20, 115)
  
  // Items table
  const tableData = quote.items.map(item => [
    item.description,
    item.quantity.toString(),
    `₦${item.unit_price.toLocaleString()}`,
    `₦${item.total.toLocaleString()}`
  ])
  
  autoTable(doc, {
    startY: 125,
    head: [['Description', 'Qty', 'Unit Price', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229] },
    columnStyles: {
      0: { cellWidth: 90 },
      3: { halign: 'right' },
    },
    margin: { left: 20, right: 20 },
  })
  
  // Get final Y position after table
  const finalY = (doc as any).lastAutoTable.finalY + 10
  
  // Totals
  doc.setFontSize(11)
  const totalsX = 130
  doc.text('Subtotal:', totalsX, finalY)
  doc.text(`₦${quote.subtotal.toLocaleString()}`, 190, finalY, { align: 'right' })
  
  doc.text('VAT (7.5%):', totalsX, finalY + 8)
  doc.text(`₦${quote.vat_amount.toLocaleString()}`, 190, finalY + 8, { align: 'right' })
  
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Total:', totalsX, finalY + 20)
  doc.setTextColor(79, 70, 229)
  doc.text(`₦${quote.total.toLocaleString()}`, 190, finalY + 20, { align: 'right' })
  doc.setTextColor(0, 0, 0)
  
  // Footer
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(128, 128, 128)
  doc.text('Thank you for your business!', 105, finalY + 45, { align: 'center' })
  if (branding.website) doc.text(branding.website, 105, finalY + 52, { align: 'center' })
  
  // Save
  doc.save(`Quote-${quote.quote_number}.pdf`)
}

export async function generateInvoicePDF(invoice: InvoiceData): Promise<void> {
  const branding = await getBranding(invoice.business_id)
  const companyName = branding.custom_name || 'Your Business'
  const tagline = branding.custom_tagline || ''
  const address = branding.address || ''
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()
  
  // Header
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('INVOICE', 20, 30)
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`Invoice #: ${invoice.invoice_number}`, 20, 40)
  doc.text(`Issue Date: ${new Date(invoice.issue_date).toLocaleDateString()}`, 20, 47)
  doc.text(`Due Date: ${new Date(invoice.due_date).toLocaleDateString()}`, 20, 54)
  
  // Company info
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(companyName, 140, 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  if (tagline) doc.text(tagline, 140, 37)
  if (address) doc.text(address, 140, tagline ? 44 : 37)
  if (branding.email) doc.text(branding.email, 140, (tagline ? 44 : 37) + (address ? 7 : 0))
  if (branding.phone) doc.text(branding.phone, 140, (tagline ? 44 : 37) + (address ? 14 : 7))
  
  // Status badge
  const statusColors: Record<string, number[]> = {
    paid: [34, 197, 94],
    partially_paid: [234, 179, 8],
    sent: [59, 130, 246],
    overdue: [239, 68, 68],
    draft: [156, 163, 175],
  }
  const statusColor = statusColors[invoice.status] || [156, 163, 175]
  
  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2])
  doc.roundedRect(140, 50, 50, 10, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.text(invoice.status.toUpperCase().replace('_', ' '), 165, 57, { align: 'center' })
  doc.setTextColor(0, 0, 0)
  
  // Bill To
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Bill To:', 20, 75)
  doc.setFont('helvetica', 'normal')
  doc.text(invoice.client_name, 20, 82)
  if (invoice.client_address) {
    doc.text(invoice.client_address, 20, 89)
  }
  if (invoice.client_email) {
    doc.text(invoice.client_email, 20, 96)
  }
  if (invoice.job_reference) {
    doc.text(`Job Ref: ${invoice.job_reference}`, 20, 103)
  }
  
  // Items table
  const tableData = invoice.items.map(item => [
    item.description,
    item.quantity.toString(),
    `₦${item.unit_price.toLocaleString()}`,
    `₦${item.total.toLocaleString()}`
  ])
  
  autoTable(doc, {
    startY: 115,
    head: [['Description', 'Qty', 'Unit Price', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229] },
    columnStyles: {
      0: { cellWidth: 90 },
      3: { halign: 'right' },
    },
    margin: { left: 20, right: 20 },
  })
  
  const finalY = (doc as any).lastAutoTable.finalY + 10
  
  // Totals
  doc.setFontSize(11)
  const totalsX = 130
  
  doc.text('Subtotal:', totalsX, finalY)
  doc.text(`₦${invoice.subtotal.toLocaleString()}`, 190, finalY, { align: 'right' })
  
  doc.text('VAT (7.5%):', totalsX, finalY + 8)
  doc.text(`₦${invoice.vat_amount.toLocaleString()}`, 190, finalY + 8, { align: 'right' })
  
  if (invoice.wht_amount && invoice.wht_amount > 0) {
    doc.text('WHT (-):', totalsX, finalY + 16)
    doc.text(`₦${invoice.wht_amount.toLocaleString()}`, 190, finalY + 16, { align: 'right' })
  }
  
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Total:', totalsX, finalY + 28)
  doc.setTextColor(79, 70, 229)
  doc.text(`₦${invoice.total.toLocaleString()}`, 190, finalY + 28, { align: 'right' })
  doc.setTextColor(0, 0, 0)
  
  if (invoice.amount_paid && invoice.amount_paid > 0) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text('Paid:', totalsX, finalY + 40)
    doc.setTextColor(34, 197, 94)
    doc.text(`-₦${invoice.amount_paid.toLocaleString()}`, 190, finalY + 40, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Balance Due:', totalsX, finalY + 50)
    doc.setTextColor(239, 68, 68)
    doc.text(`₦${(invoice.balance || 0).toLocaleString()}`, 190, finalY + 50, { align: 'right' })
    doc.setTextColor(0, 0, 0)
  }
  
  // Notes
  if (invoice.notes) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Notes:', 20, finalY + 65)
    doc.setFont('helvetica', 'normal')
    doc.text(invoice.notes, 20, finalY + 72)
  }
  
  // Footer
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(128, 128, 128)
  doc.text('Thank you for your business!', 105, finalY + 85, { align: 'center' })
  if (branding.website) doc.text(branding.website, 105, finalY + 92, { align: 'center' })
  
  doc.save(`Invoice-${invoice.invoice_number}.pdf`)
}
