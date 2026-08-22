import { chromium } from '@playwright/test';
const BASE = 'https://work-1-fplpdbsqftmtbwns.prod-runtime.all-hands.dev';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => { const t = m.text(); if (!t.includes('Global error handlers')) console.log('[console]', m.type(), t.slice(0, 300)); });
page.on('response', async r => {
  if (r.url().includes('/rest/v1/tasks')) {
    let body = '';
    try { body = (await r.text()).slice(0, 200); } catch {}
    console.log('[net]', r.status(), r.url().split('?')[0], body);
  }
});
await page.goto(BASE + '/login');
await page.fill('input[placeholder="Email"]', 'amara@sunriseventures.test');
await page.fill('input[placeholder="Password"]', 'Journey!2026x');
await page.click('button:has-text("Sign in")');
await page.waitForURL('**/app**', { timeout: 20000 });
console.log('landed on', page.url());
await page.goto(BASE + '/app/tasks');
await page.waitForTimeout(5000);
console.log('tasks page content snippet:');
console.log((await page.textContent('body')).replace(/\s+/g, ' ').slice(0, 400));
await browser.close();
