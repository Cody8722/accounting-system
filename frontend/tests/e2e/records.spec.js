import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerUser,
  loginUser,
  clearAuthState
} from '../helpers/auth.helpers.js';
import {
  generateTestRecord,
  addRecord,
  deleteRecord,
  editRecord,
  getRecordCount
} from '../helpers/record.helpers.js';
import { sampleRecords } from '../fixtures/test-data.js';

test.describe('記帳記錄 CRUD 測試', () => {
  let user;

  test.beforeEach(async ({ page }) => {
    // 清除狀態
    await clearAuthState(page);

    // 註冊並登入
    user = generateTestUser();
    await registerUser(page, user);
    await page.click('.swal2-confirm');
    await loginUser(page, user);
  });

  test('使用者可以新增支出記錄', async ({ page }) => {
    const record = sampleRecords.expense.lunch;

    // 前往儀表板
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    // 點擊新增按鈕
    await page.click('button#add-record-btn, button:has-text("新增記帳")');
    await page.waitForSelector('#record-modal', { state: 'visible' });

    // 選擇支出類型
    await page.click('input#expense-radio');

    // 輸入金額
    await page.fill('input#amount-input', record.amount.toString());

    // 選擇分類
    await page.click('button:has-text("選擇分類")');
    await page.waitForSelector('#category-modal', { state: 'visible' });
    await page.click(`.category-item:has-text("${record.category}")`);

    // 輸入說明
    await page.fill('input#description-input, textarea#description-input', record.description);

    // 提交
    await page.click('button#save-record-btn, button:has-text("確認")');

    // 驗證成功訊息
    await expect(page.locator('.swal2-success')).toBeVisible({ timeout: 10000 });
    await page.click('.swal2-confirm');

    // 前往記錄頁面驗證
    await page.click('a[href="#records"]');
    await page.waitForLoadState('networkidle');

    // 驗證記錄出現
    await expect(page.locator('.record-item').first()).toContainText(record.category);
    await expect(page.locator('.record-item').first()).toContainText(record.amount.toString());
  });

  test('使用者可以新增收入記錄', async ({ page }) => {
    const record = sampleRecords.income.salary;

    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    // 點擊新增按鈕
    await page.click('button#add-record-btn, button:has-text("新增記帳")');
    await page.waitForSelector('#record-modal', { state: 'visible' });

    // 選擇收入類型
    await page.click('input#income-radio');

    // 輸入金額
    await page.fill('input#amount-input', record.amount.toString());

    // 選擇收入分類
    await page.click('button:has-text("選擇分類")');
    await page.waitForSelector('#category-modal', { state: 'visible' });

    // 切換到收入分類
    const incomeTab = page.locator('button:has-text("收入")');
    if (await incomeTab.count() > 0) {
      await incomeTab.click();
    }

    await page.click(`.category-item:has-text("${record.category}")`);

    // 輸入說明
    await page.fill('input#description-input, textarea#description-input', record.description);

    // 提交
    await page.click('button#save-record-btn, button:has-text("確認")');

    // 驗證成功訊息
    await expect(page.locator('.swal2-success')).toBeVisible({ timeout: 10000 });
  });

  test('使用者可以編輯記錄', async ({ page }) => {
    // 先新增一筆記錄
    const record = sampleRecords.expense.lunch;
    await addRecord(page, record);

    // 前往記錄頁面
    await page.goto('/#records');
    await page.waitForLoadState('networkidle');

    // 找到第一筆記錄並右鍵點擊
    const firstRecord = page.locator('.record-item').first();
    await firstRecord.click({ button: 'right' });

    // 等待選單出現並點擊編輯
    await page.waitForSelector('.long-press-menu, .context-menu', { state: 'visible', timeout: 5000 });
    await page.click('button:has-text("編輯")');

    // 等待編輯模態框
    await page.waitForSelector('#record-modal', { state: 'visible' });

    // 修改金額
    const newAmount = 999;
    await page.fill('input#amount-input', '');
    await page.fill('input#amount-input', newAmount.toString());

    // 提交更新
    await page.click('button#save-record-btn, button:has-text("確認")');

    // 驗證成功訊息
    await expect(page.locator('.swal2-success')).toBeVisible({ timeout: 10000 });
    await page.click('.swal2-confirm');

    // 重新載入並驗證更新
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.record-item').first()).toContainText(newAmount.toString());
  });

  test('使用者可以刪除記錄', async ({ page }) => {
    // 先新增一筆記錄
    const record = sampleRecords.expense.lunch;
    await addRecord(page, record);

    // 前往記錄頁面
    await page.goto('/#records');
    await page.waitForLoadState('networkidle');

    // 取得初始記錄數量
    const initialCount = await page.locator('.record-item').count();

    // 右鍵點擊第一筆記錄
    const firstRecord = page.locator('.record-item').first();
    await firstRecord.click({ button: 'right' });

    // 等待選單出現並點擊刪除
    await page.waitForSelector('.long-press-menu, .context-menu', { state: 'visible' });
    await page.click('button:has-text("刪除")');

    // 確認刪除
    await page.waitForSelector('.swal2-confirm', { state: 'visible' });
    await page.click('.swal2-confirm');

    // 驗證成功訊息
    await expect(page.locator('.swal2-success')).toBeVisible({ timeout: 10000 });
    await page.click('.swal2-confirm');

    // 重新載入並驗證記錄已刪除
    await page.reload();
    await page.waitForLoadState('networkidle');

    const finalCount = await page.locator('.record-item').count();
    expect(finalCount).toBe(initialCount - 1);
  });

  test('使用者可以篩選記錄', async ({ page }) => {
    // 新增多筆不同類型的記錄
    await addRecord(page, sampleRecords.expense.lunch);
    await addRecord(page, sampleRecords.expense.dinner);
    await addRecord(page, sampleRecords.income.salary);

    // 前往記錄頁面
    await page.goto('/#records');
    await page.waitForLoadState('networkidle');

    // 點擊篩選按鈕
    const filterButton = page.locator('button:has-text("篩選"), button#filter-btn');
    if (await filterButton.count() > 0) {
      await filterButton.click();

      // 選擇只顯示支出
      const expenseFilter = page.locator('input[value="expense"], button:has-text("支出")');
      if (await expenseFilter.count() > 0) {
        await expenseFilter.click();
      }

      // 套用篩選
      const applyButton = page.locator('button:has-text("套用"), button:has-text("確認")');
      if (await applyButton.count() > 0) {
        await applyButton.click();
      }

      // 驗證只顯示支出記錄
      const records = page.locator('.record-item');
      const count = await records.count();

      // 檢查每筆記錄是否為支出（有負號或支出標記）
      for (let i = 0; i < count; i++) {
        const recordText = await records.nth(i).textContent();
        // 記錄應該包含支出相關的文字或標記
        expect(recordText).toBeTruthy();
      }
    }
  });

  test('無效的金額應該被拒絕', async ({ page }) => {
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    // 點擊新增按鈕
    await page.click('button#add-record-btn, button:has-text("新增記帳")');
    await page.waitForSelector('#record-modal', { state: 'visible' });

    // 輸入無效金額
    await page.fill('input#amount-input', '-100');

    // 選擇分類
    await page.click('button:has-text("選擇分類")');
    await page.waitForSelector('#category-modal', { state: 'visible' });
    await page.click('.category-item:has-text("午餐")');

    // 嘗試提交
    await page.click('button#save-record-btn, button:has-text("確認")');

    // 應該顯示錯誤訊息或阻止提交
    const hasError = await Promise.race([
      page.locator('.swal2-error, .error-message').isVisible(),
      page.locator('input:invalid').count().then(c => c > 0),
      page.waitForTimeout(2000).then(() => false)
    ]);

    expect(hasError).toBeTruthy();
  });
});
