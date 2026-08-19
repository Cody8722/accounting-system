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

  // 回歸：既有 v1 IndexedDB 連線擋住 v2 升級時，openDb 不可無限掛住而拖垮明細渲染。
  // 這正是 1.7.0 實機「明細卡載入中」的情境（CI 因無既有 DB 而漏測）。
  test('既有 v1 IndexedDB 升級被擋時，明細仍正常渲染（不卡載入中）', async ({ page }) => {
    // 頁面載入前先開啟舊版(v1)DB 並「保持連線不關」，重現升級 blocked
    await page.addInitScript(() => {
      try {
        const req = indexedDB.open('accounting-offline', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
        };
        // 故意保留連線、且不掛 onversionchange → 擋住之後的 v2 升級
        req.onsuccess = () => { window.__v1db = req.result; };
      } catch { /* 忽略 */ }
    });
    await loginV2(page, user);
    await page.click('[data-nav="ledger"]');
    // 明細應在合理時間內渲染（篩選列出現），而非卡在「載入中」
    await page.waitForSelector('.desktop-main [data-type="all"]', { timeout: 15000 });
    await expect(page.locator('.desktop-main')).toContainText('明細', { timeout: 10000 });
  });

  // 回歸：outbox/cache 是全域 IndexedDB store、不依 user 分區。登出若沒清掉，
  // 同一台裝置換帳號登入時，A 還沒同步的離線寫入會被下一位登入者（B）的
  // boot() 自動 flushOutbox() 用 B 的 token 送出去，寫進 B 的帳戶。
  test('登出清除離線佇列，A 未同步的離線記錄不會流入下一位登入者 B 的帳戶', async ({ page, context }) => {
    const userA = genUser();
    const userB = genUser();
    await apiRegister(userA);
    await apiRegister(userB);

    await loginV2(page, userA);
    await page.click('[data-nav="ledger"]');
    await page.waitForSelector('.desktop-main [data-type="all"]', { timeout: 10000 });

    await context.setOffline(true);
    // A 離線記一筆（進 outbox，尚未同步）
    await page.click('[data-el="add"]');
    await page.waitForSelector('.overlay.center [data-el="save"]', { timeout: 10000 });
    await page.fill('.overlay.center [data-el="amountInput"]', '4321');
    await page.click('.overlay.center [data-leaf="早餐"]');
    await page.click('.overlay.center [data-el="save"]');
    await expect(page.locator('.desktop-main')).toContainText('待同步', { timeout: 10000 });

    // A 在離線、尚未同步的狀態下登出。不透過「帳戶管理」UI 點登出按鈕——
    // 那個 sheet 打開時會先打 /api/user/profile 才畫出登出按鈕，離線時這通
    // 請求會失敗、整個 sheet 顯示錯誤訊息，登出按鈕根本不會出現。改直接呼叫
    // logout()，模擬「使用者在離線狀態下就是想登出」這個目標情境本身。
    await page.evaluate(async () => {
      const mod = await import('./js/auth.js');
      mod.logout(); // 不 await：logout() 結尾 location.reload()，await 這個 promise 會因頁面重載而中斷
    }).catch(() => {});
    await page.waitForSelector('.auth-card', { timeout: 10000 });

    await context.setOffline(false);

    // B 登入：不該看到 A 那筆待同步記錄被自動送進 B 的帳戶
    await loginV2(page, userB);
    await page.click('[data-nav="ledger"]');
    await page.waitForSelector('.desktop-main [data-type="all"]', { timeout: 10000 });
    await expect(page.locator('.desktop-main')).not.toContainText('4321');
    await expect(page.locator('.desktop-main')).not.toContainText('待同步');
  });
});
