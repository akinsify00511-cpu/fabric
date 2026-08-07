// Data Export Utilities
// Export data to CSV, PDF formats
// Note: For Excel export, install xlsx: npm install xlsx @types/xlsx

// ============================================
// CSV EXPORT
// ============================================

export interface CSVColumn {
  key: string
  header: string
  format?: (value: any, row: any) => string
}

export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  columns: CSVColumn[],
  filename: string = 'export'
): void {
  // Generate header row
  const headers = columns.map(col => escapeCSV(col.header)).join(',')

  // Generate data rows
  const rows = data.map(row => {
    return columns.map(col => {
      const value = getNestedValue(row, col.key)
      const formatted = col.format ? col.format(value, row) : value
      return escapeCSV(String(formatted ?? ''))
    }).join(',')
  })

  // Combine and download
  const csv = [headers, ...rows].join('\n')
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`)
}

// Helper to get nested object values
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj)
}

// Escape CSV special characters
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// ============================================
// EXCEL EXPORT (XLSX)
// ============================================

// Note: For Excel export, install xlsx: npm install xlsx @types/xlsx
// Then uncomment this function and the xlsx import
export async function exportToExcel(
  data: Record<string, any>[],
  columns: CSVColumn[],
  filename: string = 'export',
  _sheetName: string = 'Sheet1'
): Promise<void> {
  // xlsx library not installed - fallback to CSV
  // To enable Excel export:
  // 1. npm install xlsx @types/xlsx
  // 2. Uncomment the Excel implementation below
  console.warn('Excel export requires xlsx library. Falling back to CSV.')
  exportToCSV(data as any, columns, filename)
}

/*
// Uncomment this code after installing xlsx:
// import type * as XLSX from 'xlsx'
// const XLSX = await import('xlsx')
// ... implementation using XLSX.utils.json_to_sheet() ...
*/

// ============================================
// PDF EXPORT
// ============================================

export async function exportToPDF(
  data: Record<string, any>[],
  columns: CSVColumn[],
  options: {
    title?: string
    filename?: string
    orientation?: 'portrait' | 'landscape'
    includeDate?: boolean
  } = {}
): Promise<void> {
  try {
    const { default: jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default

    const doc = new jsPDF({
      orientation: options.orientation || 'landscape',
      unit: 'mm',
      format: 'a4',
    })

    // Add title
    if (options.title) {
      doc.setFontSize(18)
      doc.setTextColor(33, 33, 33)
      doc.text(options.title, 14, 22)
    }

    // Add date
    if (options.includeDate !== false) {
      doc.setFontSize(10)
      doc.setTextColor(128, 128, 128)
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, options.title ? 30 : 14)
    }

    // Prepare table data
    const headers = [columns.map(col => col.header)]
    const body = data.map(row => 
      columns.map(col => {
        const value = getNestedValue(row, col.key)
        return col.format ? col.format(value, row) : String(value ?? '')
      })
    )

    // Generate table
    autoTable(doc, {
      head: headers,
      body: body,
      startY: options.title ? 36 : 20,
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [33, 33, 33],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
    })

    // Download
    doc.save(`${options.filename || 'export'}.pdf`)
  } catch (error) {
    console.error('PDF export failed:', error)
    throw error
  }
}

// ============================================
// INVOICE PDF EXPORT
// ============================================

export async function exportInvoiceToPDF(invoice: {
  invoice_number: string
  customer_name: string
  customer_email: string
  customer_address?: string
  items: { description: string; quantity: number; unit_price: number; total: number }[]
  subtotal: number
  tax?: number
  total: number
  due_date: string
  notes?: string
}): Promise<void> {
  try {
    const { default: jsPDF } = await import('jspdf')

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20

    // Header
    doc.setFontSize(24)
    doc.setTextColor(33, 33, 33)
    doc.text('INVOICE', pageWidth - margin, 30, { align: 'right' })

    doc.setFontSize(12)
    doc.setTextColor(100, 100, 100)
    doc.text(`Invoice #${invoice.invoice_number}`, pageWidth - margin, 38, { align: 'right' })

    // Bill To
    doc.setFontSize(10)
    doc.setTextColor(33, 33, 33)
    doc.text('Bill To:', margin, 50)

    doc.setFontSize(11)
    doc.text(invoice.customer_name, margin, 58)
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(invoice.customer_email, margin, 65)
    if (invoice.customer_address) {
      const addressLines = invoice.customer_address.split('\n')
      addressLines.forEach((line, i) => {
        doc.text(line, margin, 72 + (i * 5))
      })
    }

    // Due Date
    doc.setTextColor(33, 33, 33)
    doc.text('Due Date:', pageWidth - margin - 60, 50)
    doc.text(new Date(invoice.due_date).toLocaleDateString(), pageWidth - margin, 58, { align: 'right' })

    // Items table
    const tableStartY = invoice.customer_address ? 90 : 80

    // Table header
    doc.setFillColor(33, 33, 33)
    doc.rect(margin, tableStartY, pageWidth - (margin * 2), 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9)
    doc.text('Description', margin + 3, tableStartY + 5.5)
    doc.text('Qty', pageWidth - margin - 60, tableStartY + 5.5, { align: 'center' })
    doc.text('Unit Price', pageWidth - margin - 35, tableStartY + 5.5, { align: 'right' })
    doc.text('Total', pageWidth - margin - 3, tableStartY + 5.5, { align: 'right' })

    // Table rows
    let y = tableStartY + 12
    doc.setTextColor(33, 33, 33)
    
    invoice.items.forEach((item, index) => {
      if (index % 2 === 1) {
        doc.setFillColor(245, 245, 245)
        doc.rect(margin, tableStartY + 8 + (index * 10), pageWidth - (margin * 2), 10, 'F')
      }
      
      doc.text(item.description, margin + 3, y)
      doc.text(String(item.quantity), pageWidth - margin - 60, y, { align: 'center' })
      doc.text(`₦${item.unit_price.toLocaleString()}`, pageWidth - margin - 35, y, { align: 'right' })
      doc.text(`₦${item.total.toLocaleString()}`, pageWidth - margin - 3, y, { align: 'right' })
      y += 10
    })

    // Totals
    y += 10
    doc.setDrawColor(200, 200, 200)
    doc.line(pageWidth - margin - 70, y - 5, pageWidth - margin, y - 5)

    doc.setTextColor(100, 100, 100)
    doc.text('Subtotal:', pageWidth - margin - 70, y)
    doc.setTextColor(33, 33, 33)
    doc.text(`₦${invoice.subtotal.toLocaleString()}`, pageWidth - margin - 3, y, { align: 'right' })

    if (invoice.tax) {
      y += 8
      doc.setTextColor(100, 100, 100)
      doc.text('Tax:', pageWidth - margin - 70, y)
      doc.setTextColor(33, 33, 33)
      doc.text(`₦${invoice.tax.toLocaleString()}`, pageWidth - margin - 3, y, { align: 'right' })
    }

    y += 10
    doc.setFontSize(12)
    doc.setTextColor(33, 33, 33)
    doc.text('Total:', pageWidth - margin - 70, y)
    doc.text(`₦${invoice.total.toLocaleString()}`, pageWidth - margin - 3, y, { align: 'right' })

    // Notes
    if (invoice.notes) {
      y += 20
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text('Notes:', margin, y)
      doc.setTextColor(33, 33, 33)
      doc.text(invoice.notes, margin, y + 7)
    }

    // Footer
    doc.setFontSize(9)
    doc.setTextColor(128, 128, 128)
    doc.text('Generated by Avenize', pageWidth / 2, 285, { align: 'center' })

    // Download
    doc.save(`invoice-${invoice.invoice_number}.pdf`)
  } catch (error) {
    console.error('Invoice PDF export failed:', error)
    throw error
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Common formatters
export const Formatters = {
  date: (value: any) => {
    if (!value) return ''
    return new Date(value).toLocaleDateString()
  },
  
  datetime: (value: any) => {
    if (!value) return ''
    return new Date(value).toLocaleString()
  },
  
  currency: (value: any, currency: string = 'NGN') => {
    if (value === null || value === undefined) return ''
    const symbols: Record<string, string> = {
      NGN: '₦', USD: '$', EUR: '€', GBP: '£'
    }
    return `${symbols[currency] || currency}${Number(value).toLocaleString()}`
  },
  
  percentage: (value: any) => {
    if (value === null || value === undefined) return ''
    return `${Number(value).toFixed(1)}%`
  },
  
  boolean: (value: any, trueText: string = 'Yes', falseText: string = 'No') => {
    return value ? trueText : falseText
  },
  
  truncate: (value: any, maxLength: number = 50) => {
    if (!value) return ''
    const str = String(value)
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str
  },
}
