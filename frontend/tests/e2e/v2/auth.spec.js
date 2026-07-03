import { test, expect } from '@playwright/test';
import { genUser } from './helpers.js';

/**
 * v2 認證（自帶 DOM，非現行 #login-modal）。
 * 同一 spec 內串行（config 已設）。
 */
test.describe('v2 認證', () => {
  test('可透過 v2 UI 註冊並登入', async ({ page }) => {
    const user = genUser();
    await page.goto('/v2/');
    await page.waitForSelector('.auth-card [data-el="switch"]', { timeout: 15000 });

    // 切到註冊模式
    await page.click('.auth-card [data-el="switch"]');
    await expect(page.locator('.auth-card [data-el="submit"]')).toHaveText('註冊');
    await page.fill('.auth-card [data-el="name"]', user.name);
    await page.fill('.auth-card [data-el="email"]', user.email);
    await page.fill('.auth-card [data-el="password"]', user.password);
    await page.click('.auth-card [data-el="submit"]');

    // 註冊成功後自動切回登入模式（按鈕文字變「登入」）
    await expect(page.locator('.auth-card [data-el="submit"]')).toHaveText('登入', { timeout: 15000 });

    // 登入
    await page.fill('.auth-card [data-el="email"]', user.email);
    await page.fill('.auth-card [data-el="password"]', user.password);
    await page.click('.auth-card [data-el="submit"]');

    // App 外殼出現
    await page.waitForSelector('.sidebar, .tabbar', { timeout: 20000 });
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).not.toBeNull();
  });

  test('錯誤憑證顯示錯誤訊息', async ({ page }) => {
    await page.goto('/v2/');
    await page.waitForSelector('.auth-card [data-el="email"]', { timeout: 15000 });
    await page.fill('.auth-card [data-el="email"]', 'nobody@example.com');
    await page.fill('.auth-card [data-el="password"]', 'WrongPassw0rd!');
    await page.click('.auth-card [data-el="submit"]');

    await expect(page.locator('.auth-card [data-el="err"]')).toBeVisible({ timeout: 15000 });
    // 仍停在登入頁（未進入 App）
    expect(await page.locator('.sidebar, .tabbar').count()).toBe(0);
  });
});
