import { test, expect } from '@playwright/test';
import { genUser, apiRegister, loginV2 } from './helpers.js';

/**
 * v2 自助刪除帳號：密碼確認 → 進垃圾桶 → 回登入畫面（顯示提示）→ 用同帳號登入時問要不要還原。
 * 同一 spec 內串行（config 已設），共用一個帳號（註冊端點每 IP 每小時 5 次，只註冊一次）。
 */
test.describe.configure({ mode: 'serial' });

test.describe('v2 自助刪除帳號', () => {
  const user = genUser();

  test.beforeAll(async () => {
    await apiRegister(user);
  });

  async function openDeleteSheet(page) {
    // 登入後首頁還在載入時切頁，慢載入的首頁可能蓋掉設定頁（路由競態，修在分類自訂 PR）；先等網路靜止
    await page.waitForLoadState('networkidle');
    await page.click('[data-nav="settings"]');
    await page.click('[data-act="account"]');
    await page.click('[data-el="delAccount"]');
    await page.waitForSelector('[data-el="confirm"]', { timeout: 10000 });
  }

  test('密碼錯誤：不會刪除、也不會被登出', async ({ page }) => {
    await loginV2(page, user);
    await openDeleteSheet(page);
    await page.fill('[data-el="pw"]', 'definitely-wrong-password');
    await page.click('[data-el="confirm"]');
    await page.click('.overlay.center [data-act="ok"]');
    // 仍在 App 內（沒被當成登入過期踢出），刪除面板還在
    await expect(page.locator('[data-el="confirm"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.sidebar, .tabbar').first()).toBeAttached();
    await expect(page.locator('.auth-card')).toHaveCount(0);
  });

  test('刪除後回到登入畫面並顯示還原提示；登入時可選擇還原', async ({ page }) => {
    await loginV2(page, user);
    await openDeleteSheet(page);
    await page.check('input[name="retention"][value="7"]');
    await page.fill('[data-el="pw"]', user.password);
    await page.click('[data-el="confirm"]');
    await page.click('.overlay.center [data-act="ok"]');

    // 回到登入畫面，副標顯示保留期與還原方式
    await page.waitForSelector('.auth-card [data-el="email"]', { timeout: 15000 });
    await expect(page.locator('.auth-card [data-el="sub"]')).toContainText('帳號已刪除', { timeout: 10000 });

    // 垃圾桶中的帳號登入：問是否還原；先按「不用了」→ 仍在登入畫面
    await page.fill('.auth-card [data-el="email"]', user.email);
    await page.fill('.auth-card [data-el="password"]', user.password);
    await page.click('.auth-card [data-el="submit"]');
    await page.waitForSelector('.overlay.center [data-act="cancel"]', { timeout: 10000 });
    await page.click('.overlay.center [data-act="cancel"]');
    await expect(page.locator('.auth-card [data-el="email"]')).toBeVisible();

    // 再登入一次，這次還原 → 進入 App
    await page.click('.auth-card [data-el="submit"]');
    await page.waitForSelector('.overlay.center [data-act="ok"]', { timeout: 10000 });
    await page.click('.overlay.center [data-act="ok"]');
    await page.waitForSelector('.sidebar, .tabbar', { timeout: 20000 });
  });
});
