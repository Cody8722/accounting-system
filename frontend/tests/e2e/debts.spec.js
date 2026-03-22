import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerUser,
  loginUser,
  clearAuthState,
} from '../helpers/auth.helpers.js';
import { navigateToDebts, addDebt } from '../helpers/debt.helpers.js';

/**
 * 欠款追蹤 E2E 測試
 *
 * 隔離策略：per-spec-file 用戶
 * - beforeAll：只 register 一次（省時）
 * - beforeEach：每個測試 login（確保乾淨 session）
 * - 同 file 內測試串行（避免共用帳號資料競爭）
 */
test.describe('欠款追蹤 E2E 測試', () => {
  let specUser;

  test.beforeAll(async ({ browser }) => {
    specUser = generateTestUser();
    const context = await browser.newContext();
    const page = await context.newPage();
    await clearAuthState(page);
    await registerUser(page, specUser);
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
    await loginUser(page, specUser);
  });

  // -----------------------------------------------------------------------
  // 1. 新增欠款
  // -----------------------------------------------------------------------

  test('可新增借出欠款（lent）', async ({ page }) => {
    await navigateToDebts(page);
    await addDebt(page, { debt_type: 'lent', person: 'Alice', amount: 500 });

    // 確認 lent tab 顯示此卡片
    await page.waitForSelector(
      '.debt-card:has-text("Alice")',
      { timeout: 8000 }
    );
  });

  test('可新增借入欠款（borrowed）', async ({ page }) => {
    await navigateToDebts(page);
    // 先切到 borrowed tab
    await page.click('.debt-tab[data-tab="borrowed"]');
    await addDebt(page, { debt_type: 'borrowed', person: 'Bob', amount: 300 });

    await page.waitForSelector(
      '.debt-card:has-text("Bob")',
      { timeout: 8000 }
    );
  });

  test('分頁切換正確隔離 lent/borrowed', async ({ page }) => {
    await navigateToDebts(page);

    // 確保在 lent tab
    await page.click('.debt-tab[data-tab="lent"]');
    await page.waitForTimeout(500);

    // lent tab 下不應看到 borrowed 的人（Bob 是在先前測試建立的 borrowed 卡片）
    const borrowedInLent = await page
      .locator('#debts-list .debt-card:has-text("Bob")')
      .count();
    expect(borrowedInLent).toBe(0);

    // 切到 borrowed tab，Alice（lent）不應出現
    await page.click('.debt-tab[data-tab="borrowed"]');
    await page.waitForTimeout(500);
    const lentInBorrowed = await page
      .locator('#debts-list .debt-card:has-text("Alice")')
      .count();
    expect(lentInBorrowed).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 4. 表單驗證
  // -----------------------------------------------------------------------

  test('表單驗證：未填姓名顯示錯誤', async ({ page }) => {
    await navigateToDebts(page);
    await page.click('button[onclick="showDebtForm()"]');
    await page.waitForSelector('#debt-form-modal:not(.hidden)', { timeout: 8000 });

    // 不填姓名，直接送出
    await page.fill('#debt-amount', '100');
    await page.click('#debt-submit-btn');

    await expect(page.locator('#debt-error')).toBeVisible({ timeout: 5000 });
  });

  test('表單驗證：金額為 0 顯示錯誤', async ({ page }) => {
    await navigateToDebts(page);
    await page.click('button[onclick="showDebtForm()"]');
    await page.waitForSelector('#debt-form-modal:not(.hidden)', { timeout: 8000 });

    await page.fill('#debt-person', 'TestPerson');
    await page.fill('#debt-amount', '0');
    await page.click('#debt-submit-btn');

    await expect(page.locator('#debt-error')).toBeVisible({ timeout: 5000 });
  });

  // -----------------------------------------------------------------------
  // 6. 還款
  // -----------------------------------------------------------------------

  test('可對欠款進行部分還款', async ({ page }) => {
    await navigateToDebts(page);
    await addDebt(page, { debt_type: 'lent', person: 'RepayTest', amount: 1000 });

    // 展開卡片（點擊）
    await page.click('.debt-card:has-text("RepayTest") .p-3.cursor-pointer');

    // 填入還款金額（使用前綴選取避免硬編 ObjectId）
    const repayInput = page.locator('[id^="repay-input-"]').first();
    await repayInput.fill('300');

    // 點擊還款按鈕，等待 API 回應
    const repayResponse = page.waitForResponse(
      (r) => r.url().includes('/repay') && r.status() === 200,
      { timeout: 10000 }
    );
    await page.locator('.debt-card:has-text("RepayTest") button:has-text("確認還款")').click();
    await repayResponse;

    // 確認 Toast 出現（toast 無 class/id，改用 body.innerText 偵測）
    await page.waitForFunction(
      () => document.body.innerText.includes('還款'),
      { timeout: 5000 }
    );
  });

  test('全額還款自動標記結清', async ({ page }) => {
    await navigateToDebts(page);
    await addDebt(page, { debt_type: 'lent', person: 'FullRepay', amount: 200 });

    // 展開卡片
    await page.click('.debt-card:has-text("FullRepay") .p-3.cursor-pointer');

    const repayInput = page.locator('[id^="repay-input-"]').first();
    await repayInput.fill('200');

    const repayResponse = page.waitForResponse(
      (r) => r.url().includes('/repay') && r.status() === 200,
      { timeout: 10000 }
    );
    await page.locator('.debt-card:has-text("FullRepay") button:has-text("確認還款")').click();
    await repayResponse;

    // 重新整理後已結清欠款不在未結清列表
    await page.reload({ waitUntil: 'domcontentloaded' });
    await navigateToDebts(page);
    await page.waitForTimeout(1000);

    // 在未結清列表中不應出現
    const cards = await page.locator('.debt-card:has-text("FullRepay")').count();
    expect(cards).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 8. 結清欠款
  // -----------------------------------------------------------------------

  test('可手動結清欠款', async ({ page }) => {
    await navigateToDebts(page);
    await addDebt(page, { debt_type: 'lent', person: 'SettleTest', amount: 500 });

    // 展開卡片，點結清按鈕
    await page.click('.debt-card:has-text("SettleTest") .p-3.cursor-pointer');

    const settleResponse = page.waitForResponse(
      (r) => r.url().includes('/settle') && r.status() === 200,
      { timeout: 10000 }
    );
    await page.locator('.debt-card:has-text("SettleTest") button:has-text("結清")').click();
    await settleResponse;

    // 確認 Toast 出現（toast 無 class/id，改用 body.innerText 偵測）
    await page.waitForFunction(
      () => document.body.innerText.includes('結清'),
      { timeout: 5000 }
    );
  });

  test('可取消結清（二次點擊恢復未結清）', async ({ page }) => {
    await navigateToDebts(page);
    await addDebt(page, { debt_type: 'lent', person: 'ToggleSettle', amount: 400 });

    // 展開並結清
    await page.click('.debt-card:has-text("ToggleSettle") .p-3.cursor-pointer');
    const r1 = page.waitForResponse(
      (r) => r.url().includes('/settle') && r.status() === 200,
      { timeout: 10000 }
    );
    await page.locator('.debt-card:has-text("ToggleSettle") button:has-text("結清")').click();
    await r1;

    // 結清後 UI 預設不顯示已結清卡片，透過 API 直接取消結清
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    const debts = await page.evaluate(async (t) => {
      const r = await fetch('/admin/api/debts?show_settled=true', {
        headers: { Authorization: `Bearer ${t}` },
      });
      return r.json();
    }, token);
    const debt = debts.find((d) => d.person === 'ToggleSettle');
    // 再呼叫 settle 一次（toggle 回未結清）
    await page.evaluate(
      async ({ debtId, t }) => {
        await fetch(`/admin/api/debts/${debtId}/settle`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}` },
        });
      },
      { debtId: debt._id.$oid, t: token }
    );

    // reload 後確認卡片重新出現在未結清列表
    await page.reload({ waitUntil: 'domcontentloaded' });
    await navigateToDebts(page);
    await page.waitForSelector('.debt-card:has-text("ToggleSettle")', { timeout: 8000 });
  });

  // -----------------------------------------------------------------------
  // 10. 編輯欠款
  // -----------------------------------------------------------------------

  test('可編輯欠款記錄', async ({ page }) => {
    await navigateToDebts(page);
    await addDebt(page, { debt_type: 'lent', person: 'EditTest', amount: 300 });

    // 展開卡片，點編輯
    await page.click('.debt-card:has-text("EditTest") .p-3.cursor-pointer');
    await page.waitForTimeout(300);

    await page.locator('.debt-card:has-text("EditTest") button:has-text("編輯")').click();
    await page.waitForSelector('#debt-form-modal:not(.hidden)', { timeout: 8000 });

    // 確認預填了舊 person
    await expect(page.locator('#debt-person')).toHaveValue('EditTest');

    // 改 person
    await page.fill('#debt-person', 'EditedPerson');

    const updateResponse = page.waitForResponse(
      (r) => r.url().includes('/admin/api/debts/') && r.status() === 200,
      { timeout: 10000 }
    );
    await page.click('#debt-submit-btn');
    await updateResponse;

    // Modal 關閉後卡片顯示新名稱
    await page.waitForSelector('#debt-form-modal.hidden', { timeout: 8000 });
    await page.waitForSelector('.debt-card:has-text("EditedPerson")', { timeout: 8000 });
  });

  // -----------------------------------------------------------------------
  // 11. 刪除欠款
  // -----------------------------------------------------------------------

  test('可刪除欠款（確認後）', async ({ page }) => {
    await navigateToDebts(page);
    await addDebt(page, { debt_type: 'lent', person: 'DeleteTest', amount: 100 });

    // 展開卡片，點刪除
    await page.click('.debt-card:has-text("DeleteTest") .p-3.cursor-pointer');
    await page.waitForTimeout(300);

    // 等待自訂 showConfirm() DOM overlay（非 native dialog）
    const deleteResponse = page.waitForResponse(
      (r) =>
        r.url().includes('/admin/api/debts/') &&
        r.request().method() === 'DELETE' &&
        r.status() === 200,
      { timeout: 10000 }
    );
    await page.locator('.debt-card:has-text("DeleteTest") button:has-text("刪除")').click();
    await page.waitForSelector('#sc-ok', { timeout: 5000 });
    await page.click('#sc-ok');
    await deleteResponse;

    // 卡片消失
    await expect(
      page.locator('.debt-card:has-text("DeleteTest")')
    ).toHaveCount(0, { timeout: 8000 });
  });

  test('取消刪除不會刪除欠款', async ({ page }) => {
    await navigateToDebts(page);
    await addDebt(page, { debt_type: 'lent', person: 'CancelDelete', amount: 100 });

    // 展開卡片
    await page.click('.debt-card:has-text("CancelDelete") .p-3.cursor-pointer');
    await page.waitForTimeout(300);

    await page.locator('.debt-card:has-text("CancelDelete") button:has-text("刪除")').click();
    // 等待自訂 showConfirm() DOM overlay，點取消
    await page.waitForSelector('#sc-cancel', { timeout: 5000 });
    await page.click('#sc-cancel');
    await page.waitForTimeout(500);

    // 卡片依然存在
    await expect(
      page.locator('.debt-card:has-text("CancelDelete")')
    ).toHaveCount(1, { timeout: 5000 });
  });

  // -----------------------------------------------------------------------
  // 13. 財務概覽
  // -----------------------------------------------------------------------

  test('財務概覽反映欠款狀態', async ({ page }) => {
    await navigateToDebts(page);
    await addDebt(page, { debt_type: 'lent', person: 'OverviewTest', amount: 800 });

    // 導航到財務概覽（analytics 頁有 #total-receivable）
    await page.click('.sidebar-item[data-page="analytics"]');
    await page.waitForSelector('#page-analytics.active', { timeout: 5000 });

    // 等待 overview 載入（不再是 ---）
    await page.waitForFunction(
      () => {
        const el = document.getElementById('total-receivable');
        return el && el.textContent !== '---' && el.textContent !== '$0.00';
      },
      { timeout: 10000 }
    );

    const text = await page.locator('#total-receivable').textContent();
    expect(text).not.toBe('---');
  });

  // -----------------------------------------------------------------------
  // 14. 未登入保護
  // -----------------------------------------------------------------------

  test('未登入訪問欠款頁跳轉登入', async ({ page }) => {
    // 清除 auth 狀態
    await clearAuthState(page);

    // 嘗試直接導航到欠款頁
    await page.goto('/#debts', { waitUntil: 'domcontentloaded', timeout: 10000 });

    // 登入 modal 應出現
    await page.waitForSelector('#login-modal:not(.hidden)', { timeout: 10000 });
    await expect(page.locator('#login-modal')).not.toHaveClass(/hidden/);
  });
});
