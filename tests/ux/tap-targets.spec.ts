import { test, expect } from '@playwright/test'

/**
 * Tap target size tests
 * Ensures all interactive elements meet 44px minimum tap target (WCAG 2.1)
 */

const MIN_TAP_TARGET = 44

test.describe('Tap Target Sizes (Mobile)', () => {
  test.beforeEach(async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
  })

  test('[Tap Target] All buttons meet 44px minimum on mobile', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')
    
    const buttons = page.locator('button:not([disabled])')
    const buttonCount = await buttons.count()
    
    let violations: string[] = []
    
    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i)
      const isVisible = await button.isVisible().catch(() => false)
      
      if (!isVisible) continue
      
      const box = await button.boundingBox()
      if (!box) continue
      
      // Skip hidden or display:none buttons
      const display = await button.evaluate(el => window.getComputedStyle(el).display)
      if (display === 'none') continue
      
      // Check width and height
      if (box.width < MIN_TAP_TARGET || box.height < MIN_TAP_TARGET) {
        const text = await button.textContent().catch(() => '[no text]')
        violations.push(`Button "${text?.substring(0, 30)}" (${Math.round(box.width)}x${Math.round(box.height)})`)
      }
    }
    
    if (violations.length > 0) {
      console.log('Tap target violations:', violations.join('\n'))
    }
    
    // Use soft assertion to not fail entire test suite
    expect.soft(violations, `${violations.length} buttons have tap targets below ${MIN_TAP_TARGET}px`).toHaveLength(0)
  })

  test('[Tap Target] All links meet 44px minimum on mobile', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')
    
    const links = page.locator('a:not([style*="display: none"]):visible')
    const linkCount = await links.count()
    
    let violations: string[] = []
    
    for (let i = 0; i < linkCount; i++) {
      const link = links.nth(i)
      const isVisible = await link.isVisible().catch(() => false)
      
      if (!isVisible) continue
      
      const box = await link.boundingBox()
      if (!box) continue
      
      if (box.width < MIN_TAP_TARGET || box.height < MIN_TAP_TARGET) {
        const text = await link.textContent().catch(() => '[no text]')
        violations.push(`Link "${text?.substring(0, 30)}" (${Math.round(box.width)}x${Math.round(box.height)})`)
      }
    }
    
    if (violations.length > 0) {
      console.log('Link tap target violations:', violations.join('\n'))
    }
    
    expect.soft(violations, `${violations.length} links have tap targets below ${MIN_TAP_TARGET}px`).toHaveLength(0)
  })

  test('[Tap Target] Form inputs meet 44px minimum on mobile', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    
    const inputs = page.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')
    const inputCount = await inputs.count()
    
    let violations: string[] = []
    
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i)
      const isVisible = await input.isVisible().catch(() => false)
      
      if (!isVisible) continue
      
      const box = await input.boundingBox()
      if (!box) continue
      
      if (box.height < MIN_TAP_TARGET) {
        const name = await input.getAttribute('name') || await input.getAttribute('placeholder') || 'input'
        violations.push(`Input "${name}" (height: ${Math.round(box.height)}px)`)
      }
    }
    
    if (violations.length > 0) {
      console.log('Input tap target violations:', violations.join('\n'))
    }
    
    expect.soft(violations, `${violations.length} inputs have height below ${MIN_TAP_TARGET}px`).toHaveLength(0)
  })

  test('[Tap Target] Icon-only buttons have proper size', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')
    
    // Find icon buttons (buttons with only icons, no text)
    // Using :has(svg) and filtering by textContent for WebKit compatibility
    const iconButtons = page.locator('button:has(svg)').filter({ hasText: /^$/ })
    const buttonCount = await iconButtons.count()
    
    let violations: string[] = []
    
    for (let i = 0; i < buttonCount; i++) {
      const button = iconButtons.nth(i)
      const isVisible = await button.isVisible().catch(() => false)
      
      if (!isVisible) continue
      
      const box = await button.boundingBox()
      if (!box) continue
      
      // Icon-only buttons are especially problematic if too small
      if (box.width < MIN_TAP_TARGET || box.height < MIN_TAP_TARGET) {
        violations.push(`Icon button (${Math.round(box.width)}x${Math.round(box.height)})`)
      }
    }
    
    if (violations.length > 0) {
      console.log('Icon button tap target violations:', violations.join('\n'))
    }
    
    // These are particularly important for accessibility
    expect.soft(violations, `${violations.length} icon buttons have tap targets below ${MIN_TAP_TARGET}px`).toHaveLength(0)
  })
})

test.describe('Tap Target Spacing (Mobile)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
  })

  test('[Spacing] Interactive elements have adequate spacing on mobile', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')
    
    // Get all button bounding boxes
    const buttons = page.locator('button:visible')
    const buttonCount = await buttons.count()
    
    const boxes: DOMRect[] = []
    
    for (let i = 0; i < buttonCount; i++) {
      const box = await buttons.nth(i).boundingBox()
      if (box) {
        boxes.push(box as unknown as DOMRect)
      }
    }
    
    // Check for overlapping buttons
    let violations: string[] = []
    
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        
        // Check if boxes overlap significantly
        const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
        const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
        
        if (overlapX > 10 && overlapY > 10) {
          violations.push(`Buttons ${i} and ${j} overlap (${Math.round(overlapX)}x${Math.round(overlapY)}px)`)
        }
      }
    }
    
    if (violations.length > 0) {
      console.log('Button overlap violations:', violations.join('\n'))
    }
    
    // Some overlap is acceptable, but significant overlap is not
    expect.soft(violations, `${violations.length} button overlap violations`).toHaveLength(0)
  })
})
