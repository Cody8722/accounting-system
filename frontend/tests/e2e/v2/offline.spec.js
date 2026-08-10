import { test, expect } from '@playwright/test';
import { genUser, apiRegister, loginV2 } from './helpers.js';

/**
 * v2 離線（Phase 1）：離線登入 + 離線讀取快取。
 * 流程：線上登入並載入概覽（把資料寫進 IndexedDB 快取）→ 等 Service Worker
 *       取得控制權（離線 reload 才能由 SW 提供 App 殼）→ 切離線 → reload。
 * 期望：不跳回登入卡（信任本地憑證進場），且概覽以快取資料渲染
 *       （若離線且無快取，apiJson 會丟錯、KPI 不會出現）。
 * 獨立 describe、自有帳號，不受核心流程 spec 影響。
 */
test.describe('v2 離線（Phase 1：離線登入 + 讀取快取）', () => {
  const user = genUser();
  test.beforeAll(async () => { await apiRegister(user); });

  test('離線 reload 仍能進入 App 並以快取渲染概覽', async ({ page, context }) => {
    await loginV2(page, user);
    // 概覽 KPI 渲染 = 線上資料已抓過一輪並寫入快取
    await expect(page.locator('.desktop-main')).toContainText('淨資產', { timeout: 15000 });
    await expect(page.locator('.pindash .kpi').first()).toBeVisible({ timeout: 10000 });
    // 等 SW 取得控制權
    await page.waitForFunction(
      () => !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      null,
      { timeout: 20000 },
    );

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 不跳登入卡；進入已登入外殼
    await expect(page.locator('.sidebar, .tabbar')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.auth-card')).toHaveCount(0);
    // 概覽以快取資料渲染
    await expect(page.locator('.desktop-main')).toContainText('淨資產', { timeout: 15000 });
    await expect(page.locator('.pindash .kpi').first()).toBeVisible({ timeout: 10000 });

    // #1 icon 字型本地化：離線時本地 CSS + woff2 可由 SW 快取取得（不再依賴外部 CDN）
    const iconAssetsOk = await page.evaluate(async () => {
      const ok = (p) => fetch(p).then((r) => r.ok).catch(() => false);
      const [css, font] = await Promise.all([
        ok('./vendor/tabler-icons/tabler-icons.min.css'),
        ok('./vendor/tabler-icons/tabler-icons.woff2'),
      ]);
      return css && font;
    });
    expect(iconAssetsOk).toBe(true);

    // #2 設定頁「資料同步」離線時顯示「離線」
    await page.click('[data-nav="settings"]');
    await expect(page.locator('[data-el="sync-status"]')).toHaveText('離線', { timeout: 10000 });

    await context.setOffline(false);
  });

  test('離線記一筆 → 顯示待同步 → 回連自動同步（Phase 2）', async ({ page, context }) => {
    await loginV2(page, user);
    await page.waitForFunction(
      () => !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      null,
      { timeout: 20000 },
    );
    // 先線上進明細，讓當月 records 端點寫入快取
    await page.click('[data-nav="ledger"]');
    await page.waitForSelector('.desktop-main [data-type="all"]', { timeout: 10000 });

    await context.setOffline(true);
    // 離線記一筆支出
    await page.click('[data-el="add"]');
    await page.waitForSelector('.overlay.center [data-el="save"]', { timeout: 10000 });
    await page.fill('.overlay.center [data-el="amountInput"]', '321');
    await page.click('.overlay.center [data-leaf="早餐"]');
    await page.click('.overlay.center [data-el="save"]');
    // 明細出現這筆 + 待同步標記
    await expect(page.locator('.desktop-main')).toContainText('321', { timeout: 10000 });
    await expect(page.locator('.desktop-main')).toContainText('待同步', { timeout: 10000 });

    // 回連後重新開啟 App（PWA 常見情境）→ boot 觸發 flushOutbox 同步。
    // 刻意不依賴 online 事件——Playwright/Firefox 的 setOffline(false) 未必派發該事件。
    await context.setOffline(false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.sidebar, .tabbar', { timeout: 20000 });
    await page.click('[data-nav="ledger"]');
    await page.waitForSelector('.desktop-main [data-type="all"]', { timeout: 10000 });
    // 待同步消失（樂觀記錄換成 server 記錄），且該筆仍在
    await expect(page.locator('.desktop-main')).not.toContainText('待同步', { timeout: 20000 });
    await expect(page.locator('.desktop-main')).toContainText('321', { timeout: 10000 });
  });
});
