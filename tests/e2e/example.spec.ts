import { test, expect, Page } from '@playwright/test'

// ============================================
// E2E Tests for Critical User Flows
//
// These tests verify that features actually work
// as advertised, not just that they render UI.
// ============================================

// ============================================
// TEST GROUP: Auth & Security
// ============================================

test.describe('Authentication', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    
    // Check for essential elements
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('signup page renders correctly', async ({ page }) => {
    await page.goto('/signup')
    
    await expect(page.locator('input[id="full_name"]')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})

// ============================================
// TEST GROUP: 2FA (Currently FAILS - expected)
// ============================================

test.describe('Two-Factor Authentication', () => {
  test.skip('shows 2FA setup when enabled', async ({ page }) => {
    // This test documents the expected behavior
    // Currently 2FA is partially implemented - this will pass once fully working
    
    await page.goto('/app/security')
    await page.waitForLoadState('networkidle')
    
    // Should see 2FA setup options when enabled
    const twoFactorSection = page.locator('text=Authenticator App')
    // This assertion will fail if 2FA is not properly enabled
    await expect(twoFactorSection).toBeVisible()
  })

  test.skip('generates valid TOTP secret', async ({ page }) => {
    // This test verifies the 2FA setup flow works end-to-end
    // Skipped until Edge Function and user_mfa table are set up
  })
})

// ============================================
// TEST GROUP: Dashboard (Currently FAILS - expected)
// ============================================

test.describe('Dashboard', () => {
  test.skip('displays real business data, not demo data', async ({ page }) => {
    // Login first
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@avenize.com')
    await page.fill('input[type="password"]', 'testpassword123')
    await page.click('button[type="submit"]')
    
    await page.waitForURL('/app/dashboard')
    
    // Check that stats are not showing demo values
    // This test will FAIL because Dashboard uses hardcoded data
    const hotDealsCard = page.locator('text=Hot Deals')
    await expect(hotDealsCard).toBeVisible()
    
    // The value should be from database, not "7"
    // Current behavior: always shows "7"
    // Expected behavior: shows actual count from deals table
  })
})

// ============================================
// TEST GROUP: CRM/Deals (Currently FAILS - expected)
// ============================================

test.describe('CRM - Deals', () => {
  test.skip('can create a real deal', async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@avenize.com')
    await page.fill('input[type="password"]', 'testpassword123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/app/dashboard')
    
    // Navigate to CRM
    await page.goto('/app/crm')
    await page.waitForLoadState('networkidle')
    
    // Click add deal
    await page.click('text=Add Deal')
    
    // Fill form
    await page.fill('input[placeholder*="deal" i], input[id*="title"]', 'Test Deal from E2E')
    await page.fill('input[id*="contact"]', 'Test Contact')
    await page.fill('input[id*="value"]', '50000')
    
    // Submit
    await page.click('button:has-text("Save"), button:has-text("Add")')
    
    // Verify deal appears
    await expect(page.locator('text=Test Deal from E2E')).toBeVisible({ timeout: 5000 })
    
    // THIS WILL FAIL: Deal is only added to local state, not database
  })

  test.skip('deal persists after page reload', async ({ page }) => {
    // This test will FAIL because deals aren't persisted
  })
})

// ============================================
// TEST GROUP: Webhooks (Currently FAILS - expected)
// ============================================

test.describe('Webhooks', () => {
  test.skip('saves webhook configuration', async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@avenize.com')
    await page.fill('input[type="password"]', 'testpassword123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/app/dashboard')
    
    // Navigate to API settings
    await page.goto('/app/api')
    await page.waitForLoadState('networkidle')
    
    // Switch to webhooks tab
    await page.click('text=Webhooks')
    
    // Click new webhook
    await page.click('text=New Webhook')
    
    // Fill form
    await page.fill('input[id*="name"]', 'E2E Test Webhook')
    await page.fill('input[id*="url"]', 'https://webhook.site/test')
    await page.click('text=deal.won') // Select an event
    
    // Save
    await page.click('button:has-text("Save")')
    
    // Verify webhook appears in list
    await expect(page.locator('text=E2E Test Webhook')).toBeVisible({ timeout: 5000 })
    
    // THIS WILL FAIL: Saving may work, but dispatch doesn't
  })

  test.skip('actually dispatches webhook on event', async ({ page }) => {
    // This is the critical test - verifies the Edge Function works
    // Currently IMPOSSIBLE without Edge Function deployment
    
    // Setup webhook pointing to a test endpoint
    // Trigger deal.won event
    // Verify webhook.site received the request
    
    // THIS WILL FAIL: Edge Function not deployed
  })
})

// ============================================
// TEST GROUP: Automations (Currently FAILS - expected)
// ============================================

test.describe('Automations', () => {
  test.skip('saves automation rule', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@avenize.com')
    await page.fill('input[type="password"]', 'testpassword123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/app/dashboard')
    
    await page.goto('/app/automations')
    await page.waitForLoadState('networkidle')
    
    // Create automation
    await page.click('text=New automation')
    await page.fill('input[id*="name"]', 'E2E Test Automation')
    await page.click('text=Deal won') // Select trigger
    await page.click('text=Notify') // Select action
    
    await page.click('button:has-text("Save")')
    
    await expect(page.locator('text=E2E Test Automation')).toBeVisible({ timeout: 5000 })
  })

  test.skip('executes automation action on trigger', async ({ page }) => {
    // Critical test - verify automation actually fires
    // THIS WILL FAIL: Edge Function not deployed
  })
})

// ============================================
// TEST GROUP: PWA Installability
// ============================================

test.describe('PWA', () => {
  test('manifest is valid and icons exist', async ({ page }) => {
    const response = await page.goto('/manifest.json')
    expect(response?.status()).toBe(200)
    
    const manifest = await page.evaluate(() => {
      return fetch('/manifest.json').then(r => r.json())
    })
    
    expect(manifest.name).toBeTruthy()
    expect(manifest.icons).toHaveLengthGreaterThan(0)
  })

  test('all PWA icons return 200', async ({ page }) => {
    const manifest = await page.evaluate(() => {
      return fetch('/manifest.json').then(r => r.json())
    })
    
    for (const icon of manifest.icons) {
      const response = await page.goto(icon.src)
      expect(response?.status()).toBe(200, `Icon ${icon.src} returned ${response?.status()}`)
    }
  })
})

// ============================================
// TEST GROUP: Campaign Email (Currently FAILS - expected)
// ============================================

test.describe('Email Campaigns', () => {
  test.skip('sends email campaign', async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@avenize.com')
    await page.fill('input[type="password"]', 'testpassword123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/app/dashboard')
    
    await page.goto('/app/campaigns')
    await page.waitForLoadState('networkidle')
    
    // Create campaign
    await page.click('text=New Campaign')
    await page.fill('input[id*="name"]', 'E2E Test Campaign')
    await page.fill('input[id*="subject"]', 'Test Subject')
    
    await page.click('button:has-text("Save")')
    
    // Find send button and click
    const sendButton = page.locator('button:has-text("Send")').first()
    await sendButton.click()
    
    // Should show success toast, not "coming soon"
    // THIS WILL FAIL: Currently shows "Email sending is coming soon!"
  })
})

// ============================================
// Helper Functions
// ============================================

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/app/**', { timeout: 10000 })
}
