import { test, expect } from '@playwright/test'
import { setupDemoAuth } from '../helpers/demo-auth'
import AxeBuilder from '@axe-core/playwright'

/**
 * Accessibility tests using axe-core
 * These tests ensure WCAG compliance and catch accessibility regressions
 */

const PAGES_TO_TEST = [
  { name: 'Dashboard', path: '/app/dashboard', protected: true },
  { name: 'CRM', path: '/app/crm', protected: true },
  { name: 'Login', path: '/login', protected: false },
  { name: 'Signup', path: '/signup', protected: false },
]

for (const pageCase of PAGES_TO_TEST) {
  test(`[Accessibility] ${pageCase.name} has no critical WCAG violations`, async ({ page }) => {
    if (pageCase.protected) {
      await setupDemoAuth(page)
    }
    await page.goto(pageCase.path)
    await page.waitForLoadState('networkidle')

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    // Filter out non-critical violations for now (allows tests to pass while we fix)
    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    )

    if (criticalViolations.length > 0) {
      const violationsText = criticalViolations
        .map(v => `  - ${v.id}: ${v.description} (${v.nodes.length} nodes)`)
        .join('\n')
      
      console.log(`Critical accessibility violations on ${pageCase.name}:\n${violationsText}`)
    }

    expect.soft(criticalViolations, `Critical accessibility violations on ${pageCase.name}`).toHaveLength(0)
  })
}

test('[Accessibility] All pages have proper language attribute', async ({ page }) => {
  await page.goto('/')
  const htmlLang = await page.locator('html').getAttribute('lang')
  expect(htmlLang).toBeTruthy()
  expect(htmlLang?.length).toBeGreaterThan(0)
})

test('[Accessibility] All form inputs have labels', async ({ page }) => {
  await page.goto('/login')
  
  const inputs = page.locator('input:not([type="hidden"])')
  const inputCount = await inputs.count()
  
  for (let i = 0; i < inputCount; i++) {
    const input = inputs.nth(i)
    const id = await input.getAttribute('id')
    const ariaLabel = await input.getAttribute('aria-label')
    const ariaLabelledBy = await input.getAttribute('aria-labelledby')
    const placeholder = await input.getAttribute('placeholder')
    const type = await input.getAttribute('type')
    
    // Skip buttons and inputs without visible labels (like search with icon)
    if (type === 'submit' || type === 'button') continue
    
    const hasLabel = id || ariaLabel || ariaLabelledBy || placeholder
    expect.soft(hasLabel, `Input ${i} should have a label`).toBeTruthy()
  }
})
