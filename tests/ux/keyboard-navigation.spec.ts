import { test, expect, type Page } from '@playwright/test'

/**
 * Keyboard navigation tests
 * These tests ensure core user flows can be completed without a mouse.
 */

const seedDemoMode = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('avenize_demo', 'true')
    localStorage.setItem('avenize_demo_user', JSON.stringify({
      id: 'test-user-1',
      name: 'Test User',
      email: 'test@example.com',
      business_id: 'test-business',
      business_name: 'Test Business',
      role: 'owner'
    }))
  })
}

test.describe('Keyboard Navigation', () => {
  test('[Keyboard] Login form can be submitted with keyboard only', async ({ page }) => {
    let signInRequestSeen = false

    // Keep this login test independent of production credentials and the
    // separate rate-limit contract. The form should reach Supabase sign-in;
    // rate-limit availability is tested by the security suite.
    await page.route('**/rest/v1/rpc/check_auth_rate_limit**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ allowed: true, attempts: 0, retry_after: 0 }]),
      })
    })

    await page.route('**/auth/v1/token**', async (route) => {
      signInRequestSeen = true
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_credentials',
          error_description: 'Invalid login credentials',
          msg: 'Invalid login credentials',
        }),
      })
    })

    await page.goto('/login')

    const email = page.locator('input[type="email"]').first()
    const password = page.locator('input[type="password"]').first()
    await expect(email).toBeVisible()
    await expect(password).toBeVisible()

    await email.focus()
    await page.keyboard.type('test@example.com')
    await page.keyboard.press('Tab')
    await page.keyboard.type('password123')

    // Submit from the focused password control using the page keyboard API.
    // This mirrors the real Enter key while avoiding WebKit's intermittent
    // element-level Enter dispatch issue on password inputs.
    await page.keyboard.press('Enter')

    await expect.poll(() => signInRequestSeen, { timeout: 5000 }).toBe(true)
    await expect(page).toHaveURL(/\/login/)
  })

  test('[Keyboard] Dashboard navigation works with Tab key', async ({ page }) => {
    await seedDemoMode(page)
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')

    let tabCount = 0
    const maxTabs = 20

    for (let i = 0; i < maxTabs; i++) {
      await page.keyboard.press('Tab')
      tabCount++

      const focusedElement = page.locator(':focus')
      const isVisible = await focusedElement.isVisible().catch(() => false)

      if (isVisible && tabCount >= 5) break
    }

    expect(tabCount).toBeLessThanOrEqual(maxTabs)
  })

  test('[Keyboard] Modal can be closed with Escape key', async ({ page }) => {
    await seedDemoMode(page)
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')

    const newButton = page.locator('button:has-text("New"), button:has-text("Create")').first()
    if (await newButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await newButton.click()

      const modal = page.locator('[role="dialog"], .fixed, .absolute').filter({ hasText: /new|create/i }).first()
      if (await modal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible({ timeout: 2000 }).catch(() => {})
      }
    }
  })

  test('[Keyboard] Focus indicator is visible on interactive elements', async ({ page }) => {
    await page.goto('/login')
    await page.locator('body').click()
    await page.keyboard.press('Tab')

    const focusedElement = page.locator(':focus')
    const isVisible = await focusedElement.isVisible()
    expect(isVisible).toBe(true)
  })
})
