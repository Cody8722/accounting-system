/**
 * 欠款測試輔助函數
 *
 * 提供 navigateToDebts 和 addDebt 輔助函數，
 * 供 E2E 測試快速建立欠款資料。
 */

/**
 * 導航到欠款追蹤頁面
 * @param {import('@playwright/test').Page} page
 */
export async function navigateToDebts(page) {
  // 點擊側邊欄「欠款追蹤」
  await page.click('.sidebar-item[data-page="debts"]');
  await page.waitForSelector('#page-debts.active', { timeout: 8000 });
}

/**
 * 透過 UI 新增一筆欠款
 * @param {import('@playwright/test').Page} page
 * @param {{ debt_type?: string, person: string, amount: number, reason?: string }} opts
 * @returns {Promise<void>}
 */
export async function addDebt(page, { debt_type = 'lent', person, amount, reason = '' }) {
  // 開啟新增 Modal
  await page.click('button[onclick="showDebtForm()"]');
  await page.waitForSelector('#debt-form-modal:not(.hidden)', { timeout: 8000 });

  // 選擇類型
  const typeBtn = page.locator(`.debt-type-btn[data-type="${debt_type}"]`);
  await typeBtn.click();

  // 填入姓名
  await page.fill('#debt-person', person);

  // 填入金額
  await page.fill('#debt-amount', String(amount));

  // 等待 POST 201 response 再確認 modal 關閉
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/admin/api/debts') && r.status() === 201,
    { timeout: 10000 }
  );

  await page.click('#debt-submit-btn');

  await responsePromise;

  // 等待 Modal 關閉
  await page.waitForSelector('#debt-form-modal.hidden', { timeout: 8000 });
}
