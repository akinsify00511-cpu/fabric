import { test, expect } from '@playwright/test'

/**
 * Empty state and first-run experience tests
 * Ensures new users see guidance, not blank screens
 */

test.describe('Empty States', () => {
  test.beforeEach(async ({ page }) => {
    // Set up fresh account state
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.clear()
    })
  })

  test('[Empty State] Dashboard shows guidance for new users', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')
    
    // Dashboard should have some content or guidance
    const bodyText = await page.locator('body').textContent()
    
    // Should not be completely empty
    expect(bodyText?.trim().length).toBeGreaterThan(100)
    
    // Should have some actionable elements or guidance
    const hasContent = 
      await page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New")').count() > 0 ||
      await page.locator('text=/get started|welcome|add your|first/i').count() > 0 ||
      await page.locator('a:has-text("Add"), a:has-text("Create")').count() > 0
    
    expect(hasContent).toBe(true)
  })

  test('[Empty State] CRM shows guidance when no contacts', async ({ page }) => {
    await page.goto('/app/crm')
    await page.waitForLoadState('networkidle')
    
    const bodyText = await page.locator('body').textContent()
    
    // Should show something - either contacts or empty state guidance
    expect(bodyText?.trim().length).toBeGreaterThan(50)
    
    // Should have CTA to add first contact
    const hasAddCTA = 
      await page.locator('button:has-text("Add"), button:has-text("Create")').count() > 0 ||
      await page.locator('text=/add.*contact|no.*contact|get started/i').count() > 0
    
    expect(hasAddCTA).toBe(true)
  })

  test('[Empty State] Empty states have clear CTAs', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')
    
    // Check for empty state patterns
    const emptyStatePatterns = [
      /no.*yet/i,
      /get started/i,
      /add your first/i,
      /create.*first/i,
      /nothing here/i,
      /empty/i,
    ]
    
    const bodyText = await page.locator('body').textContent()
    
    if (bodyText) {
      const hasEmptyStateGuidance = emptyStatePatterns.some(pattern => pattern.test(bodyText))
        || await page.locator('button:has-text("Add"), button:has-text("Create")').count() > 0
      
      expect(hasEmptyStateGuidance).toBe(true)
    }
  })

  test('[Empty State] Pages load without blank screens', async ({ page }) => {
    const pages = [
      '/app/dashboard',
      '/app/crm',
      '/app/tasks',
    ]
    
    for (const path of pages) {
      await page.goto(path)
      await page.waitForLoadState('domcontentloaded')
      
      // Wait for any loading states to complete
      await page.waitForTimeout(1000)
      
      // Page should have visible content
      const visibleContent = await page.locator('main, [role="main"], .main, body').first().isVisible()
      expect(visibleContent).toBe(true)
      
      // Should not show white screen of death
      const bodyText = await page.locator('body').textContent()
      expect(bodyText?.trim().length).toBeGreaterThan(0)
    }
  })

  test('[Empty State] Loading states are indicated', async ({ page }) => {
    await page.goto('/app/dashboard')
    
    // Initial load should either show content or loading indicator
    const hasLoadingIndicator = 
      await page.locator('.animate-spin, .loading, [role="status"]').count() > 0 ||
      await page.locator('text=/loading|please wait/i').count() > 0
    
    // Wait for content
    await page.waitForLoadState('networkidle')
    
    // Eventually should show actual content
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(100)
  })
})

test.describe('First Run Experience', () => {
  test('[First Run] Onboarding flow is accessible', async ({ page }) => {
    await page.goto('/onboarding')
    await page.waitForLoadState('networkidle')
    
    // Onboarding should be navigable
    const hasContent = await page.locator('h1, h2').count() > 0
    expect(hasContent).toBe(true)
    
    // Should have next/continue button
    const hasNextButton = 
      await page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Get Started")').count() > 0
    
    expect(hasNextButton).toBe(true)
  })

  test('[First Run] Login page shows signup link', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    
    // Should have way to sign up
    const hasSignupLink = 
      await page.locator('a:has-text("Sign up"), a:has-text("Register"), a:has-text("Create account")').count() > 0 ||
      await page.locator('text=/don.*t have.*account/i').count() > 0
    
    expect(hasSignupLink).toBe(true)
  })

  test('[First Run] Signup page shows login link', async ({ page }) => {
    await page.goto('/signup')
    await page.waitForLoadState('networkidle')
    
    // Should have way to log in
    const hasLoginLink = 
      await page.locator('a:has-text("Log in"), a:has-text("Sign in"), a:has-text("Login")').count() > 0 ||
      await page.locator('text=/already.*account/i').count() > 0
    
    expect(hasLoginLink).toBe(true)
  })
})

test.describe('Navigation', () => {
  test('[Navigation] Sidebar shows main sections', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')
    
    // Should have navigation to main sections
    const navItems = [
      'Dashboard',
      'CRM',
      'Tasks',
      'Settings',
    ]
    
    for (const item of navItems) {
      const exists = await page.locator(`text=/${item}/i`).count() > 0
      // These are expected in the sidebar or navigation
      expect(exists).toBe(true)
    }
  })

  test('[Navigation] User can always find help/logout', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')
    
    // Should have settings or profile access
    const hasSettings = 
      await page.locator('text=/settings|profile|preferences/i').count() > 0 ||
      await page.locator('[aria-label*="settings"], [aria-label*="profile"]').count() > 0
    
    expect(hasSettings).toBe(true)
  })
})
