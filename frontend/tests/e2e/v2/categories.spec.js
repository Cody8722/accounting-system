import { test, expect } from '@playwright/test';
import { genUser, apiRegister, loginV2, authToken, BACKEND } from './helpers.js';

/**
 * 自訂分類（我的 → 分類設定）：新增大類／細項、自訂顏色、記一筆用得到、
 * 改名後舊記錄跟著改。桌面外殼（1280×720），同 spec 串行，共用一個帳號。
 */
test.describe('v2 自訂分類', () => {
  const user = genUser();

  test.beforeAll(async () => { await apiRegister(user); });
  test.beforeEach(async ({ page }) => { await loginV2(page, user); });

  /** 編輯器最上層的彈窗（大類／細項表單會疊在編輯器上面） */
  const top = (page) => page.locator('.overlay').last();

  async function openEditor(page) {
    await page.click('[data-nav="settings"]');
    await page.locator('.desktop-main [data-act="category"]').click();
    await expect(page.locator('.overlay [data-act="save"]')).toBeVisible({ timeout: 10000 });
  }

  async function confirmWithdrawalIfNeeded(page) {
    const confirmBtn = page.locator('.sheet.dialog [data-act="ok"]');
    try {
      await confirmBtn.waitFor({ state: 'visible', timeout: 8000 });
      await confirmBtn.click();
    } catch {
      // 現金足夠、沒跳確認框
    }
  }

  const token = authToken;

  test('新增大類與細項、自選顏色，儲存後記一筆選得到，且明細顯示', async ({ page }) => {
    await openEditor(page);

    // 新增大類「寵物」
    await page.getByText('＋ 新增大類').click();
    await top(page).locator('[data-el="name"]').fill('寵物');
    await top(page).locator('[data-ok]').click();

    // 在新大類下新增細項「飼料」，並挑色盤第 2 色
    await page.locator('.overlay [data-act="add-item"]').last().click();
    await top(page).locator('[data-el="name"]').fill('飼料');
    await top(page).locator('[data-color]').nth(1).click();
    await top(page).locator('[data-ok]').click();
    await expect(page.locator('.overlay [data-act="item"]').filter({ hasText: '飼料' })).toBeVisible();

    await page.locator('.overlay [data-act="save"]').click();
    await expect(page.locator('.overlay [data-act="save"]')).toHaveCount(0, { timeout: 10000 });

    // 後端存了細項顏色（挑了色盤的顏色，不是沿用大類）
    const res = await fetch(`${BACKEND}/api/user/categories`, { headers: { Authorization: `Bearer ${await token(page)}` } });
    const body = await res.json();
    expect(body.config.expense.map((g) => g.group)).toContain('寵物');
    expect(body.config.leaf_colors['飼料']).toMatch(/^#[0-9a-f]{6}$/);

    // 重新整理後仍在；記一筆時選得到並存進明細
    await page.reload();
    await page.waitForSelector('.sidebar, .tabbar', { timeout: 20000 });
    await page.click('[data-nav="ledger"]');
    await page.waitForSelector('.desktop-main [data-type="all"]', { timeout: 10000 });
    await page.click('[data-el="add"]');
    await page.waitForSelector('.overlay.center [data-el="save"]', { timeout: 10000 });
    await page.fill('.overlay.center [data-el="amountInput"]', '88');
    await page.click('.overlay.center [data-leaf="飼料"]');
    await page.click('.overlay.center [data-el="save"]');
    await confirmWithdrawalIfNeeded(page);
    await page.waitForSelector('.overlay.center', { state: 'detached', timeout: 10000 });
    await expect(page.locator('.desktop-main')).toContainText('飼料', { timeout: 10000 });
  });

  test('改名後舊記錄跟著改', async ({ page }) => {
    await openEditor(page);
    await page.locator('.overlay [data-act="item"]').filter({ hasText: '飼料' }).click();
    await top(page).locator('[data-el="name"]').fill('貓糧');
    await top(page).locator('[data-ok]').click();
    await page.locator('.overlay [data-act="save"]').click();
    await expect(page.locator('.overlay [data-act="save"]')).toHaveCount(0, { timeout: 10000 });

    await page.click('[data-nav="ledger"]');
    await page.waitForSelector('.desktop-main [data-type="all"]', { timeout: 10000 });
    await expect(page.locator('.desktop-main')).toContainText('貓糧', { timeout: 10000 });
    await expect(page.locator('.desktop-main')).not.toContainText('飼料');
  });

  test('刪除有記錄的細項：要選改歸到哪裡，記錄不會消失', async ({ page }) => {
    await openEditor(page);
    await page.locator('.overlay [data-act="item"]').filter({ hasText: '貓糧' }).click();
    await top(page).locator('[data-del]').click();
    // 這個細項有 1 筆記錄，所以會問要改歸到哪
    await expect(top(page)).toContainText('改歸到哪個分類');
    await top(page).locator('select').selectOption({ label: '飲食 › 早餐' });
    await top(page).locator('[data-ok]').click();
    await page.locator('.overlay [data-act="save"]').click();
    await expect(page.locator('.overlay [data-act="save"]')).toHaveCount(0, { timeout: 10000 });

    await page.click('[data-nav="ledger"]');
    await page.waitForSelector('.desktop-main [data-type="all"]', { timeout: 10000 });
    await expect(page.locator('.desktop-main')).toContainText('早餐', { timeout: 10000 });
    await expect(page.locator('.desktop-main')).not.toContainText('貓糧');
  });

  test('還原成內建分類', async ({ page }) => {
    await openEditor(page);
    await page.getByText('還原成內建分類').click();
    await page.locator('.sheet.dialog [data-act="ok"]').click();
    await expect(page.locator('.overlay [data-act="save"]')).toHaveCount(0, { timeout: 10000 });
    const res = await fetch(`${BACKEND}/api/user/categories`, { headers: { Authorization: `Bearer ${await token(page)}` } });
    expect((await res.json()).config).toBeNull();
  });
});
