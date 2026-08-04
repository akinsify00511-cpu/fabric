import { test, expect } from '@playwright/test'

/**
 * Navigation tests - ensure all nav items work correctly
 * This catches broken routing before it reaches production
 */

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Set demo mode
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('avenize_demo_user', JSON.stringify({
        id: 'test-user-1',
        name: 'Test User',
        email: 'test@example.com',
        business_id: 'test-business',
        business_name: 'Test Business',
        role: 'owner'
      }))
    })
  })

  test('[Navigation] Every sidebar nav item navigates to a real page, not 404', async ({ page }) => {
    await page.goto('/app')
    await page.waitForLoadState('networkidle')
    
    // Find all nav links in the sidebar
    const navLinks = page.locator('aside nav a, nav a')
    const linkCount = await navLinks.count()
    
    expect(linkCount, 'Should have navigation links').toBeGreaterThan(0)
    
    for (let i = 0; i < linkCount; i++) {
      const link = navLinks.nth(i)
      const isVisible = await link.isVisible().catch(() => false)
      
      if (!isVisible) continue
      
      const href = await link.getAttribute('href')
      const text = await link.textContent()
      
      // Skip external links or special links
      if (!href || href.startsWith('http') || href === '#') continue
      
      // Click the link
      await link.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)
      
      // Check we're not on 404
      const notFoundVisible = await page.getByText(/page not found|404/i).isVisible().catch(() => false)
      const currentUrl = page.url()
      
      expect(notFoundVisible, 
        `Navigation to "${href}" (${text?.trim()}) resulted in 404. Current URL: ${currentUrl}`
      ).toBe(false)
      
      // Go back to dashboard
      await page.goto('/app')
      await page.waitForLoadState('networkidle')
    }
  })

  test('[Navigation] Dashboard loads correctly', async ({ page }) => {
    await page.goto('/app')
    await page.waitForLoadState('networkidle')
    
    // Should have some content, not 404
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(100)
    
    // Should not show "Page Not Found"
    const notFound = await page.getByText(/page not found/i).isVisible().catch(() => false)
    expect(notFound).toBe(false)
  })

  test('[Navigation] Chat navigates correctly', async ({ page }) => {
    await page.goto('/app')
    await page.waitForLoadState('networkidle')
    
    // Find and click Chat nav link
    const chatLink = page.locator('a[href="/app/chat"]').first()
    
    if (await chatLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatLink.click()
      await page.waitForLoadState('networkidle')
      
      // Should be on chat page, not 404
      const notFound = await page.getByText(/page not found/i).isVisible().catch(() => false)
      expect(notFound, 'Chat page should not show 404').toBe(false)
    }
  })

  test('[Navigation] All main sections are accessible', async ({ page }) => {
    await page.goto('/app')
    await page.waitForLoadState('networkidle')
    
    const sections = [
      { path: '/app/crm', name: 'CRM' },
      { path: '/app/tasks', name: 'Tasks' },
      { path: '/app/calendar', name: 'Calendar' },
    ]
    
    for (const section of sections) {
      await page.goto(section.path)
      await page.waitForLoadState('networkidle')
      
      const notFound = await page.getByText(/page not found/i).isVisible().catch(() => false)
      expect(notFound, `${section.name} at ${section.path} should not show 404`).toBe(false)
    }
  })

  test('[Navigation] Direct URL access works for all routes', async ({ page }) => {
    const routes = [
      '/app',
      '/app/chat',
      '/app/crm',
      '/app/tasks',
      '/app/calendar',
      '/app/settings',
    ]
    
    for (const route of routes) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      
      const notFound = await page.getByText(/page not found/i).isVisible().catch(() => false)
      expect(notFound, `Route ${route} should not show 404`).toBe(false)
    }
  })

  test('[Navigation] Old flat paths redirect to /app/...', async ({ page }) => {
    const oldPaths = ['/chat', '/crm', '/tasks', '/settings']
    
    for (const oldPath of oldPaths) {
      await page.goto(oldPath)
      await page.waitForLoadState('networkidle')
      
      // Should redirect to /app/...
      const currentUrl = page.url()
      expect(currentUrl, `${oldPath} should redirect to /app/...`).toContain('/app/')
      
      // Should not show 404
      const notFound = await page.getByText(/page not found/i).isVisible().catch(() => false)
      expect(notFound, `${oldPath} redirect should not show 404`).toBe(false)
    }
  })
})
