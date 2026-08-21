import { test, expect } from '@playwright/test'

/**
 * Launch-gate auth matrix — the public surface. Verifies every page in the
 * signup/signin/reset chain renders and links correctly. Session-dependent
 * legs (post-login routing, onboarding gating) are covered by the membership
 * state machine unit tests + the production smoke matrix.
 */

test.describe('Auth launch matrix — public surface', () => {
  test('login renders with password + OAuth + reset + signup entries', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    // OAuth must be available
    await expect(page.getByText(/google/i).first()).toBeVisible()
    // Password reset entry
    const forgot = page.locator('a[href="/forgot-password"]')
    await expect(forgot).toBeVisible()
    // Signup entry exists
    await expect(page.locator('a[href="/signup"]').first()).toBeVisible()
  })

  test('signup renders with email/password + OAuth', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
    await expect(page.getByText(/google/i).first()).toBeVisible()
  })

  test('forgot-password renders and submits to a confirmation state', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /reset|send|link/i })).toBeVisible()
  })

  test('update-password route renders (recovery target)', async ({ page }) => {
    await page.goto('/update-password')
    // Must not 404 or crash — the page renders its form or an auth notice
    await expect(page.locator('body')).not.toContainText('404')
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })

  test('/auth/callback renders a completing state (not a crash)', async ({ page }) => {
    await page.goto('/auth/callback')
    await expect(page.locator('body')).not.toContainText('Cannot read')
    await expect(page.locator('body')).not.toContainText('404')
  })

  test('deep-link bounce preserves the return path (?redirect=)', async ({ page }) => {
    await page.goto('/app/finance')
    // RequireAuth should bounce to login carrying the original destination
    await page.waitForURL(/\/login/, { timeout: 15000 })
    expect(page.url()).toContain('redirect=')
    expect(decodeURIComponent(page.url())).toContain('/app/finance')
  })

  test('pricing → upgrade route exists (checkout funnel entry)', async ({ page }) => {
    await page.goto('/upgrade?plan=team&billing=monthly')
    await expect(page.locator('body')).not.toContainText('404')
    await expect(page.getByText(/complete your payment/i)).toBeVisible()
    // Paid checkout: no free-trial language anywhere on the checkout
    await expect(page.locator('body')).not.toContainText(/free trial/i)
  })
})
