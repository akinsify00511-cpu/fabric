import { test, expect, Page } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('signup page renders correctly', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.locator('input[id="full_name"], input[id="fullName"], input[name="full_name"], input[name="fullName"], input[placeholder*="full name" i]')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Two-Factor Authentication', () => {
  test.skip('shows 2FA setup when enabled', async ({ page }) => {
    await page.goto('/app/security')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Authenticator App')).toBeVisible()
  })

  test.skip('generates valid TOTP secret', async () => {})
})

test.describe('Dashboard', () => {
  test.skip('displays real business data, not demo data', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@avenize.com')
    await page.fill('input[type="password"]', 'testpassword123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/app/dashboard')
    await expect(page.locator('text=Hot Deals')).toBeVisible()
  })
})

test.describe('CRM - Deals', () => {
  test.skip('can create a real deal', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@avenize.com')
    await page.fill('input[type="password"]', 'testpassword123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/app/dashboard')
    await page.goto('/app/crm')
    await page.waitForLoadState('networkidle')
    await page.click('text=Add Deal')
    await page.fill('input[placeholder*="deal" i], input[id*="title"]', 'Test Deal from E2E')
    await page.fill('input[id*="contact"]', 'Test Contact')
    await page.fill('input[id*="value"]', '50000')
    await page.click('button:has-text("Save"), button:has-text("Add")')
    await expect(page.locator('text=Test Deal from E2E')).toBeVisible({ timeout: 5000 })
  })

  test.skip('deal persists after page reload', async () => {})
})

test.describe('Webhooks', () => {
  test.skip('saves webhook configuration', async () => {})
  test.skip('actually dispatches webhook on event', async () => {})
})

test.describe('Automations', () => {
  test.skip('saves automation rule', async () => {})
  test.skip('executes automation action on trigger', async () => {})
})

test.describe('PWA', () => {
  test('manifest is valid and icons exist', async ({ page }) => {
    await page.goto('/')
    const response = await page.request.get(new URL('/manifest.json', page.url()).toString())
    expect(response.status()).toBe(200)
    const manifest = await response.json()
    expect(manifest.name).toBeTruthy()
    expect(Array.isArray(manifest.icons)).toBe(true)
    expect(manifest.icons.length).toBeGreaterThan(0)
  })

  test('all PWA icons return 200', async ({ page }) => {
    await page.goto('/')
    const manifestResponse = await page.request.get(new URL('/manifest.json', page.url()).toString())
    expect(manifestResponse.status()).toBe(200)
    const manifest = await manifestResponse.json()
    for (const icon of manifest.icons) {
      const iconUrl = new URL(icon.src, page.url()).toString()
      const response = await page.request.get(iconUrl)
      expect(response.status()).toBe(200, `Icon ${icon.src} returned ${response.status()}`)
    }
  })
})

test.describe('Email Campaigns', () => {
  test.skip('sends email campaign', async () => {})
})

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/app/**', { timeout: 10000 })
}
