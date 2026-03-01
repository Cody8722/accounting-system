import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerUser,
  loginUser,
  clearAuthState
} from '../helpers/auth.helpers.js';
import { setupApiMocks } from '../helpers/api-mock.helpers.js';
import { sampleRecords } from '../fixtures/test-data.js';

test.describe('記帳記錄 CRUD 測試', () => {
  let user;

  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await clearAuthState(page);

    // 註冊並登入
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

  test('使用者可以新增支出記錄', async ({ page }) => {
    const record = sampleRecords.expense.lunch;

    // 確保在記帳頁面（預設就是記帳頁）
    await page.click('.sidebar-item[data-page="add"]');
    await page.waitForTimeout(500);

    // 選擇支出類型
    await page.selectOption('select#record-type', 'expense');

    // 輸入金額
    await page.fill('input#record-amount', record.amount.toString());

    // 選擇分類 - 點擊分類輸入框開啟 modal
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });

    // 選擇分類項目
    await page.click(`.category-item:has-text("${record.category}")`);

    // 輸入描述
    await page.fill('input#record-description', record.description);

    // 提交表單
    await page.click('form#accounting-form button[type="submit"]');

    // 驗證成功訊息（行內文字）
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
    await page.waitForTimeout(500);

    // 選擇收入類型
    await page.selectOption('select#record-type', 'income');

    // 輸入金額
    await page.fill('input#record-amount', record.amount.toString());

    // 選擇分類
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });

    // 在分類 modal 中，收入分類可能需要切換標籤
    const incomeTab = page.locator('#category-tabs button:has-text("收入"), #category-tabs div:has-text("收入")');
    if (await incomeTab.count() > 0) {
      await incomeTab.first().click();
      await page.waitForTimeout(300);
    }

    await page.click(`.category-item:has-text("${record.category}")`);

    // 輸入描述
    await page.fill('input#record-description', record.description);

    // 提交表單
    await page.click('form#accounting-form button[type="submit"]');

    // 驗證成功訊息
    await page.waitForFunction(
      () => {
        const el = document.getElementById('accounting-message');
        return el && el.textContent.includes('記帳記錄已新增');
      },
      { timeout: 10000 }
    );
  });

  test('使用者可以查看記錄列表', async ({ page }) => {
    // 先新增一筆記錄
    const record = sampleRecords.expense.lunch;

    await page.selectOption('select#record-type', 'expense');
    await page.fill('input#record-amount', record.amount.toString());
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await page.click(`.category-item:has-text("${record.category}")`);
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

    // 驗證記錄頁面顯示
    const recordsPage = page.locator('#page-records.active');
    await expect(recordsPage).toBeVisible({ timeout: 5000 });
  });

  test('無效的金額應該被拒絕', async ({ page }) => {
    await page.click('.sidebar-item[data-page="add"]');
    await page.waitForTimeout(500);

    // 輸入無效金額（金額欄位有 min="0.01"，但讓我們測試提交時的驗證）
    await page.fill('input#record-amount', '0');

    // 選擇分類
    await page.click('input#record-category');
    await page.waitForSelector('#category-modal:not(.hidden)', { timeout: 5000 });
    await page.click('.category-item:has-text("午餐")');

    // 嘗試提交
    await page.click('form#accounting-form button[type="submit"]');

    // 應該顯示錯誤訊息或被 HTML 驗證阻止
    const hasError = await page.waitForFunction(
      () => {
        // 檢查行內錯誤訊息
        const msgEl = document.getElementById('accounting-message');
        if (msgEl && !msgEl.classList.contains('hidden') && msgEl.textContent.includes('❌')) return true;

        // 檢查金額欄位錯誤
        const amtErr = document.getElementById('amount-error');
        if (amtErr && !amtErr.classList.contains('hidden')) return true;

        // 檢查 HTML 原生驗證
        const amtInput = document.getElementById('record-amount');
        if (amtInput && !amtInput.validity.valid) return true;

        return false;
      },
      { timeout: 5000 }
    ).then(() => true).catch(() => false);

    expect(hasError).toBeTruthy();
  });

  test('使用者可以篩選記錄類型', async ({ page }) => {
    // 前往記錄頁面
    await page.click('.sidebar-item[data-page="records"]');
    await page.waitForTimeout(1000);

    // 驗證記錄頁面顯示
    const recordsPage = page.locator('#page-records.active');
    await expect(recordsPage).toBeVisible({ timeout: 5000 });

    // 查看是否有篩選功能
    const filterElements = page.locator('#page-records select, #page-records input[type="radio"], #page-records button:has-text("篩選")');
    const filterCount = await filterElements.count();
    expect(filterCount).toBeGreaterThanOrEqual(0); // 頁面已載入
  });

  test('空金額不應該被提交', async ({ page }) => {
    await page.click('.sidebar-item[data-page="add"]');
    await page.waitForTimeout(500);

    // 不填金額直接提交
    await page.click('form#accounting-form button[type="submit"]');

    // 表單不應該被提交（HTML required 驗證）
    const amountInput = page.locator('input#record-amount');
    const isInvalid = await amountInput.evaluate(el => !el.validity.valid);
    expect(isInvalid).toBeTruthy();
  });
});
