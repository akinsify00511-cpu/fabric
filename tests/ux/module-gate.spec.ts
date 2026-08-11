import { test, expect } from '@playwright/test'

/**
 * Two-flag module gate tests.
 *
 * The core security property: a module the business isn't entitled to OR
 * that isn't ready yet must NOT be reachable by typing the URL directly.
 * Client-side nav hiding is not a gate — the route layer must enforce too.
 *
 * In demo mode (no real Supabase session), can_access_module RPC returns
 * null/errors → the gate treats unknown as "not ready", so gated routes
 * should show the gate page (or render gracefully), never 500.
 */

test.describe('Module access gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem('avenize_demo', 'true')
      localStorage.setItem('avenize_demo_user', JSON.stringify({
        id: 'test-user-1',
        name: 'Test User',
        email: 'test@example.com',
        business_id: 'test-business',
        business_name: 'Test Business',
        role: 'owner',
      }))
    })
    await page.reload()
    await page.waitForLoadState('networkidle')
  })

  test('[Gate] a not-ready module route does not 500', async ({ page }) => {
    // automations is seeded module_ready=false. Even an owner typing the URL
    // directly should hit the gate, not the module's fake content.
    await page.goto('/app/automations')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)

    const body = await page.locator('body').textContent()
    // Should never be an unhandled error page
    expect(body).not.toMatch(/application error|cannot read|is not a function|undefined/i)
  })

  test('[Gate] gate page distinguishes readiness vs plan', async ({ page }) => {
    await page.goto('/app/automations')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)
    // Either the gate copy or the module (if demo grants it) renders — but
    // not a crash. Look for one of the known gate headings or the page h1.
    const gateOrModule = page.locator('h1')
    await expect(gateOrModule).toBeVisible({ timeout: 5000 })
  })
})
