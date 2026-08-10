import { test, expect } from '@playwright/test'

/**
 * Gap-fill module tests — verify the new pages built to close the docs-vs-
 * codebase audit gaps render and don't 404. Covers the P0/P1 modules:
 * Executive Cockpit, Company Wall, Market Index, Legal, Procurement RFQ,
 * Organizational Memory, Reality Gap, Self-Audit.
 */

const NEW_PAGES = [
  { name: 'Executive Cockpit', path: '/app/cockpit' },
  { name: 'Company Wall', path: '/app/wall' },
  { name: 'Market Index', path: '/app/market' },
  { name: 'Legal', path: '/app/legal' },
  { name: 'Procurement', path: '/app/procurement' },
  { name: 'Organizational Memory', path: '/app/memory' },
  { name: 'Reality Gap', path: '/app/reality-gap' },
  { name: 'Self-Audit', path: '/app/self-audit' },
]

test.describe('Gap-fill modules', () => {
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

  for (const p of NEW_PAGES) {
    test(`[Gap-fill] ${p.name} renders without 404`, async ({ page }) => {
      await page.goto(p.path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      const notFound = await page.getByText(/page not found|404/i).isVisible().catch(() => false)
      expect(notFound, `${p.name} should not 404`).toBe(false)

      // The page should render an h1 heading
      const h1 = page.locator('h1')
      await expect(h1, `${p.name} should render a heading`).toBeVisible({ timeout: 5000 })
    })
  }

  test('[Gap-fill] Executive Cockpit has CEO/CFO/COO lens switcher', async ({ page }) => {
    await page.goto('/app/cockpit')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /Executive Cockpit/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /CEO/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /CFO/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /COO/i })).toBeVisible()
  })

  test('[Gap-fill] Legal has contract/case/obligation tabs', async ({ page }) => {
    await page.goto('/app/legal')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /Legal/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /contracts/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /cases/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /obligations/i })).toBeVisible()
  })

  test('[Gap-fill] Company Wall shows filter tabs', async ({ page }) => {
    await page.goto('/app/wall')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /Company Wall/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /Recognition/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Announcements/i })).toBeVisible()
  })
})
