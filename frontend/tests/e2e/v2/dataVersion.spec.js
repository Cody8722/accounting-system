import { test, expect } from '@playwright/test';
import { genUser, apiRegister, loginV2 } from './helpers.js';

/**
 * v2 輕量更新檢查（資料版本閘門）：資料未變時切頁不重抓明細 API；寫入後版本
 * 改變，下次載入才重抓並拿到新資料。用 Playwright 網路請求計數直接驗證「有沒有
 * 真的打 API」——只看畫面結果的話，快取命中和真的重抓都會顯示正確內容，唯有
 * 計數能證明真的省下了那次請求（不是巧合通過）。
 * 獨立 describe、自有帳號，不受核心流程 spec 影響。
 */
test.describe('v2 輕量更新檢查（資料版本閘門）', () => {
  const user = genUser();
  test.beforeAll(async () => { await apiRegister(user); });

  test('資料未變時切頁不重抓；寫入後版本改變、立即重抓並看到新資料', async ({ page }) => {
    await loginV2(page, user); // 登入落地在概覽，此時的請求不列入計數

    const recordsReqs = [];
    page.on('request', (req) => {
      if (req.url().includes('/admin/api/accounting/records?')) recordsReqs.push(req.url());
    });

    await page.click('[data-nav="ledger"]');
    await page.waitForSelector('.desktop-main [data-type="all"]', { timeout: 10000 });
    const afterFirstLoad = recordsReqs.length;
    expect(afterFirstLoad).toBeGreaterThanOrEqual(1);

    // 切走再切回（短時間內、資料未變）→ 版本閘門應擋下重抓，記錄請求數不變
    await page.click('[data-nav="stats"]');
    await page.waitForSelector('.desktop-main', { timeout: 10000 });
    await page.click('[data-nav="ledger"]');
    await page.waitForSelector('.desktop-main [data-type="all"]', { timeout: 10000 });
    expect(recordsReqs.length).toBe(afterFirstLoad);

    // 記一筆收入（寫入）→ apiCall 成功後自動讓版本快取失效（見 api.js invalidateDataVersion）
    await page.click('[data-el="add"]');
    await page.waitForSelector('.overlay.center [data-el="save"]', { timeout: 10000 });
    await page.click('.overlay.center [data-el="incBtn"]');
    await page.fill('.overlay.center [data-el="amountInput"]', '777');
    await page.click('.overlay.center [data-leaf="薪資"]');
    await page.click('.overlay.center [data-el="locationArea"] [data-location="bank"]');
    await page.click('.overlay.center [data-el="save"]');
    await page.waitForSelector('.overlay.center', { state: 'detached', timeout: 10000 });

    // 存檔後 router 的 records:changed 監聽會重繪目前畫面（仍在明細）：版本已變，
    // 版本閘門應判定不符而真的重抓，且能看到剛新增的這筆。
    await expect(page.locator('.desktop-main')).toContainText('777', { timeout: 10000 });
    expect(recordsReqs.length).toBeGreaterThan(afterFirstLoad);
  });
});
