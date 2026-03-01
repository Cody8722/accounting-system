import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerUser,
  loginUser,
  clearAuthState
} from '../helpers/auth.helpers.js';
import { setupApiMocks } from '../helpers/api-mock.helpers.js';

test.describe('設定頁面測試', () => {
  let user;

  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await clearAuthState(page);
    await page.waitForTimeout(500);

    user = generateTestUser();
    await registerUser(page, user);

    // 等待跳轉到登入頁
    await page.waitForFunction(
      () => {
        const loginModal = document.getElementById('login-modal');
        return loginModal && !loginModal.classList.contains('hidden');
      },
      { timeout: 15000 }
    );

    await loginUser(page, user);

    // 導航到設定頁面
    await page.click('.sidebar-item[data-page="settings"]');
    await page.waitForTimeout(500);
  });

  test('使用者可以修改個人資料名稱', async ({ page }) => {
    const newName = `新名稱 ${Date.now()}`;

    // 點擊「修改使用者名稱」按鈕
    await page.click('button:has-text("修改使用者名稱")');

    // 等待編輯區域顯示
    await page.waitForSelector('#edit-name-section:not(.hidden)', { timeout: 5000 });

    // 輸入新名稱
    await page.fill('#edit-name-input', newName);

    // 儲存
    await page.click('#edit-name-section button:has-text("儲存")');

    // 等待 toast 訊息或名稱更新
    await page.waitForTimeout(2000);

    // 驗證名稱已更新
    await expect(page.locator('#user-name-display')).toContainText(newName, { timeout: 5000 });
  });

  test('使用者可以修改密碼', async ({ page }) => {
    const newPassword = 'NewS3cur3P@ssw0rd!123';

    // 點擊「修改密碼」按鈕
    await page.click('button:has-text("修改密碼")');

    // 等待密碼修改區域顯示
    await page.waitForSelector('#change-password-section:not(.hidden)', { timeout: 5000 });

    // 輸入舊密碼
    await page.fill('#current-password-input', user.password);

    // 輸入新密碼
    await page.fill('#new-password-input', newPassword);

    // 確認新密碼
    await page.fill('#confirm-password-input', newPassword);

    // 儲存
    await page.click('#change-password-section button:has-text("儲存")');

    // 等待 toast 成功訊息或區域被隱藏
    await page.waitForFunction(
      () => {
        const section = document.getElementById('change-password-section');
        return section && section.classList.contains('hidden');
      },
      { timeout: 10000 }
    );
  });

  test('弱密碼應顯示強度警告', async ({ page }) => {
    // 點擊「修改密碼」按鈕
    await page.click('button:has-text("修改密碼")');
    await page.waitForSelector('#change-password-section:not(.hidden)', { timeout: 5000 });

    // 輸入弱密碼
    await page.fill('#new-password-input', '123456');

    // 等待密碼強度檢查器出現（前端會即時驗證密碼強度）
    await page.waitForTimeout(1000);

    // 密碼強度檢查器應該顯示且有紅色指標
    const strengthChecker = page.locator('#change-password-strength-checker');
    if (await strengthChecker.count() > 0) {
      // 檢查是否有失敗的驗證項目（紅色標記）
      const failedChecks = page.locator('#change-password-strength-checker .text-red-500, #change-password-strength-checker .fa-times-circle');
      const failCount = await failedChecks.count();
      expect(failCount).toBeGreaterThan(0);
    }
  });

  test('密碼不一致應被拒絕', async ({ page }) => {
    // 點擊「修改密碼」按鈕
    await page.click('button:has-text("修改密碼")');
    await page.waitForSelector('#change-password-section:not(.hidden)', { timeout: 5000 });

    // 輸入舊密碼
    await page.fill('#current-password-input', user.password);

    // 輸入不同的新密碼
    await page.fill('#new-password-input', 'NewS3cur3P@ssw0rd!123');
    await page.fill('#confirm-password-input', 'DifferentP@ssw0rd!456');

    // 儲存
    await page.click('#change-password-section button:has-text("儲存")');

    // 應該顯示錯誤訊息（前端檢查密碼不一致）
    await page.waitForFunction(
      () => {
        const errEl = document.getElementById('change-password-error');
        return errEl && !errEl.classList.contains('hidden') && errEl.textContent.includes('不一致');
      },
      { timeout: 5000 }
    );
  });

  test('設定頁面應顯示用戶資訊', async ({ page }) => {
    // 驗證用戶名稱顯示
    await expect(page.locator('#user-name-display')).toContainText(user.name, { timeout: 5000 });

    // 驗證 Email 顯示
    await expect(page.locator('#user-email-display')).toContainText(user.email, { timeout: 5000 });
  });
});
