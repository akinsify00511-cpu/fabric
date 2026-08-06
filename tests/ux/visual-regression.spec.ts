import { test, expect } from '@playwright/test'
import path from 'path'
import { setupDemoAuth } from '../helpers/demo-auth'

/**
 * Visual regression tests
 * Compares screenshots against baselines to catch unintended UI changes
 */

const PAGES_TO_SNAPSHOT = [
  { name: 'Login', path: '/login', protected: false },
  { name: 'Signup', path: '/signup', protected: false },
  { name: 'Dashboard', path: '/app/dashboard', protected: true },
  { name: 'CRM', path: '/app/crm', protected: true },
]

test.describe('Visual Regression', () => {
  // NOTE: the loop variable was previously also named `page`, fully shadowed
  // by the destructured Playwright `page` fixture inside the test callback
  // below. Every `page.path`/`page.name` reference in this file was
  // therefore reading undefined properties off the Playwright Page object,
  // not the loop item — `page.name.toLowerCase()` crashes with a TypeError
  // in CI (process.env.CI branch), and `page.goto(page.path)` navigated to
  // undefined for every one of the four snapshot tests.
  for (const pageCase of PAGES_TO_SNAPSHOT) {
    test(`[Visual] ${pageCase.name} matches baseline`, async ({ page }) => {
      if (pageCase.protected) {
        await setupDemoAuth(page)
      }
      await page.goto(pageCase.path)
      await page.waitForLoadState('networkidle')
      
      // Wait for any animations to complete
      await page.waitForTimeout(500)
      
      const screenshot = await page.screenshot({
        fullPage: false,
      })
      
      // Store baseline hash for comparison
      const screenshotHash = await page.evaluate((buffer) => {
        // Simple hash for comparison
        let hash = 0
        for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
          hash = ((hash << 5) - hash) + buffer[i]
          hash = hash & hash
        }
        return hash.toString(16)
      }, Buffer.from(screenshot))
      
      // In CI, compare against baseline
      if (process.env.CI) {
        const baselinePath = path.join(__dirname, 'baselines', `${pageCase.name.toLowerCase()}.png`)
        const fs = await import('fs')
        
        if (fs.existsSync(baselinePath)) {
          const baseline = fs.readFileSync(baselinePath)
          const baselineHash = await page.evaluate((buffer) => {
            let hash = 0
            for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
              hash = ((hash << 5) - hash) + buffer[i]
              hash = hash & hash
            }
            return hash.toString(16)
          }, baseline)
          
          // Screenshots should be similar (allow for some variance due to dynamic content)
          const similarity = calculateSimilarity(screenshot, baseline)
          expect(similarity, 'Screenshot similarity should be > 90%').toBeGreaterThan(0.9)
        }
      }
      
      // Always save screenshot for review
      const fs = await import('fs')
      const screenshotsDir = path.join(__dirname, 'screenshots')
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true })
      }
      
      const outputPath = path.join(screenshotsDir, `${pageCase.name.toLowerCase()}-${Date.now()}.png`)
      fs.writeFileSync(outputPath, screenshot)
      
      console.log(`Screenshot saved to: ${outputPath}`)
    })
  }
})

test.describe('Layout Tests', () => {
  test('[Layout] No overlapping elements on dashboard', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')
    
    // Check for overlapping elements using JavaScript
    const overlaps = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'))
      const rects: { el: Element; rect: DOMRect }[] = []
      
      for (const el of elements) {
        if (el.children.length === 0 || el.tagName === 'BUTTON' || el.tagName === 'A') {
          const rect = el.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            rects.push({ el, rect })
          }
        }
      }
      
      const overlaps: { text1: string; text2: string }[] = []
      
      for (let i = 0; i < Math.min(rects.length, 100); i++) {
        for (let j = i + 1; j < Math.min(rects.length, 100); j++) {
          const a = rects[i].rect
          const b = rects[j].rect
          
          // Check for significant overlap
          const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
          const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
          
          if (overlapX > a.width * 0.5 && overlapY > a.height * 0.5) {
            overlaps.push({
              text1: rects[i].el.textContent?.substring(0, 30) || rects[i].el.tagName,
              text2: rects[j].el.textContent?.substring(0, 30) || rects[j].el.tagName,
            })
          }
        }
      }
      
      return overlaps
    })
    
    if (overlaps.length > 0) {
      console.log('Overlapping elements found:', overlaps)
    }
    
    expect(overlaps, 'No significant element overlaps').toHaveLength(0)
  })

  test('[Layout] Text is not cut off', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForLoadState('networkidle')
    
    // Check for truncated text that shouldn't be
    const issues = await page.evaluate(() => {
      const issues: string[] = []
      
      const elements = document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6')
      
      for (const el of elements) {
        const style = window.getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        
        // Check if text is being cut off
        if (el.scrollWidth > rect.width && el.scrollHeight > rect.height) {
          // Text overflow is happening
          if (style.overflow !== 'hidden' && style.textOverflow !== 'ellipsis') {
            issues.push(`${el.tagName}: "${el.textContent?.substring(0, 30)}" is cut off`)
          }
        }
      }
      
      return issues.slice(0, 10) // Limit to first 10 issues
    })
    
    if (issues.length > 0) {
      console.log('Text overflow issues:', issues)
    }
    
    // This is a soft check - some overflow is intentional
    expect.soft(issues.length, 'Minimal text overflow issues').toBeLessThan(5)
  })
})

// Simple similarity calculation
async function calculateSimilarity(img1: Buffer, img2: Buffer): Promise<number> {
  if (img1.length !== img2.length) return 0
  
  let matches = 0
  for (let i = 0; i < img1.length; i += 100) {
    if (img1[i] === img2[i]) matches++
  }
  
  return matches / (img1.length / 100)
}
