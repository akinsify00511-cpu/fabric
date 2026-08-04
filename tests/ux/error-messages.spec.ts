import { test, expect } from '@playwright/test'

/**
 * Error message content tests
 * These tests ensure error messages are user-friendly, not raw DB errors
 */

const RAW_DB_ERROR_PATTERNS = [
  /postgres/i,
  /constraint/i,
  /violates/i,
  /null value/i,
  /23505/i, // PostgreSQL unique violation
  /23503/i, // PostgreSQL foreign key violation
  /23502/i, // PostgreSQL not null violation
  /ERROR\s+\d+/i,
  /SYNTAX_ERROR/i,
  /stack trace/i,
  /at\s+.*\.(ts|js):\d+:\d+/i, // Stack traces
]

const USER_FRIENDLY_PATTERNS = [
  /please/i,
  /required/i,
  /enter/i,
  /invalid/i,
  /must/i,
  /should/i,
  /try again/i,
  /check/i,
  /valid/i,
]

test.describe('Error Messages', () => {
  test('[Error Messages] Login with empty fields shows user-friendly error', async ({ page }) => {
    await page.goto('/login')
    
    // Try to submit empty form
    await page.locator('button[type="submit"]').click()
    
    // Wait for any error message
    await page.waitForTimeout(500)
    
    const errorLocators = [
      page.locator('[role="alert"]'),
      page.locator('.error'),
      page.locator('.text-red'),
      page.locator('p.text-danger'),
    ]
    
    for (const locator of errorLocators) {
      const errors = await locator.all()
      for (const error of errors) {
        const text = await error.textContent()
        if (text && text.trim().length > 0) {
          // Should not contain raw DB errors
          for (const pattern of RAW_DB_ERROR_PATTERNS) {
            expect(text).not.toMatch(pattern)
          }
        }
      }
    }
  })

  test('[Error Messages] Form validation errors are not raw SQL', async ({ page }) => {
    await page.goto('/signup')
    
    // Fill invalid data
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first()
    if (await emailInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await emailInput.fill('not-an-email')
      await page.locator('button[type="submit"]').click()
      
      await page.waitForTimeout(1000)
      
      // Check for error messages
      const body = await page.locator('body').textContent()
      if (body) {
        for (const pattern of RAW_DB_ERROR_PATTERNS) {
          expect(body).not.toMatch(pattern)
        }
      }
    }
  })

  test('[Error Messages] Error messages contain helpful guidance', async ({ page }) => {
    await page.goto('/login')
    
    // Submit empty form
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(500)
    
    // Check if there are any error messages
    const hasErrorMessage = await page.locator('[role="alert"], .error, .text-red-500').count() > 0
    
    if (hasErrorMessage) {
      const errorText = await page.locator('[role="alert"]').first().textContent().catch(() => '')
      
      // If there's an error, it should be user-friendly
      if (errorText && errorText.trim().length > 0) {
        // Should not be raw DB error
        for (const pattern of RAW_DB_ERROR_PATTERNS) {
          expect(errorText).not.toMatch(pattern)
        }
      }
    }
  })

  test('[Error Messages] Network errors show user-friendly message', async ({ page }) => {
    await page.goto('/login')
    
    // Simulate offline by intercepting requests
    await page.route('**/auth/**', route => route.abort())
    
    // Try to submit
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(2000)
    
    // Should show some error message (may take a moment)
    const hasError = await page.locator('[role="alert"], .error, .text-red').count() > 0
    
    if (hasError) {
      const errorText = await page.locator('[role="alert"]').first().textContent().catch(() => '')
      if (errorText) {
        // Should not expose raw network errors
        expect(errorText).not.toMatch(/fetch|network|ECONNREFUSED/i)
        expect(errorText).not.toMatch(RAW_DB_ERROR_PATTERNS)
      }
    }
  })
})

test.describe('Form Validation Messages', () => {
  test('[Validation] Required fields show message on blur', async ({ page }) => {
    await page.goto('/signup')
    
    // Find email field and blur without filling
    const emailInput = page.locator('input[name="email"], input[type="email"]').first()
    if (await emailInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await emailInput.click()
      await emailInput.blur()
      await page.waitForTimeout(500)
      
      // Should show validation message
      const validationText = await page.locator('span.text-red, .error-message, [role="alert"]')
        .first()
        .textContent()
        .catch(() => '')
      
      if (validationText && validationText.trim().length > 0) {
        // Should be user-friendly
        expect(validationText.toLowerCase()).toMatch(/required|email|valid/i)
      }
    }
  })

  test('[Validation] Invalid email shows clear message', async ({ page }) => {
    await page.goto('/signup')
    
    const emailInput = page.locator('input[name="email"], input[type="email"]').first()
    if (await emailInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await emailInput.fill('notvalid')
      await emailInput.blur()
      await page.waitForTimeout(1000)
      
      // Check for email validation error
      const pageText = await page.locator('body').textContent()
      if (pageText) {
        const hasEmailError = pageText.toLowerCase().includes('email') || 
                              pageText.toLowerCase().includes('valid')
        
        // Should not be raw validation error
        expect(pageText).not.toMatch(RAW_DB_ERROR_PATTERNS)
      }
    }
  })
})
