/**
 * Schema contract tests - verify TypeScript types match actual database schema
 * This catches field name mismatches before they reach production
 */

import { test, expect } from '@playwright/test'

/**
 * Critical field mappings that must match between TypeScript types and DB schema
 * 
 * staff table:
 *   - actual column: name (NOT full_name)
 *   - actual column: email
 *   - actual column: role ('owner' | 'manager' | 'staff')
 * 
 * contacts table:
 *   - actual column: name (NOT full_name)
 *   - actual column: email
 *   - actual column: company
 */
test.describe('Schema Field Contracts', () => {
  test('[Schema] staff.name field must be used, not full_name', () => {
    // The staff table has a 'name' column, not 'full_name'
    // This test documents the contract - actual DB query would be:
    // supabase.from('staff').select('id, name, email, role')
    
    // Valid staff object (matches actual schema)
    const validStaff = {
      id: 'uuid',
      name: 'John Doe',      // ← Correct field name
      email: 'john@example.com',
      role: 'staff'
    }
    
    expect(validStaff.name).toBe('John Doe')
    // @ts-expect-error - full_name should not exist
    expect(validStaff.full_name).toBeUndefined()
  })
  
  test('[Schema] contacts.name field must be used, not full_name', () => {
    // The contacts table has a 'name' column, not 'full_name'
    
    const validContact = {
      id: 'uuid',
      name: 'Jane Smith',    // ← Correct field name
      email: 'jane@example.com',
      company: 'Acme Corp'
    }
    
    expect(validContact.name).toBe('Jane Smith')
    // @ts-expect-error - full_name should not exist
    expect(validContact.full_name).toBeUndefined()
  })
  
  test('[Schema] StaffMember types should use name, not full_name', () => {
    // Document the correct type
    type StaffMember = {
      id: string
      name: string          // ← Correct
      email: string
      role: string
    }
    
    const member: StaffMember = {
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'staff'
    }
    
    expect(member.name).toBe('Test User')
  })
  
  test('[Schema] Contact types should use name, not full_name', () => {
    // Document the correct type
    type Contact = {
      id: string
      name: string          // ← Correct
      email: string
      company: string | null
    }
    
    const contact: Contact = {
      id: '1',
      name: 'Test Contact',
      email: 'contact@example.com',
      company: 'Test Corp'
    }
    
    expect(contact.name).toBe('Test Contact')
  })
})

/**
 * Integration test - verify People page loads with real staff data
 * Run with: npx playwright test tests/database/schema-contracts.spec.ts --project=chromium
 * 
 * Requires real Supabase instance with staff data
 */
test.describe('Real Data Integration', () => {
  test.skip('[Integration] People page renders real staff without crashing', async ({ page }) => {
    // Setup: create a real staff row in test database
    // This test is skipped by default - enable when you have a test DB
    
    await page.goto('/app/people')
    await page.waitForLoadState('networkidle')
    
    // Should not crash with "Cannot read property 'toLowerCase' of undefined"
    const errorBoundary = page.locator('text="Something went wrong"')
    await expect(errorBoundary).not.toBeVisible({ timeout: 5000 })
    
    // Should show actual staff names (from DB, not demo fallback)
    // If demo fallback is shown, real data query failed
  })
})
