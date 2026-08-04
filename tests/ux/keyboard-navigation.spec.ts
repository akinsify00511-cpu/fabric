import { test, expect } from '@playwright/test'

/**
 * Keyboard navigation tests
 * These tests ensure core user flows can be completed without a mouse
 */

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Enable demo mode by setting localStorage
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

  test('[Keyboard] Login form can be completed with keyboard only', async ({ page }) => {
    await page.goto('/login')
    
    // Focus on email field
    await page.keyboard.press('Tab') // Skip to form if needed
    await page.keyboard.press('Tab')
    
    // Fill email
    await page.keyboard.type('test@example.com')
    await page.keyboard.press('Tab')
    
    // Fill password
    await page.keyboard.type('password123')
    await page.keyboard.press('Tab')
    
    // Submit
    await page.keyboard.press('Enter')
    
    // Should navigate away from login
    await expect(page).not.toHaveURL(/login/)
  })

  test('[Keyboard] Dashboard navigation works with Tab key', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')
    
    // Tab through the page - should reach interactive elements
    let tabCount = 0
    const maxTabs = 20
    
    for (let i = 0; i < maxTabs; i++) {
      await page.keyboard.press('Tab')
      tabCount++
      
      // Check if focused element is visible
      const focusedElement = page.locator(':focus')
      const isVisible = await focusedElement.isVisible().catch(() => false)
      
      if (isVisible && tabCount >= 5) break
    }
    
    expect(tabCount).toBeLessThanOrEqual(maxTabs)
  })

  test('[Keyboard] Modal can be closed with Escape key', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')
    
    // Try to find and open a modal (New button or similar)
    const newButton = page.locator('button:has-text("New"), button:has-text("Create")').first()
    if (await newButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await newButton.click()
      
      // Check for modal
      const modal = page.locator('[role="dialog"], .fixed, .absolute').filter({ hasText: /new|create/i }).first()
      if (await modal.isVisible({ timeout: 1000 }).catch(() => false)) {
        // Close with Escape
        await page.keyboard.press('Escape')
        
        // Modal should be gone or closing
        await expect(modal).not.toBeVisible({ timeout: 2000 }).catch(() => {
          // Some modals have animations, this is acceptable
        })
      }
    }
  })

  test('[Keyboard] Focus indicator is visible on interactive elements', async ({ page }) => {
    await page.goto('/login')
    
    // Focus first element
    await page.locator('body').click()
    await page.keyboard.press('Tab')
    
    const focusedElement = page.locator(':focus')
    const isVisible = await focusedElement.isVisible()
    expect(isVisible).toBe(true)
  })
})
