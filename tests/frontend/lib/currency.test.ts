import { describe, it, expect } from 'vitest'

// Currency formatting and calculation helpers
// These need to be extracted to a shared lib for testing

describe('Currency Formatting', () => {
  // Test the formatting logic used throughout the app
  
  const formatNaira = (amount: number): string => {
    return '₦' + amount.toLocaleString('en-NG')
  }

  const parseNaira = (text: string): number => {
    return parseInt(text.replace(/[^0-9]/g, ''), 10) || 0
  }

  it('formats Naira correctly', () => {
    expect(formatNaira(1000)).toBe('₦1,000')
    expect(formatNaira(1000000)).toBe('₦1,000,000')
    expect(formatNaira(100)).toBe('₦100')
  })

  it('handles large numbers', () => {
    expect(formatNaira(10000000)).toBe('₦10,000,000')
    expect(formatNaira(1000000000)).toBe('₦1,000,000,000')
  })

  it('handles zero', () => {
    expect(formatNaira(0)).toBe('₦0')
  })

  it('parses Naira formatted strings', () => {
    expect(parseNaira('₦1,000')).toBe(1000)
    expect(parseNaira('₦10,000,000')).toBe(10000000)
  })
})

describe('Invoice Number Generation', () => {
  const generateInvoiceNumber = (prefix: string = 'INV'): string => {
    const year = new Date().getFullYear()
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
    return `${prefix}-${year}-${random}`
  }

  it('generates invoice with correct format', () => {
    const invoiceNumber = generateInvoiceNumber()
    expect(invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/)
  })

  it('uses current year', () => {
    const year = new Date().getFullYear()
    const invoiceNumber = generateInvoiceNumber()
    expect(invoiceNumber).toContain(String(year))
  })

  it('supports custom prefix', () => {
    const invoiceNumber = generateInvoiceNumber('QUOTE')
    expect(invoiceNumber).toMatch(/^QUOTE-\d{4}-\d{4}$/)
  })
})

describe('Percentage Calculations', () => {
  const calculatePercentage = (value: number, total: number): number => {
    if (total === 0) return 0
    return (value / total) * 100
  }

  it('calculates percentage correctly', () => {
    expect(calculatePercentage(25, 100)).toBe(25)
    expect(calculatePercentage(50, 200)).toBe(25)
  })

  it('handles zero total', () => {
    expect(calculatePercentage(10, 0)).toBe(0)
  })

  it('rounds to reasonable precision', () => {
    const result = calculatePercentage(1, 3)
    expect(result).toBeCloseTo(33.33, 1)
  })
})

describe('Date Formatting', () => {
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatDateTime = (date: Date): string => {
    return date.toLocaleString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  it('formats date correctly', () => {
    const date = new Date('2024-01-15')
    expect(formatDate(date)).toBe('15 Jan 2024')
  })

  it('formats datetime correctly', () => {
    const date = new Date('2024-01-15T14:30:00')
    const formatted = formatDateTime(date)
    expect(formatted).toContain('15 Jan 2024')
  })
})

describe('Email Validation', () => {
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  it('accepts valid emails', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name@domain.co.uk')).toBe(true)
  })

  it('rejects invalid emails', () => {
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('no@domain')).toBe(false)
    expect(isValidEmail('@nodomain.com')).toBe(false)
  })
})

describe('Phone Number Validation', () => {
  const isValidNigerianPhone = (phone: string): boolean => {
    // Nigerian phone numbers: 080x, 081x, 090x, etc.
    const phoneRegex = /^(\+?234|0)[789][01]\d{8}$/
    return phoneRegex.test(phone.replace(/\s/g, ''))
  }

  it('accepts valid Nigerian numbers', () => {
    expect(isValidNigerianPhone('08012345678')).toBe(true)
    expect(isValidNigerianPhone('08198765432')).toBe(true)
    expect(isValidNigerianPhone('+2348012345678')).toBe(true)
  })

  it('rejects invalid numbers', () => {
    expect(isValidNigerianPhone('1234567890')).toBe(false)
    expect(isValidNigerianPhone('abcdefghijk')).toBe(false)
  })
})

describe('Password Strength', () => {
  const calculatePasswordStrength = (password: string): {
    score: number
    feedback: string[]
  } => {
    const feedback: string[] = []
    let score = 0

    if (password.length >= 8) score += 1
    if (password.length >= 12) score += 1
    if (/[a-z]/.test(password)) score += 1
    if (/[A-Z]/.test(password)) score += 1
    if (/[0-9]/.test(password)) score += 1
    if (/[^a-zA-Z0-9]/.test(password)) score += 1

    if (password.length < 8) feedback.push('At least 8 characters')
    if (!/[a-z]/.test(password)) feedback.push('Include lowercase letters')
    if (!/[A-Z]/.test(password)) feedback.push('Include uppercase letters')
    if (!/[0-9]/.test(password)) feedback.push('Include numbers')
    if (!/[^a-zA-Z0-9]/.test(password)) feedback.push('Include special characters')

    return { score, feedback }
  }

  it('scores weak passwords low', () => {
    const { score } = calculatePasswordStrength('abc')
    expect(score).toBeLessThan(3)
  })

  it('scores strong passwords high', () => {
    const { score } = calculatePasswordStrength('MyStr0ng!Pass')
    expect(score).toBeGreaterThanOrEqual(4)
  })

  it('provides helpful feedback', () => {
    const { feedback } = calculatePasswordStrength('weak')
    expect(feedback.length).toBeGreaterThan(0)
    expect(feedback).toContain('At least 8 characters')
  })
})
