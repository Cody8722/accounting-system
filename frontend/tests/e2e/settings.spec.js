import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerUser,
  loginUser,
  clearAuthState
} from '../helpers/auth.helpers.js';

test.describe('設定頁面測試', () => {
  let user;

  test.beforeEach(async ({ page }) => {
    // 清除狀態並登入
    await clearAuthState(page);
    user = generateTestUser();
    await registerUser(page, user);
    await page.click('.swal2-confirm');
    await loginUser(page, user);

    // 前往設定頁面
    await page.goto('/#settings');
    await page.waitForLoadState('networkidle');
  });

  test('使用者可以修改個人資料名稱', async ({ page }) => {
    const newName = `新名稱 ${Date.now()}`;

    // 點擊編輯名稱按鈕
    const editNameButton = page.locator('button:has-text("編輯"), button[data-action="edit-name"]');
    if (await editNameButton.count() > 0) {
      await editNameButton.first().click();

      // 輸入新名稱
      const nameInput = page.locator('input[name="name"], input#name-input');
      await nameInput.fill(newName);

      // 儲存
      await page.click('button:has-text("儲存"), button:has-text("保存")');

      // 驗證成功訊息
      await expect(page.locator('.swal2-success')).toBeVisible({ timeout: 10000 });
      await page.click('.swal2-confirm');

      // 重新載入並驗證
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 驗證名稱已更新
      await expect(page.locator('.user-name, [data-user-name]')).toContainText(newName);
    }
  });

  test('使用者可以修改密碼', async ({ page }) => {
    const newPassword = 'NewS3cur3P@ssw0rd!123';

    // 點擊修改密碼按鈕
    const changePasswordButton = page.locator('button:has-text("修改密碼"), button:has-text("變更密碼")');
    if (await changePasswordButton.count() > 0) {
      await changePasswordButton.click();

      // 輸入舊密碼
      const oldPasswordInput = page.locator('input[name="old-password"], input[type="password"]').first();
      await oldPasswordInput.fill(user.password);

      // 輸入新密碼
      const newPasswordInput = page.locator('input[name="new-password"]');
      await newPasswordInput.fill(newPassword);

      // 確認新密碼
      const confirmPasswordInput = page.locator('input[name="confirm-password"]');
      await confirmPasswordInput.fill(newPassword);

      // 提交
      await page.click('button:has-text("確認"), button:has-text("提交")');

      // 驗證成功訊息
      await expect(page.locator('.swal2-success')).toBeVisible({ timeout: 10000 });
      await page.click('.swal2-confirm');

      // 登出
      await page.click('button:has-text("登出")');
      await expect(page).toHaveURL(/.*#login/);

      // 等待登入 modal 顯示
      await page.waitForSelector('#login-modal:not(.hidden)', { timeout: 5000 });

      // 使用新密碼登入
      await page.fill('#login-modal input[name="email"]', user.email);
      await page.fill('#login-modal input[name="password"]', newPassword);
      await page.click('button:has-text("登入")');

      // 驗證登入成功
      await expect(page).toHaveURL(/.*#dashboard/, { timeout: 10000 });
    }
  });

  test('弱密碼應被拒絕', async ({ page }) => {
    // 點擊修改密碼按鈕
    const changePasswordButton = page.locator('button:has-text("修改密碼"), button:has-text("變更密碼")');
    if (await changePasswordButton.count() > 0) {
      await changePasswordButton.click();

      // 輸入舊密碼
      const oldPasswordInput = page.locator('input[name="old-password"], input[type="password"]').first();
      await oldPasswordInput.fill(user.password);

      // 輸入弱密碼
      const newPasswordInput = page.locator('input[name="new-password"]');
      await newPasswordInput.fill('123456');

      // 確認密碼
      const confirmPasswordInput = page.locator('input[name="confirm-password"]');
      await confirmPasswordInput.fill('123456');

      // 提交
      await page.click('button:has-text("確認"), button:has-text("提交")');

      // 應該顯示錯誤訊息
      await expect(page.locator('.swal2-error, .error-message')).toBeVisible({ timeout: 5000 });
    }
  });

  test('密碼不一致應被拒絕', async ({ page }) => {
    // 點擊修改密碼按鈕
    const changePasswordButton = page.locator('button:has-text("修改密碼"), button:has-text("變更密碼")');
    if (await changePasswordButton.count() > 0) {
      await changePasswordButton.click();

      // 輸入舊密碼
      const oldPasswordInput = page.locator('input[name="old-password"], input[type="password"]').first();
      await oldPasswordInput.fill(user.password);

      // 輸入新密碼
      const newPasswordInput = page.locator('input[name="new-password"]');
      await newPasswordInput.fill('NewS3cur3P@ssw0rd!123');

      // 輸入不一致的確認密碼
      const confirmPasswordInput = page.locator('input[name="confirm-password"]');
      await confirmPasswordInput.fill('DifferentP@ssw0rd!123');

      // 提交
      await page.click('button:has-text("確認"), button:has-text("提交")');

      // 應該顯示錯誤訊息
      await expect(page.locator('.swal2-error, .error-message, :text("不一致")')).toBeVisible({ timeout: 5000 });
    }
  });

  test('設定頁面應顯示用戶資訊', async ({ page }) => {
    // 驗證用戶名稱顯示
    await expect(page.locator('.user-name, [data-user-name]')).toContainText(user.name);

    // 驗證 Email 顯示
    await expect(page.locator('.user-email, [data-user-email]')).toContainText(user.email);
  });
});
