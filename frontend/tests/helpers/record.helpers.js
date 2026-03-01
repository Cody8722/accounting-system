/**
 * 記帳記錄測試輔助函數
 */

/**
 * 生成測試記帳記錄
 */
export function generateTestRecord(type = 'expense') {
  return {
    type,
    amount: Math.floor(Math.random() * 1000) + 100,
    category: type === 'expense' ? '午餐' : '薪水',
    description: `測試記錄 ${Date.now()}`,
    date: new Date().toISOString().split('T')[0]
  };
}

/**
 * 新增記帳記錄
 * 前端成功時顯示行內文字 "✅ 記帳記錄已新增"，不使用 SweetAlert2
 * @param {import('@playwright/test').Page} page
 * @param {Object} record - 記錄資料
 */
export async function addRecord(page, record) {
  // 確保在儀表板頁面
  const currentUrl = page.url();
  if (!currentUrl.includes('#dashboard')) {
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');
  }

  // 填寫表單（直接在儀表板的表單中填寫）
  // 選擇類型
  if (record.type === 'expense') {
    await page.click('input[value="expense"], input#expense-radio');
  } else {
    await page.click('input[value="income"], input#income-radio');
  }

  // 輸入金額
  const amountInput = page.locator('input#record-amount, input#amount-input');
  await amountInput.fill(record.amount.toString());

  // 選擇分類
  const categorySelect = page.locator('select#record-category');
  if (await categorySelect.count() > 0) {
    await categorySelect.selectOption(record.category);
  }

  // 輸入說明
  if (record.description) {
    const descInput = page.locator('input#record-description, input#description-input, textarea#record-description');
    if (await descInput.count() > 0) {
      await descInput.fill(record.description);
    }
  }

  // 日期
  if (record.date) {
    const dateInput = page.locator('input#record-date, input#date-input');
    if (await dateInput.count() > 0) {
      await dateInput.fill(record.date);
    }
  }

  // 提交表單
  await page.click('form#accounting-form button[type="submit"], button#save-record-btn');

  // 等待成功訊息（行內文字）
  await page.waitForFunction(
    () => {
      const el = document.getElementById('accounting-message');
      return el && el.textContent.includes('記帳記錄已新增');
    },
    { timeout: 10000 }
  );

  // 等待訊息消失
  await page.waitForTimeout(500);
}

/**
 * 取得記錄數量
 * @param {import('@playwright/test').Page} page
 */
export async function getRecordCount(page) {
  await page.goto('/#records');
  await page.waitForLoadState('networkidle');

  const records = page.locator('.record-item, .record-item-wrapper');
  return await records.count();
}
