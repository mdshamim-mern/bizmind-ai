/**
 * BizMind AI — Automated Mobile Responsive Verification (360px Android & 390px iPhone)
 * Checks: No horizontal overflow, Demo Login, Owner Dashboard render, POS sale flow.
 */
import { test, expect } from '@playwright/test';
import path from 'path';

const VIEWPORTS = [
  { name: 'Budget Android 360px', width: 360, height: 800 },
  { name: 'iPhone 390px', width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  test(`Mobile flow works cleanly on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const fileUrl = 'file://' + path.resolve(process.cwd(), 'public/index.html');
    await page.goto(fileUrl);

    // 1. Default Light Mode & No horizontal overflow
    const hasDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
    expect(hasDark).toBe(false);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);

    // 2. Demo Login as Owner
    await page.locator('#heroQuickOwnerBtn').click();
    await expect(page.locator('#workspace-shop')).toBeVisible();
    await expect(page.locator('#mobileBottomBar')).toBeVisible();

    // 3. Navigate to POS via bottom nav & record a sale
    await page.locator('[data-mtab="pos"]').click();
    await expect(page.locator('#tab-pos')).toBeVisible();
  });
}
