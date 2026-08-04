import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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
}

export function generateQuotePDF(quote: QuoteData): void {
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
  doc.text('Avenize', 140, 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Your Business Partner', 140, 37)
  doc.text('Lagos, Nigeria', 140, 44)
  
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
  doc.text('Avenize - One app for your whole business', 105, finalY + 52, { align: 'center' })
  
  // Save
  doc.save(`Quote-${quote.quote_number}.pdf`)
}

export function generateInvoicePDF(invoice: InvoiceData): void {
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
  doc.text('Avenize', 140, 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Your Business Partner', 140, 37)
  doc.text('Lagos, Nigeria', 140, 44)
  
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
  doc.text('Avenize - One app for your whole business', 105, finalY + 92, { align: 'center' })
  
  doc.save(`Invoice-${invoice.invoice_number}.pdf`)
}
