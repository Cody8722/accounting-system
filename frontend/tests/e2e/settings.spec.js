import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerUser,
  loginUser,
  clearAuthState,
} from '../helpers/auth.helpers.js';

/**
 * 設定頁面測試
 *
 * 兩個 describe 各自有獨立帳號：
 * 1. 一般設定測試（修改名稱、弱密碼警告、密碼不一致）— 共用一個 spec-level 帳號
 * 2. 修改密碼測試 — 獨立 fresh user（因為會實際改密，不能汙染共用帳號）
 */

test.describe('設定頁面測試（一般）', () => {
  let specUser;

  test.beforeAll(async ({ browser }) => {
    specUser = generateTestUser();
    const context = await browser.newContext();
    const page = await context.newPage();
    await clearAuthState(page);
    await registerUser(page, specUser);
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
    await loginUser(page, specUser);
    await page.click('.sidebar-item[data-page="settings"]');
    await page.waitForSelector('#page-settings.active', { timeout: 5000 });
  });

  test('設定頁面應顯示用戶資訊', async ({ page }) => {
    await expect(page.locator('#user-name-display')).toContainText(specUser.name, { timeout: 5000 });
    await expect(page.locator('#user-email-display')).toContainText(specUser.email, { timeout: 5000 });
  });

  test('使用者可以修改個人資料名稱', async ({ page }) => {
    const newName = `新名稱 ${Date.now()}`;

    await page.click('button:has-text("修改使用者名稱")');
    await page.waitForSelector('#edit-name-section:not(.hidden)', { timeout: 5000 });

    await page.fill('#edit-name-input', newName);
    await page.click('#edit-name-section button:has-text("儲存")');

    await page.waitForFunction(
      (name) => document.getElementById('user-name-display')?.textContent.includes(name),
      newName,
      { timeout: 8000 }
    );

    await expect(page.locator('#user-name-display')).toContainText(newName);
  });

  test('弱密碼應顯示強度警告', async ({ page }) => {
    await page.click('button:has-text("修改密碼")');
    await page.waitForSelector('#change-password-section:not(.hidden)', { timeout: 5000 });

    await page.fill('#new-password-input', '123456');

    const strengthChecker = page.locator('#change-password-strength-checker');
    if (await strengthChecker.count() > 0) {
      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            '#change-password-strength-checker .text-red-500, #change-password-strength-checker .fa-times-circle'
          ).length > 0,
        { timeout: 5000 }
      ).catch(() => null);

      const failedChecks = page.locator(
        '#change-password-strength-checker .text-red-500, #change-password-strength-checker .fa-times-circle'
      );
      expect(await failedChecks.count()).toBeGreaterThan(0);
    }
  });

  test('密碼不一致應被拒絕', async ({ page }) => {
    await page.click('button:has-text("修改密碼")');
    await page.waitForSelector('#change-password-section:not(.hidden)', { timeout: 5000 });

    await page.fill('#current-password-input', specUser.password);
    await page.fill('#new-password-input', 'NewS3cur3P@ssw0rd!123');
    await page.fill('#confirm-password-input', 'DifferentP@ssw0rd!456');
    await page.click('#change-password-section button:has-text("儲存")');

    await page.waitForFunction(
      () => {
        const errEl = document.getElementById('change-password-error');
        return errEl && !errEl.classList.contains('hidden') && errEl.textContent.includes('不一致');
      },
      { timeout: 5000 }
    );
  });
});

test.describe('設定頁面測試 - 修改密碼', () => {
  /**
   * 獨立帳號：此測試實際改掉密碼，若和上面共用帳號，
   * 後續用舊密碼 login 的測試會失敗。
   */
  let freshUser;

  test.beforeAll(async ({ browser }) => {
    freshUser = generateTestUser();
    const context = await browser.newContext();
    const page = await context.newPage();
    await clearAuthState(page);
    await registerUser(page, freshUser);
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
    await loginUser(page, freshUser);
    await page.click('.sidebar-item[data-page="settings"]');
    await page.waitForSelector('#page-settings.active', { timeout: 5000 });
  });

  test('使用者可以修改密碼', async ({ page }) => {
    const newPassword = 'NewS3cur3P@ssw0rd!123';

    await page.click('button:has-text("修改密碼")');
    await page.waitForSelector('#change-password-section:not(.hidden)', { timeout: 5000 });

    await page.fill('#current-password-input', freshUser.password);
    await page.fill('#new-password-input', newPassword);
    await page.fill('#confirm-password-input', newPassword);
    await page.click('#change-password-section button:has-text("儲存")');

    await page.waitForFunction(
      () =>
        document.getElementById('change-password-section')?.classList.contains('hidden') === true,
      { timeout: 10000 }
    );
  });
});
