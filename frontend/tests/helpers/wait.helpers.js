/**
 * 等待相關的輔助函數
 */

/**
 * 等待 Toast 訊息出現並消失
 * @param {import('@playwright/test').Page} page
 * @param {string} type - success | error | warning | info
 */
export async function waitForToast(page, type = 'success') {
  const selector = `.swal2-${type}`;
  await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
  await page.waitForSelector(selector, { state: 'hidden', timeout: 10000 });
}

/**
 * 等待模態框關閉
 * @param {import('@playwright/test').Page} page
 * @param {string} modalId - 模態框 ID
 */
export async function waitForModalClose(page, modalId) {
  await page.waitForSelector(`#${modalId}`, { state: 'hidden', timeout: 5000 });
}

/**
 * 等待 API 請求完成
 * @param {import('@playwright/test').Page} page
 * @param {string} urlPattern - URL 模式
 */
export async function waitForApiResponse(page, urlPattern) {
  return page.waitForResponse(
    response => response.url().includes(urlPattern) && response.status() === 200,
    { timeout: 10000 }
  );
}

/**
 * 等待頁面載入完成（包含所有資源）
 * @param {import('@playwright/test').Page} page
 */
export async function waitForPageFullyLoaded(page) {
  await page.waitForLoadState('load');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle');
}

/**
 * 等待元素並點擊
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - 選擇器
 */
export async function waitAndClick(page, selector) {
  await page.waitForSelector(selector, { state: 'visible' });
  await page.click(selector);
}

/**
 * 等待多個條件
 * @param {import('@playwright/test').Page} page
 * @param {Array<Function>} conditions - 條件函數陣列
 */
export async function waitForMultiple(page, conditions) {
  await Promise.all(conditions.map(condition => condition(page)));
}
