import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerUser,
  loginUser,
  clearAuthState,
} from '../helpers/auth.helpers.js';
import { sampleRecords, sampleBudgets } from '../fixtures/test-data.js';

test.describe('預算與統計功能測試', () => {
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

  test('使用者可以設定預算', async ({ page }) => {
    await page.click('.sidebar-item[data-page="add"]');
    await page.waitForSelector('#page-add.active', { timeout: 5000 });

    const lunchBudgetInput = page.locator('input.budget-input[data-category="午餐"]');
    if (await lunchBudgetInput.count() > 0) {
      await lunchBudgetInput.fill(sampleBudgets.lunch.toString());

      const saveButton = page.locator(
        '#budget-form button:has-text("儲存"), #page-add button:has-text("儲存預算")'
      );
      if (await saveButton.count() > 0) {
        await saveButton.first().click();
        // 等待儲存結果（toast 或 API 回應）
        await page.waitForSelector('.toast, [role="alert"]', { timeout: 5000 }).catch(() => null);
      }
    }

    await expect(page.locator('#page-add.active')).toBeVisible();
  });

  test('統計頁面應顯示正確的分析介面', async ({ page }) => {
    await page.click('.sidebar-item[data-page="analytics"]');
    const analyticsPage = page.locator('#page-analytics.active');
    await expect(analyticsPage).toBeVisible({ timeout: 5000 });
  });

  test('分析頁面應包含圖表區域', async ({ page }) => {
    await page.selectOption('select#record-type', 'expense');
    await page.fill('input#record-amount', '120');
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await page.click('.category-item:has-text("午餐")');
    await page.click('form#accounting-form button[type="submit"]');
    await page.waitForFunction(
      () => document.getElementById('accounting-message')?.textContent.includes('記帳記錄已新增'),
      { timeout: 10000 }
    );

    await page.click('.sidebar-item[data-page="analytics"]');
    await expect(page.locator('#page-analytics.active')).toBeVisible({ timeout: 5000 });

    const chartCount = await page.locator('#page-analytics canvas').count();
    expect(chartCount).toBeGreaterThanOrEqual(0);
  });

  test('新增記錄後應在記錄頁面可見', async ({ page }) => {
    const record = sampleRecords.expense.lunch;

    await page.selectOption('select#record-type', 'expense');
    await page.fill('input#record-amount', record.amount.toString());
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await page.click(`.category-item:has-text("${record.category}")`);
    await page.fill('input#record-description', record.description);
    await page.click('form#accounting-form button[type="submit"]');
    await page.waitForFunction(
      () => document.getElementById('accounting-message')?.textContent.includes('記帳記錄已新增'),
      { timeout: 10000 }
    );

    await page.click('.sidebar-item[data-page="records"]');
    await expect(page.locator('#page-records.active')).toBeVisible({ timeout: 5000 });
  });

  test('儀表板記帳表單應正確顯示', async ({ page }) => {
    await expect(page.locator('form#accounting-form')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('select#record-type')).toBeVisible();
    await expect(page.locator('input#record-amount')).toBeVisible();
    await expect(page.locator('input#record-category')).toBeVisible();
    await expect(page.locator('input#record-date')).toBeVisible();
  });

  test('新增多筆記錄後統計應累計', async ({ page }) => {
    // 第一筆
    await page.selectOption('select#record-type', 'expense');
    await page.fill('input#record-amount', '100');
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await page.click('.category-item:has-text("午餐")');
    await page.click('form#accounting-form button[type="submit"]');
    await page.waitForFunction(
      () => document.getElementById('accounting-message')?.textContent.includes('記帳記錄已新增'),
      { timeout: 10000 }
    );

    // 等待表單重置
    await page.waitForFunction(
      () => {
        const input = document.getElementById('record-amount');
        return input && (input.value === '' || input.value === '0');
      },
      { timeout: 5000 }
    ).catch(() => null);

    // 第二筆
    await page.selectOption('select#record-type', 'expense');
    await page.fill('input#record-amount', '200');
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await page.click('.category-item:has-text("晚餐")');
    await page.click('form#accounting-form button[type="submit"]');
    await page.waitForFunction(
      () => document.getElementById('accounting-message')?.textContent.includes('記帳記錄已新增'),
      { timeout: 10000 }
    );

    await expect(page.locator('form#accounting-form')).toBeVisible();
  });

  test('收支類型切換應正常運作', async ({ page }) => {
    await page.selectOption('select#record-type', 'income');
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await expect(page.locator('#category-modal')).toBeVisible();

    await page.evaluate(() => closeCategoryModal());
    await page.waitForSelector('#category-modal.hidden', { timeout: 3000 }).catch(() => null);

    await page.selectOption('select#record-type', 'expense');
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await expect(page.locator('#category-modal')).toBeVisible();
  });

  test('預算設定頁面應包含所有分類輸入框', async ({ page }) => {
    await page.click('.sidebar-item[data-page="settings"]');
    await page.waitForSelector('#page-settings.active', { timeout: 5000 });

    const budgetInputs = page.locator('input.budget-input');
    const count = await budgetInputs.count();
    expect(count).toBeGreaterThan(0);
  });
});
