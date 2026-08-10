import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DbStateBanner } from '../../../src/lib/useDbState'

describe('DbStateBanner', () => {
  it('renders nothing when configured', () => {
    const { container } = render(<DbStateBanner state="configured" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing while checking', () => {
    const { container } = render(<DbStateBanner state="checking" />)
    expect(container.firstChild).toBeNull()
  })

  it('shows an actionable migration message when migrations are missing', () => {
    render(<DbStateBanner state="migrations-missing" />)
    expect(screen.getByText(/supabase db push/i)).toBeInTheDocument()
    expect(screen.getByText(/058/)).toBeInTheDocument()
  })

  it('shows an offline message when the DB is unreachable', () => {
    render(<DbStateBanner state="offline" />)
    expect(screen.getByText(/Cannot reach the database/i)).toBeInTheDocument()
  })
})
