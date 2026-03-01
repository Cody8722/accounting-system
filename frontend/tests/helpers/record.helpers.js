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
 * @param {import('@playwright/test').Page} page
 * @param {Object} record - 記錄資料
 */
export async function addRecord(page, record) {
  // 確保在記帳頁面
  await page.goto('/#dashboard');
  await page.waitForLoadState('networkidle');

  // 點擊新增按鈕
  await page.click('button#add-record-btn');
  await page.waitForSelector('#record-modal', { state: 'visible' });

  // 選擇類型
  if (record.type === 'expense') {
    await page.click('input#expense-radio');
  } else {
    await page.click('input#income-radio');
  }

  // 輸入金額
  await page.fill('input#amount-input', record.amount.toString());

  // 選擇分類
  await page.click('button:has-text("選擇分類")');
  await page.waitForSelector('#category-modal', { state: 'visible' });

  // 根據類型選擇分類
  if (record.type === 'expense') {
    // 支出分類在第一個主分類下
    await page.click(`.category-item:has-text("${record.category}")`);
  } else {
    // 收入分類需要先切換主分類
    await page.click('button:has-text("收入")');
    await page.click(`.category-item:has-text("${record.category}")`);
  }

  // 輸入說明
  if (record.description) {
    await page.fill('input#description-input', record.description);
  }

  // 如果需要，修改日期
  if (record.date) {
    await page.fill('input#date-input', record.date);
  }

  // 提交表單
  await page.click('button#save-record-btn');

  // 等待成功訊息 (SweetAlert2 modal with success icon)
  await page.waitForSelector('.swal2-popup .swal2-icon.swal2-success', { timeout: 5000 });
  await page.click('.swal2-confirm');
}

/**
 * 刪除記帳記錄（使用長按選單）
 * @param {import('@playwright/test').Page} page
 * @param {number} index - 記錄索引（從 0 開始）
 */
export async function deleteRecord(page, index = 0) {
  // 前往記錄頁面
  await page.goto('/#records');
  await page.waitForLoadState('networkidle');

  // 取得記錄項目
  const records = page.locator('.record-item');
  const record = records.nth(index);

  // 長按記錄項目
  await record.hover();
  await record.click({ button: 'right' }); // 右鍵點擊觸發選單

  // 等待選單出現
  await page.waitForSelector('.long-press-menu', { state: 'visible' });

  // 點擊刪除
  await page.click('button:has-text("刪除")');

  // 確認刪除
  await page.waitForSelector('.swal2-confirm', { state: 'visible' });
  await page.click('.swal2-confirm');

  // 等待成功訊息 (SweetAlert2 modal with success icon)
  await page.waitForSelector('.swal2-popup .swal2-icon.swal2-success', { timeout: 5000 });
  await page.click('.swal2-confirm');
}

/**
 * 編輯記帳記錄
 * @param {import('@playwright/test').Page} page
 * @param {number} index - 記錄索引
 * @param {Object} updates - 要更新的欄位
 */
export async function editRecord(page, index, updates) {
  // 前往記錄頁面
  await page.goto('/#records');
  await page.waitForLoadState('networkidle');

  // 取得記錄項目
  const records = page.locator('.record-item');
  const record = records.nth(index);

  // 長按或右鍵點擊記錄項目
  await record.hover();
  await record.click({ button: 'right' });

  // 等待選單出現
  await page.waitForSelector('.long-press-menu', { state: 'visible' });

  // 點擊編輯
  await page.click('button:has-text("編輯")');

  // 等待編輯模態框
  await page.waitForSelector('#record-modal', { state: 'visible' });

  // 更新欄位
  if (updates.amount) {
    await page.fill('input#amount-input', '');
    await page.fill('input#amount-input', updates.amount.toString());
  }

  if (updates.description) {
    await page.fill('input#description-input', '');
    await page.fill('input#description-input', updates.description);
  }

  if (updates.category) {
    await page.click('button:has-text("選擇分類")');
    await page.waitForSelector('#category-modal', { state: 'visible' });
    await page.click(`.category-item:has-text("${updates.category}")`);
  }

  // 提交更新
  await page.click('button#save-record-btn');

  // 等待成功訊息 (SweetAlert2 modal with success icon)
  await page.waitForSelector('.swal2-popup .swal2-icon.swal2-success', { timeout: 5000 });
  await page.click('.swal2-confirm');
}

/**
 * 取得記錄數量
 * @param {import('@playwright/test').Page} page
 */
export async function getRecordCount(page) {
  await page.goto('/#records');
  await page.waitForLoadState('networkidle');

  const records = page.locator('.record-item');
  return await records.count();
}
