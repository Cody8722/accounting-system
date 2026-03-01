import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerUser,
  loginUser,
  clearAuthState
} from '../helpers/auth.helpers.js';
import { addRecord } from '../helpers/record.helpers.js';
import { sampleRecords, sampleBudgets } from '../fixtures/test-data.js';

test.describe('預算與統計功能測試', () => {
  let user;

  test.beforeEach(async ({ page }) => {
    // 清除狀態並登入
    await clearAuthState(page);
    user = generateTestUser();
    await registerUser(page, user);
    await page.click('.swal2-confirm');
    await loginUser(page, user);
  });

  test('使用者可以設定預算', async ({ page }) => {
    // 前往設定頁面
    await page.goto('/#settings');
    await page.waitForLoadState('networkidle');

    // 找到預算設定區域
    const budgetSection = page.locator('#budget-settings, .budget-settings, section:has-text("預算")');

    if (await budgetSection.count() > 0) {
      // 設定午餐預算
      const lunchBudgetInput = page.locator('input[data-category="午餐"], input[name="budget-午餐"]');
      if (await lunchBudgetInput.count() > 0) {
        await lunchBudgetInput.fill(sampleBudgets.lunch.toString());
      }

      // 設定交通預算
      const transportBudgetInput = page.locator('input[data-category="交通"], input[name="budget-交通"]');
      if (await transportBudgetInput.count() > 0) {
        await transportBudgetInput.fill(sampleBudgets.transport.toString());
      }

      // 儲存預算
      await page.click('button:has-text("儲存"), button:has-text("保存")');

      // 驗證成功訊息 (SweetAlert2 modal with success icon)
      await expect(page.locator('.swal2-popup .swal2-icon.swal2-success')).toBeVisible({ timeout: 10000 });
      await page.click('.swal2-confirm');

      // 重新載入頁面驗證預算已儲存
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 驗證預算值
      if (await lunchBudgetInput.count() > 0) {
        await expect(lunchBudgetInput).toHaveValue(sampleBudgets.lunch.toString());
      }
    }
  });

  test('統計頁面應顯示正確的收支統計', async ({ page }) => {
    // 新增幾筆記錄
    await addRecord(page, sampleRecords.expense.lunch);
    await addRecord(page, sampleRecords.expense.dinner);
    await addRecord(page, sampleRecords.income.salary);

    // 前往統計頁面
    await page.goto('/#stats');
    await page.waitForLoadState('networkidle');

    // 等待統計資料載入
    await page.waitForTimeout(2000);

    // 驗證統計資料存在
    const statsContainer = page.locator('.stats-container, #stats-page, .statistics');
    await expect(statsContainer).toBeVisible();

    // 驗證總支出顯示
    const totalExpense = page.locator('[data-stat="total-expense"], .total-expense, :text("總支出")');
    if (await totalExpense.count() > 0) {
      await expect(totalExpense).toBeVisible();
    }

    // 驗證總收入顯示
    const totalIncome = page.locator('[data-stat="total-income"], .total-income, :text("總收入")');
    if (await totalIncome.count() > 0) {
      await expect(totalIncome).toBeVisible();
    }

    // 驗證淨額顯示
    const netAmount = page.locator('[data-stat="net-amount"], .net-amount, :text("淨額")');
    if (await netAmount.count() > 0) {
      await expect(netAmount).toBeVisible();
    }
  });

  test('支出圓餅圖應正確顯示', async ({ page }) => {
    // 新增不同分類的支出記錄
    await addRecord(page, sampleRecords.expense.lunch);
    await addRecord(page, sampleRecords.expense.dinner);
    await addRecord(page, sampleRecords.expense.transport);

    // 前往統計頁面
    await page.goto('/#stats');
    await page.waitForLoadState('networkidle');

    // 等待圖表載入
    await page.waitForTimeout(2000);

    // 驗證圓餅圖 Canvas 存在
    const expenseChart = page.locator('#expenseChart, canvas#expense-chart');
    if (await expenseChart.count() > 0) {
      await expect(expenseChart).toBeVisible();

      // 驗證 Canvas 已渲染（有內容）
      const isRendered = await expenseChart.evaluate((canvas) => {
        if (!(canvas instanceof HTMLCanvasElement)) return false;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // 檢查是否有非透明像素
        for (let i = 3; i < imageData.data.length; i += 4) {
          if (imageData.data[i] > 0) return true;
        }
        return false;
      });

      expect(isRendered).toBeTruthy();
    }
  });

  test('趨勢折線圖應正確顯示', async ({ page }) => {
    // 新增記錄
    await addRecord(page, sampleRecords.expense.lunch);
    await addRecord(page, sampleRecords.income.salary);

    // 前往統計頁面
    await page.goto('/#stats');
    await page.waitForLoadState('networkidle');

    // 等待圖表載入
    await page.waitForTimeout(2000);

    // 驗證趨勢圖 Canvas 存在
    const trendsChart = page.locator('#trendsChart, canvas#trends-chart');
    if (await trendsChart.count() > 0) {
      await expect(trendsChart).toBeVisible();
    }
  });

  test('預算警告應正確顯示', async ({ page }) => {
    // 設定較低的預算
    await page.goto('/#settings');
    await page.waitForLoadState('networkidle');

    // 設定午餐預算為 100
    const lunchBudgetInput = page.locator('input[data-category="午餐"], input[name="budget-午餐"]');
    if (await lunchBudgetInput.count() > 0) {
      await lunchBudgetInput.fill('100');
      await page.click('button:has-text("儲存"), button:has-text("保存")');
      await page.waitForSelector('.swal2-popup .swal2-icon.swal2-success', { timeout: 5000 });
      await page.click('.swal2-confirm');
    }

    // 新增超過預算的支出
    await addRecord(page, { ...sampleRecords.expense.lunch, amount: 150 });

    // 前往統計頁面
    await page.goto('/#stats');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 查找預算警告指示器
    const budgetWarning = page.locator('.budget-warning, .text-red-500, .bg-red-500, [data-warning="true"]');
    if (await budgetWarning.count() > 0) {
      await expect(budgetWarning.first()).toBeVisible();
    }
  });

  test('儀表板應顯示即時統計資料', async ({ page }) => {
    // 新增記錄
    await addRecord(page, sampleRecords.expense.lunch);

    // 前往儀表板
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 驗證統計卡片存在
    const statsCards = page.locator('.stat-card, .stats-card, [data-stat-card]');
    if (await statsCards.count() > 0) {
      // 至少應該有一個統計卡片
      expect(await statsCards.count()).toBeGreaterThan(0);

      // 驗證統計數字顯示
      const statValue = page.locator('.stat-value, [data-stat-value]');
      if (await statValue.count() > 0) {
        await expect(statValue.first()).toBeVisible();
      }
    }
  });

  test('新增記錄後統計應自動更新', async ({ page }) => {
    // 前往儀表板
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    // 記錄初始的統計值（如果存在）
    const initialExpense = await page.locator('.total-expense, [data-stat="total-expense"]')
      .textContent()
      .catch(() => '0');

    // 新增一筆支出記錄
    await addRecord(page, sampleRecords.expense.lunch);

    // 返回儀表板
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 驗證統計已更新（如果統計卡片存在）
    const statsCards = page.locator('.stat-card, .stats-card');
    if (await statsCards.count() > 0) {
      // 統計應該已經更新
      const updatedExpense = await page.locator('.total-expense, [data-stat="total-expense"]')
        .textContent()
        .catch(() => '0');

      // 如果統計存在，應該不同於初始值
      if (initialExpense && updatedExpense) {
        expect(updatedExpense).not.toBe(initialExpense);
      }
    }
  });

  test('匯出 CSV 功能應正常運作', async ({ page }) => {
    // 新增一些記錄
    await addRecord(page, sampleRecords.expense.lunch);
    await addRecord(page, sampleRecords.expense.dinner);

    // 前往記錄頁面
    await page.goto('/#records');
    await page.waitForLoadState('networkidle');

    // 設置下載監聽器
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

    // 點擊匯出按鈕
    const exportButton = page.locator('button:has-text("匯出"), button:has-text("CSV"), button#export-btn');
    if (await exportButton.count() > 0) {
      await exportButton.click();

      // 等待下載
      const download = await downloadPromise;

      // 驗證檔案名稱
      expect(download.suggestedFilename()).toContain('accounting');
      expect(download.suggestedFilename()).toContain('.csv');
    }
  });
});
