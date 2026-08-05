import { test, expect } from '@playwright/test';
import { genUser, apiRegister, loginV2 } from './helpers.js';

/**
 * v2 核心流程（桌面外殼，viewport 1280×720）。
 * 每個 spec 只註冊一次帳號（避開註冊速率限制），每個測試各自登入。
 * 同 spec 內串行（config 已設），各測試用不同金額避免互相干擾。
 */
test.describe('v2 核心流程', () => {
  const user = genUser();

  test.beforeAll(async () => { await apiRegister(user); });
  test.beforeEach(async ({ page }) => { await loginV2(page, user); });

  /** 電腦版登入後預設落地在「概覽」；需操作明細表格的測試先切到明細 */
  async function gotoLedger(page) {
    await page.click('[data-nav="ledger"]');
    await page.waitForSelector('.desktop-main [data-type="all"]', { timeout: 10000 });
  }

  /** 支出送出後，若現金不足會另跳一個確認提領彈窗（沿用 .overlay.center，
   * 與記一筆彈窗疊在一起）；沒有事先入帳現金的測試帳號第一次記支出必定
   * 觸發，這裡統一處理，確認後才會真的寫入並關閉記一筆彈窗。 */
  async function confirmWithdrawalIfNeeded(page) {
    const confirmBtn = page.locator('.sheet.dialog [data-act="ok"]');
    try {
      await confirmBtn.waitFor({ state: 'visible', timeout: 8000 });
      await confirmBtn.click();
    } catch {
      // 現金足夠、沒跳確認框——正常情況，不需處理
    }
  }

  /** 桌面版：切到明細 → 開記一筆 → 填金額(input) → 選分類 → 儲存 → 彈窗關閉 */
  async function addRecordDesktop(page, amount, leaf) {
    await gotoLedger(page);
    await page.click('[data-el="add"]');
    await page.waitForSelector('.overlay.center [data-el="save"]', { timeout: 10000 });
    await page.fill('.overlay.center [data-el="amountInput"]', amount);
    await page.click(`.overlay.center [data-leaf="${leaf}"]`);
    await page.click('.overlay.center [data-el="save"]');
    await confirmWithdrawalIfNeeded(page);
    await page.waitForSelector('.overlay.center', { state: 'detached', timeout: 10000 });
  }

  test('用計算機鍵盤記一筆，明細出現該筆', async ({ page }) => {
    await gotoLedger(page);
    await page.click('[data-el="add"]');
    await page.waitForSelector('.overlay.center [data-el="save"]', { timeout: 10000 });
    await page.click('.overlay.center [data-el="calcToggle"]');
    for (const d of ['1', '3', '7']) {
      await page.click(`.overlay.center [data-digit="${d}"]`);
    }
    await expect(page.locator('.overlay.center [data-el="amountInput"]')).toHaveValue('137', { timeout: 5000 });
    await page.click('.overlay.center [data-leaf="早餐"]');
    await page.click('.overlay.center [data-el="save"]');
    await confirmWithdrawalIfNeeded(page);
    await page.waitForSelector('.overlay.center', { state: 'detached', timeout: 10000 });
    await expect(page.locator('.desktop-main')).toContainText('早餐', { timeout: 10000 });
    await expect(page.locator('.desktop-main')).toContainText('137', { timeout: 10000 });
  });

  test('編輯記錄：改金額後明細更新', async ({ page }) => {
    await addRecordDesktop(page, '246', '午餐');
    await expect(page.locator('.desktop-main')).toContainText('246', { timeout: 10000 });
    // 點該列開啟編輯
    await page.locator('.desktop-main [data-id]').filter({ hasText: '246' }).first().click();
    await page.waitForSelector('.overlay [data-el="save"]', { timeout: 10000 });
    await page.fill('.overlay [data-el="amount"]', '250');
    await page.click('.overlay [data-el="save"]');
    await page.waitForSelector('.overlay', { state: 'detached', timeout: 10000 });
    await expect(page.locator('.desktop-main')).toContainText('250', { timeout: 10000 });
  });

  test('刪除記錄：確認後從明細消失', async ({ page }) => {
    await addRecordDesktop(page, '468', '晚餐');
    await expect(page.locator('.desktop-main')).toContainText('468', { timeout: 10000 });
    await page.locator('.desktop-main [data-id]').filter({ hasText: '468' }).first().click();
    await page.waitForSelector('.overlay [data-el="del"]', { timeout: 10000 });
    await page.click('.overlay [data-el="del"]');
    // showConfirm 的「確定」
    await page.click('.overlay.center button:has-text("確定")');
    await expect(page.locator('.desktop-main')).not.toContainText('468', { timeout: 10000 });
  });

  test('預算：設定分類預算後顯示', async ({ page }) => {
    await page.click('[data-nav="budget"]');
    await page.waitForSelector('[data-el="edit"]', { timeout: 10000 });
    await page.click('[data-el="edit"]');
    await page.waitForSelector('.overlay [data-cat="早餐"]', { timeout: 10000 });
    await page.fill('.overlay [data-cat="早餐"]', '3000');
    await page.click('.overlay [data-save="1"]');
    await page.waitForSelector('.overlay', { state: 'detached', timeout: 10000 });
    await expect(page.locator('.desktop-main')).toContainText('早餐', { timeout: 10000 });
    await expect(page.locator('.desktop-main')).toContainText('3,000', { timeout: 10000 });
  });

  test('發票手動輸入：金額帶入記帳表單', async ({ page }) => {
    await page.click('[data-el="add"]');
    await page.waitForSelector('.overlay.center [data-el="save"]', { timeout: 10000 });
    await page.click('.overlay.center [data-el="invoice"]');   // 桌面右欄「查詢並帶入」
    await page.waitForSelector('[data-el="manual"]', { timeout: 10000 });
    await page.click('[data-el="manual"]');
    await page.waitForSelector('[data-el="amt"]', { timeout: 10000 });
    await page.fill('[data-el="amt"]', '579');
    await page.click('[data-el="ok"]');
    await expect(page.locator('.overlay.center [data-el="amountInput"]')).toHaveValue('579', { timeout: 10000 });
  });

  test('統計 / 預算 / 設定 皆可渲染', async ({ page }) => {
    await page.click('[data-nav="stats"]');
    await expect(page.locator('.desktop-main')).toContainText('分類佔比', { timeout: 10000 });
    await page.click('[data-nav="budget"]');
    await expect(page.locator('.desktop-main')).toContainText('總預算', { timeout: 10000 });
    await page.click('[data-nav="settings"]');
    await expect(page.locator('.desktop-main')).toContainText('帳戶管理', { timeout: 10000 });
  });

  test('電腦版預設落地在概覽，KPI 卡與四張卡渲染', async ({ page }) => {
    // beforeEach 登入後，電腦版預設畫面即為概覽（釘選式 deck）
    await expect(page.locator('.desktop-main')).toContainText('概覽', { timeout: 10000 });
    await expect(page.locator('.pindash .kpi').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.desktop-main')).toContainText('淨資產', { timeout: 10000 });
    await expect(page.locator('.desktop-main')).toContainText('本月支出', { timeout: 10000 });
    await expect(page.locator('.pindash .deck .card')).toHaveCount(4);
  });

  test('概覽：釘選卡片放大，再點取消', async ({ page }) => {
    const donut = page.locator('.card[data-id="donut"]');
    await expect(donut).toBeVisible({ timeout: 10000 });
    await donut.click(); // 釘選
    await expect(page.locator('.pindash .deck.pinned')).toBeVisible({ timeout: 5000 });
    await expect(donut).toHaveClass(/is-pinned/, { timeout: 5000 }); // 動畫結束後套上
    await donut.click(); // 取消釘選
    await expect(page.locator('.pindash .deck.pinned')).toHaveCount(0, { timeout: 5000 });
  });

  test('概覽：釘選後從「查看完整頁」導向明細', async ({ page }) => {
    const recent = page.locator('.card[data-id="recent"]');
    await recent.click(); // 釘選最近交易
    const link = recent.locator('.full-link'); // 釘選態才顯示
    await expect(link).toBeVisible({ timeout: 5000 });
    await link.click();
    await expect(page.locator('.desktop-main [data-type="all"]')).toBeVisible({ timeout: 10000 });
  });

  test('主題切換並持久化到 localStorage', async ({ page }) => {
    await page.click('[data-nav="settings"]');
    await page.click('[data-theme-v="dark"]');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')), { timeout: 5000 })
      .toBe('dark');
    expect(await page.evaluate(() => localStorage.getItem('v2-theme'))).toBe('dark');
  });

  test('收入拆分受限資金：明細顯示、面板可見、可解鎖', async ({ page }) => {
    await gotoLedger(page);
    await page.click('[data-el="add"]');
    await page.waitForSelector('.overlay.center [data-el="save"]', { timeout: 10000 });
    await page.click('.overlay.center [data-el="incBtn"]');
    await page.fill('.overlay.center [data-el="amountInput"]', '250');
    await page.click('.overlay.center [data-leaf="薪資"]');
    await page.click('.overlay.center [data-el="locationArea"] [data-location="bank"]');
    await page.click('.overlay.center [data-el="splitToggle"]');
    await page.waitForSelector('.overlay.center [data-el="restrictedAmount"]', { state: 'visible', timeout: 5000 });
    await page.fill('.overlay.center [data-el="restrictedAmount"]', '3500');
    await page.fill('.overlay.center [data-el="restrictedNote"]', 'E2E學費代收');
    await page.click('.overlay.center [data-el="save"]');
    await page.waitForSelector('.overlay.center', { state: 'detached', timeout: 10000 });

    // 明細看得到受限資金這筆（鎖頭圖示的專屬列）
    await expect(page.locator('.desktop-main')).toContainText('E2E學費代收', { timeout: 10000 });

    // 錢包管理面板：受限資金卡片看得到這筆，且解鎖後從清單消失
    await page.click('[data-nav="settings"]');
    await page.waitForSelector('[data-act="wallet"]', { timeout: 10000 });
    await page.click('[data-act="wallet"]');
    await page.waitForSelector('.overlay .sheet', { timeout: 10000 });
    await expect(page.locator('.overlay .sheet')).toContainText('E2E學費代收', { timeout: 10000 });

    await page.click('[data-unlock]');
    await page.waitForSelector('.overlay.center [data-act="ok"]', { timeout: 5000 });
    await page.click('.overlay.center [data-act="ok"]');
    await page.waitForSelector('.overlay.center', { state: 'detached', timeout: 10000 });
    await expect(page.locator('.overlay .sheet')).not.toContainText('E2E學費代收', { timeout: 10000 });
  });
});

/**
 * 更新提示 Toast：偵測到新版本（載入到的版本 ≠ localStorage 記的上次版本）時，
 * 跳出「已更新：<說明>」的自動消失 Toast。此區塊不需登入、不依賴後端資料，
 * 只驗證 main.js 的版本比對邏輯，故獨立於「核心流程」describe（無 beforeEach 登入）。
 * 斷言只比對穩定前綴「已更新」，不綁 RELEASE_NOTE 文字，升版改說明時測試不會壞。
 */
test.describe('v2 更新提示 Toast', () => {
  test('偵測到新版本後跳出更新說明 Toast', async ({ page }) => {
    // 先塞一個明顯較舊的版本，載入後應判定為「已更新」並跳 Toast
    await page.addInitScript(() => {
      try { localStorage.setItem('lastSeenVersion', '0.0.0-old'); } catch {}
    });
    await page.goto('/v2/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('已更新：')).toBeVisible({ timeout: 6000 });
  });

  test('首次載入（無上次版本記錄）不跳 Toast', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.removeItem('lastSeenVersion'); } catch {}
    });
    await page.goto('/v2/', { waitUntil: 'domcontentloaded' });
    // 等 App 外殼（登入卡或已登入外殼）出現，代表 boot 已跑完版本比對
    await page.waitForSelector('.auth-card, .sidebar, .tabbar', { timeout: 15000 });
    await expect(page.getByText('已更新：')).toHaveCount(0);
  });
});
