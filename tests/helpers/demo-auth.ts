import type { Page } from '@playwright/test'

/**
 * Sets up demo authentication for Playwright tests.
 *
 * AuthContext checks TWO localStorage keys to enter demo mode:
 *   1. `avenize_demo` === 'true'   (flags the feature on)
 *   2. `avenize_demo_user` (JSON user object)
 *
 * Previously each test file only set `avenize_demo_user`, so `isDemo`
 * stayed false in AuthContext — RequireAuth redirected every /app/*
 * test to /login before the actual page under test ever rendered.
 */
export async function setupDemoAuth(page: Page): Promise<void> {
  await page.goto('/login')
  await page.evaluate(() => {
    // Must set BOTH keys for AuthContext to enter demo mode
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
}
