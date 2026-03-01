import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerUser,
  loginUser,
  logoutUser,
  clearAuthState
} from '../helpers/auth.helpers.js';
import { weakPasswords, invalidEmails } from '../fixtures/test-data.js';

test.describe('認證流程測試', () => {

  test.beforeEach(async ({ page }) => {
    // 清除認證狀態
    await clearAuthState(page);
  });

  test('使用者可以成功註冊並登入', async ({ page }) => {
    // 生成測試用戶
    const user = generateTestUser();

    // 前往註冊頁面
    await page.goto('/#register');
    await page.waitForLoadState('networkidle');

    // 等待註冊 modal 顯示
    await page.waitForSelector('#register-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForSelector('#register-modal input[name="name"]', { state: 'visible', timeout: 5000 });

    // 填寫註冊表單
    await page.fill('#register-modal input[name="name"]', user.name);
    await page.fill('#register-modal input[name="email"]', user.email);
    await page.fill('#register-modal input[name="password"]', user.password);
    await page.fill('#register-modal input[name="password-confirm"]', user.password);

    // 提交註冊
    await page.click('#register-modal button:has-text("註冊")');

    // 驗證成功訊息 (SweetAlert2 modal with success icon)
    await expect(page.locator('.swal2-popup .swal2-icon.swal2-success')).toBeVisible({ timeout: 10000 });

    // 關閉成功訊息
    await page.click('.swal2-confirm');

    // 驗證自動跳轉到登入頁
    await expect(page).toHaveURL(/.*#login/);

    // 等待登入 modal 顯示
    await page.waitForSelector('#login-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForSelector('#login-modal input[name="email"]', { state: 'visible', timeout: 5000 });

    // 登入
    await page.fill('#login-modal input[name="email"]', user.email);
    await page.fill('#login-modal input[name="password"]', user.password);
    await page.click('#login-modal button:has-text("登入")');

    // 驗證登入成功並跳轉到儀表板
    await expect(page).toHaveURL(/.*#dashboard/, { timeout: 10000 });

    // 驗證用戶名稱顯示
    await expect(page.locator('.user-name, [data-user-name]')).toContainText(user.name, { timeout: 5000 });
  });

  test('弱密碼應該被拒絕', async ({ page }) => {
    const user = generateTestUser();

    await page.goto('/#register');
    await page.waitForLoadState('networkidle');

    // 等待註冊 modal 顯示
    await page.waitForSelector('#register-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForSelector('#register-modal input[name="name"]', { state: 'visible', timeout: 5000 });

    // 填寫基本資料
    await page.fill('#register-modal input[name="name"]', user.name);
    await page.fill('#register-modal input[name="email"]', user.email);

    // 測試第一個弱密碼
    await page.fill('#register-modal input[name="password"]', weakPasswords[0]);
    await page.fill('#register-modal input[name="password-confirm"]', weakPasswords[0]);

    // 提交註冊
    await page.click('#register-modal button:has-text("註冊")');

    // 驗證錯誤訊息 (SweetAlert2 modal with error icon)
    await expect(page.locator('.swal2-popup .swal2-icon.swal2-error, .error-message')).toBeVisible({ timeout: 5000 });
  });

  test('無效的 Email 應該被拒絕', async ({ page }) => {
    const user = generateTestUser();

    await page.goto('/#register');
    await page.waitForLoadState('networkidle');

    // 等待註冊 modal 顯示
    await page.waitForSelector('#register-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForSelector('#register-modal input[name="name"]', { state: 'visible', timeout: 5000 });

    // 填寫基本資料
    await page.fill('#register-modal input[name="name"]', user.name);
    await page.fill('#register-modal input[name="email"]', invalidEmails[0]);
    await page.fill('#register-modal input[name="password"]', user.password);
    await page.fill('#register-modal input[name="password-confirm"]', user.password);

    // 提交註冊
    await page.click('#register-modal button:has-text("註冊")');

    // 驗證錯誤訊息或表單驗證 (SweetAlert2 modal with error icon)
    const hasError = await page.locator('.swal2-popup .swal2-icon.swal2-error, .error-message, input:invalid').count() > 0;
    expect(hasError).toBeTruthy();
  });

  test('使用者可以登出', async ({ page }) => {
    // 先註冊並登入
    const user = generateTestUser();
    await registerUser(page, user);
    await page.click('.swal2-confirm'); // 關閉註冊成功訊息
    await loginUser(page, user);

    // 前往設定頁面
    await page.click('a[href="#settings"]');
    await page.waitForLoadState('networkidle');

    // 點擊登出
    await page.click('button:has-text("登出")');

    // 驗證跳轉到登入頁
    await expect(page).toHaveURL(/.*#login/);

    // 驗證 token 已清除
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeNull();
  });

  test('錯誤的憑證無法登入', async ({ page }) => {
    await page.goto('/#login');
    await page.waitForLoadState('networkidle');

    // 等待登入 modal 顯示
    await page.waitForSelector('#login-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForSelector('#login-modal input[name="email"]', { state: 'visible', timeout: 5000 });

    // 使用不存在的帳號
    await page.fill('#login-modal input[name="email"]', 'nonexistent@example.com');
    await page.fill('#login-modal input[name="password"]', 'WrongPassword123!');

    // 提交登入
    await page.click('#login-modal button:has-text("登入")');

    // 驗證錯誤訊息 (SweetAlert2 modal with error icon)
    await expect(page.locator('.swal2-popup .swal2-icon.swal2-error')).toBeVisible({ timeout: 5000 });

    // 驗證仍在登入頁
    await expect(page).toHaveURL(/.*#login/);
  });

  test('未登入時訪問受保護頁面應跳轉到登入頁', async ({ page }) => {
    // 確保未登入
    await clearAuthState(page);

    // 嘗試訪問儀表板
    await page.goto('/#dashboard');

    // 應該被重定向到登入頁
    await expect(page).toHaveURL(/.*#login/, { timeout: 5000 });
  });

  test('記住我功能應正常運作', async ({ page }) => {
    const user = generateTestUser();

    // 註冊
    await registerUser(page, user);
    await page.click('.swal2-confirm');

    // 登入並勾選記住我
    await page.goto('/#login');
    await page.waitForLoadState('networkidle');

    // 等待登入 modal 顯示
    await page.waitForSelector('#login-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForSelector('#login-modal input[name="email"]', { state: 'visible', timeout: 5000 });

    await page.fill('#login-modal input[name="email"]', user.email);
    await page.fill('#login-modal input[name="password"]', user.password);

    // 勾選記住我
    const rememberCheckbox = page.locator('input[type="checkbox"]#remember-me, input[name="remember"]');
    if (await rememberCheckbox.count() > 0) {
      await rememberCheckbox.check();
    }

    await page.click('#login-modal button:has-text("登入")');
    await expect(page).toHaveURL(/.*#dashboard/);

    // 重新載入頁面
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 應該仍然保持登入狀態
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).not.toBeNull();
  });
});
