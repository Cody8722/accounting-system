import { test, expect } from '@playwright/test';
import { genUser, apiRegister, loginV2 } from './helpers.js';

/**
 * v2 核心流程（桌面外殼，viewport 1280×720）。
 * 每個 spec 只註冊一次帳號（避開註冊速率限制），每個測試各自登入。
 */
test.describe('v2 核心流程', () => {
  const user = genUser();

  test.beforeAll(async () => { await apiRegister(user); });
  test.beforeEach(async ({ page }) => { await loginV2(page, user); });

  test('用計算機鍵盤記一筆，明細出現該筆', async ({ page }) => {
    await page.click('[data-el="add"]');
    await page.waitForSelector('.overlay.center [data-el="save"]', { timeout: 10000 });

    // 展開計算機，輸入 137
    await page.click('.overlay.center [data-el="calcToggle"]');
    for (const d of ['1', '3', '7']) {
      await page.click(`.overlay.center [data-digit="${d}"]`);
    }
    await expect(page.locator('.overlay.center [data-el="amountInput"]')).toHaveValue('137', { timeout: 5000 });

    // 選分類 早餐 → 儲存
    await page.click('.overlay.center [data-leaf="早餐"]');
    await page.click('.overlay.center [data-el="save"]');

    // 桌面存完關閉彈窗，明細（預設頁）出現該筆
    await page.waitForSelector('.overlay.center', { state: 'detached', timeout: 10000 });
    await expect(page.locator('.desktop-main')).toContainText('早餐', { timeout: 10000 });
    await expect(page.locator('.desktop-main')).toContainText('137', { timeout: 10000 });
  });

  test('統計 / 預算 / 設定 皆可渲染', async ({ page }) => {
    await page.click('[data-nav="stats"]');
    await expect(page.locator('.desktop-main')).toContainText('分類佔比', { timeout: 10000 });

    await page.click('[data-nav="budget"]');
    await expect(page.locator('.desktop-main')).toContainText('總預算', { timeout: 10000 });

    await page.click('[data-nav="settings"]');
    await expect(page.locator('.desktop-main')).toContainText('帳戶管理', { timeout: 10000 });
  });

  test('主題切換並持久化到 localStorage', async ({ page }) => {
    await page.click('[data-nav="settings"]');
    await page.click('[data-theme-v="dark"]');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')), { timeout: 5000 })
      .toBe('dark');
    expect(await page.evaluate(() => localStorage.getItem('v2-theme'))).toBe('dark');
  });
});
