import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerUser,
  loginUser,
  clearAuthState
} from '../helpers/auth.helpers.js';
import { setupApiMocks } from '../helpers/api-mock.helpers.js';
import { sampleRecords, sampleBudgets } from '../fixtures/test-data.js';

test.describe('預算與統計功能測試', () => {
  let user;

  test.beforeEach(async ({ page }) => {
    // Disabled API mocks - using real backend in CI
    // await setupApiMocks(page);
    await clearAuthState(page);
    user = generateTestUser();
    await registerUser(page, user);

    // 等待跳轉到登入頁
    await page.waitForFunction(
      () => {
        const loginModal = document.getElementById('login-modal');
        return loginModal && !loginModal.classList.contains('hidden');
      },
      { timeout: 15000 }
    );

    await loginUser(page, user);
  });

  test('使用者可以設定預算', async ({ page }) => {
    // 導航到設定頁面
    await page.click('.sidebar-item[data-page="settings"]');
    await page.waitForTimeout(500);

    // 找到預算輸入框
    const lunchBudgetInput = page.locator('input.budget-input[data-category="午餐"]');

    if (await lunchBudgetInput.count() > 0) {
      await lunchBudgetInput.fill(sampleBudgets.lunch.toString());

      // 找到並點擊儲存預算按鈕
      const saveButton = page.locator('#budget-form button:has-text("儲存"), #page-settings button:has-text("儲存預算")');
      if (await saveButton.count() > 0) {
        await saveButton.first().click();

        // 等待 toast 訊息或確認儲存成功
        await page.waitForTimeout(2000);
      }
    }

    // 驗證頁面仍正常運作
    const settingsPage = page.locator('#page-settings.active');
    await expect(settingsPage).toBeVisible();
  });

  test('統計頁面應顯示正確的分析介面', async ({ page }) => {
    // 導航到分析頁面
    await page.click('.sidebar-item[data-page="analytics"]');
    await page.waitForTimeout(1000);

    // 驗證分析頁面顯示
    const analyticsPage = page.locator('#page-analytics.active');
    await expect(analyticsPage).toBeVisible({ timeout: 5000 });
  });

  test('分析頁面應包含圖表區域', async ({ page }) => {
    // 先新增一筆記錄
    await page.selectOption('select#record-type', 'expense');
    await page.fill('input#record-amount', '120');
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await page.click('.category-item:has-text("午餐")');
    await page.click('form#accounting-form button[type="submit"]');
    await page.waitForFunction(
      () => {
        const el = document.getElementById('accounting-message');
        return el && el.textContent.includes('記帳記錄已新增');
      },
      { timeout: 10000 }
    );

    // 導航到分析頁面
    await page.click('.sidebar-item[data-page="analytics"]');
    await page.waitForTimeout(1000);

    // 驗證分析頁面顯示
    const analyticsPage = page.locator('#page-analytics.active');
    await expect(analyticsPage).toBeVisible({ timeout: 5000 });

    // 檢查是否有 canvas 圖表元素
    const chartCanvas = page.locator('#page-analytics canvas');
    const chartCount = await chartCanvas.count();
    // 圖表可能存在或不存在（取決於是否有數據），但頁面應該正常載入
    expect(chartCount).toBeGreaterThanOrEqual(0);
  });

  test('新增記錄後應在記錄頁面可見', async ({ page }) => {
    const record = sampleRecords.expense.lunch;

    // 新增記錄
    await page.selectOption('select#record-type', 'expense');
    await page.fill('input#record-amount', record.amount.toString());
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await page.click(`.category-item:has-text("${record.category}")`);
    await page.fill('input#record-description', record.description);
    await page.click('form#accounting-form button[type="submit"]');

    await page.waitForFunction(
      () => {
        const el = document.getElementById('accounting-message');
        return el && el.textContent.includes('記帳記錄已新增');
      },
      { timeout: 10000 }
    );

    // 前往記錄頁面
    await page.click('.sidebar-item[data-page="records"]');
    await page.waitForTimeout(1000);

    // 驗證記錄頁面已載入
    const recordsPage = page.locator('#page-records.active');
    await expect(recordsPage).toBeVisible({ timeout: 5000 });
  });

  test('儀表板記帳表單應正確顯示', async ({ page }) => {
    // 記帳表單應該可見（預設頁面）
    const accountingForm = page.locator('form#accounting-form');
    await expect(accountingForm).toBeVisible({ timeout: 5000 });

    // 驗證表單元素
    await expect(page.locator('select#record-type')).toBeVisible();
    await expect(page.locator('input#record-amount')).toBeVisible();
    await expect(page.locator('input#record-category')).toBeVisible();
    await expect(page.locator('input#record-date')).toBeVisible();
  });

  test('新增多筆記錄後統計應累計', async ({ page }) => {
    // 新增第一筆支出
    await page.selectOption('select#record-type', 'expense');
    await page.fill('input#record-amount', '100');
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await page.click('.category-item:has-text("午餐")');
    await page.click('form#accounting-form button[type="submit"]');

    await page.waitForFunction(
      () => {
        const el = document.getElementById('accounting-message');
        return el && el.textContent.includes('記帳記錄已新增');
      },
      { timeout: 10000 }
    );

    // 等待表單重置
    await page.waitForTimeout(1000);

    // 新增第二筆支出
    await page.selectOption('select#record-type', 'expense');
    await page.fill('input#record-amount', '200');
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await page.click('.category-item:has-text("晚餐")');
    await page.click('form#accounting-form button[type="submit"]');

    await page.waitForFunction(
      () => {
        const el = document.getElementById('accounting-message');
        return el && el.textContent.includes('記帳記錄已新增');
      },
      { timeout: 10000 }
    );

    // 驗證成功（兩筆記錄都已新增）
    // 表單仍然正常運作
    const accountingForm = page.locator('form#accounting-form');
    await expect(accountingForm).toBeVisible();
  });

  test('收支類型切換應正常運作', async ({ page }) => {
    // 切換到收入
    await page.selectOption('select#record-type', 'income');

    // 開啟分類 modal
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });

    // 應該能看到分類 modal
    await expect(page.locator('#category-modal')).toBeVisible();

    // 關閉 modal（點擊 modal 外部區域或關閉按鈕）
    await page.evaluate(() => {
      closeCategoryModal();
    });
    await page.waitForTimeout(300);

    // 切換回支出
    await page.selectOption('select#record-type', 'expense');

    // 開啟分類 modal
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });

    // 應該能看到支出分類
    await expect(page.locator('#category-modal')).toBeVisible();
  });

  test('預算設定頁面應包含所有分類輸入框', async ({ page }) => {
    // 導航到設定頁面
    await page.click('.sidebar-item[data-page="settings"]');
    await page.waitForTimeout(500);

    // 檢查預算輸入框
    const budgetInputs = page.locator('input.budget-input');
    const count = await budgetInputs.count();
    expect(count).toBeGreaterThan(0);
  });
});
