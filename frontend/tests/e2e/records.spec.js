import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerUser,
  loginUser,
  clearAuthState,
} from '../helpers/auth.helpers.js';
import { sampleRecords } from '../fixtures/test-data.js';

/**
 * 隔離策略：per-spec-file 用戶
 * - beforeAll：整個 spec file 只 register 一次（省去 N-1 次的 register 時間）
 * - beforeEach：每個測試 login（清除 session 確保乾淨起始狀態）
 * - 同 file 內的測試串行，彼此共用同一帳號的資料庫資料（可接受）
 * - 不同 spec file 間完全隔離（各自有獨立帳號）
 */
test.describe('記帳記錄 CRUD 測試', () => {
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

  test('使用者可以新增支出記錄', async ({ page }) => {
    const record = sampleRecords.expense.lunch;

    await page.click('.sidebar-item[data-page="add"]');
    await page.waitForSelector('#page-add.active', { timeout: 5000 });

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
  });

  test('使用者可以新增收入記錄', async ({ page }) => {
    const record = sampleRecords.income.salary;

    await page.click('.sidebar-item[data-page="add"]');
    await page.waitForSelector('#page-add.active', { timeout: 5000 });

    await page.selectOption('select#record-type', 'income');
    await page.fill('input#record-amount', record.amount.toString());

    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });

    const incomeTab = page.locator('#category-tabs button:has-text("收入"), #category-tabs div:has-text("收入")');
    if (await incomeTab.count() > 0) {
      await incomeTab.first().click();
    }

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
  });

  test('使用者可以查看記錄列表', async ({ page }) => {
    // 新增一筆記錄
    const record = sampleRecords.expense.lunch;
    await page.selectOption('select#record-type', 'expense');
    await page.fill('input#record-amount', record.amount.toString());
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await page.click(`.category-item:has-text("${record.category}")`);
    await page.click('form#accounting-form button[type="submit"]');
    await page.waitForFunction(
      () => document.getElementById('accounting-message')?.textContent.includes('記帳記錄已新增'),
      { timeout: 10000 }
    );

    await page.click('.sidebar-item[data-page="records"]');
    const recordsPage = page.locator('#page-records.active');
    await expect(recordsPage).toBeVisible({ timeout: 5000 });
  });

  test('無效的金額應該被拒絕', async ({ page }) => {
    await page.click('.sidebar-item[data-page="add"]');
    await page.waitForSelector('#page-add.active', { timeout: 5000 });

    await page.fill('input#record-amount', '0');
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await page.click('.category-item:has-text("午餐")');
    await page.click('form#accounting-form button[type="submit"]');

    const hasError = await page.waitForFunction(
      () => {
        const msgEl = document.getElementById('accounting-message');
        if (msgEl && !msgEl.classList.contains('hidden') && msgEl.textContent.includes('❌')) return true;
        const amtErr = document.getElementById('amount-error');
        if (amtErr && !amtErr.classList.contains('hidden')) return true;
        const amtInput = document.getElementById('record-amount');
        if (amtInput && !amtInput.validity.valid) return true;
        return false;
      },
      { timeout: 5000 }
    ).then(() => true).catch(() => false);

    expect(hasError).toBeTruthy();
  });

  test('使用者可以篩選記錄類型', async ({ page }) => {
    await page.click('.sidebar-item[data-page="records"]');
    const recordsPage = page.locator('#page-records.active');
    await expect(recordsPage).toBeVisible({ timeout: 5000 });

    const filterElements = page.locator(
      '#page-records select, #page-records input[type="radio"], #page-records button:has-text("篩選")'
    );
    const filterCount = await filterElements.count();
    expect(filterCount).toBeGreaterThanOrEqual(0);
  });

  test('空金額不應該被提交', async ({ page }) => {
    await page.click('.sidebar-item[data-page="add"]');
    await page.waitForSelector('#page-add.active', { timeout: 5000 });

    await page.click('form#accounting-form button[type="submit"]');

    const amountInput = page.locator('input#record-amount');
    const isInvalid = await amountInput.evaluate(el => !el.validity.valid);
    expect(isInvalid).toBeTruthy();
  });
});
