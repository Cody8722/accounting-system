import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerUser,
  loginUser,
  clearAuthState
} from '../helpers/auth.helpers.js';
import { setupApiMocks } from '../helpers/api-mock.helpers.js';
import { weakPasswords, invalidEmails } from '../fixtures/test-data.js';

test.describe('認證流程測試', () => {

  test.beforeEach(async ({ page }) => {
    // Disabled API mocks - using real backend in CI
    // await setupApiMocks(page);
    await clearAuthState(page);
  });

  test('使用者可以成功註冊並登入', async ({ page }) => {
    const user = generateTestUser();

    // 註冊
    await registerUser(page, user);

    // 等待自動跳轉到登入頁（前端 2 秒後跳轉）
    await page.waitForFunction(
      () => {
        const loginModal = document.getElementById('login-modal');
        return loginModal && !loginModal.classList.contains('hidden');
      },
      { timeout: 15000 }
    );

    // 填寫登入表單
    await page.fill('#login-modal input[name="email"]', user.email);
    await page.fill('#login-modal input[name="password"]', user.password);
    await page.click('#login-modal button:has-text("登入")');

    // 驗證登入成功 - login modal 被隱藏
    await page.waitForFunction(
      () => {
        const loginModal = document.getElementById('login-modal');
        return loginModal && loginModal.classList.contains('hidden');
      },
      { timeout: 10000 }
    );

    // 驗證用戶名稱顯示
    await expect(page.locator('#user-name-display')).toContainText(user.name, { timeout: 5000 });
  });

  test('弱密碼應該被拒絕', async ({ page }) => {
    const user = generateTestUser();

    await page.goto('/#register');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('#register-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForSelector('#register-modal input[name="name"]', { state: 'visible', timeout: 5000 });

    // 填寫基本資料
    await page.fill('#register-modal input[name="name"]', user.name);
    await page.fill('#register-modal input[name="email"]', user.email);

    // 使用弱密碼
    await page.fill('#register-modal input[name="password"]', weakPasswords[0]);
    await page.fill('#register-modal input[name="password-confirm"]', weakPasswords[0]);

    // 提交註冊
    await page.click('#register-modal button:has-text("註冊")');

    // 驗證錯誤訊息（前端顯示行內錯誤文字 或 後端拒絕）
    await page.waitForFunction(
      () => {
        const errEl = document.getElementById('register-error');
        if (errEl && !errEl.classList.contains('hidden') && errEl.textContent.length > 0) {
          // 確認不是成功訊息
          return !errEl.textContent.includes('註冊成功');
        }
        return false;
      },
      { timeout: 10000 }
    );

    const errorText = await page.locator('#register-error').textContent();
    expect(errorText).toBeTruthy();
    expect(errorText).not.toContain('註冊成功');
  });

  test('無效的 Email 應該被拒絕', async ({ page }) => {
    const user = generateTestUser();

    await page.goto('/#register');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('#register-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForSelector('#register-modal input[name="name"]', { state: 'visible', timeout: 5000 });

    // 填寫基本資料
    await page.fill('#register-modal input[name="name"]', user.name);
    await page.fill('#register-modal input[name="email"]', invalidEmails[0]);
    await page.fill('#register-modal input[name="password"]', user.password);
    await page.fill('#register-modal input[name="password-confirm"]', user.password);

    // 提交註冊
    await page.click('#register-modal button:has-text("註冊")');

    // 驗證瀏覽器原生驗證或錯誤訊息
    const hasError = await page.locator('#register-error:not(.hidden), input:invalid').count() > 0;
    expect(hasError).toBeTruthy();
  });

  test('使用者可以登出', async ({ page }) => {
    const user = generateTestUser();
    await registerUser(page, user);

    // 等待跳轉到登入頁並登入
    await page.waitForFunction(
      () => {
        const loginModal = document.getElementById('login-modal');
        return loginModal && !loginModal.classList.contains('hidden');
      },
      { timeout: 15000 }
    );
    await page.fill('#login-modal input[name="email"]', user.email);
    await page.fill('#login-modal input[name="password"]', user.password);
    await page.click('#login-modal button:has-text("登入")');

    // 等待登入成功
    await page.waitForFunction(
      () => {
        const loginModal = document.getElementById('login-modal');
        return loginModal && loginModal.classList.contains('hidden');
      },
      { timeout: 10000 }
    );

    // 導航到設定頁面
    await page.click('.sidebar-item[data-page="settings"]');
    await page.waitForTimeout(500);

    // 點擊登出
    await page.click('button:has-text("登出")');

    // 確認登出對話框（使用自定義 showConfirm，非 SweetAlert2）
    // 等待對話框出現，然後點擊「登出」按鈕
    await page.waitForSelector('text=確定要登出嗎', { timeout: 5000 });
    // 點擊文字為「登出」的按鈕（對話框中的確認按鈕）
    const confirmButtons = page.locator('button');
    // 找到對話框中的「登出」按鈕（不是sidebar中的）
    const logoutConfirmBtn = page.locator('button:has-text("登出")').last();
    await logoutConfirmBtn.click();

    // 驗證跳轉到登入頁
    await page.waitForFunction(
      () => {
        const loginModal = document.getElementById('login-modal');
        return loginModal && !loginModal.classList.contains('hidden');
      },
      { timeout: 5000 }
    );

    // 驗證 token 已清除
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeNull();
  });

  test('錯誤的憑證無法登入', async ({ page }) => {
    await page.goto('/#login');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('#login-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForSelector('#login-modal input[name="email"]', { state: 'visible', timeout: 5000 });

    // 使用不存在的帳號
    await page.fill('#login-modal input[name="email"]', 'nonexistent@example.com');
    await page.fill('#login-modal input[name="password"]', 'WrongPassword123!');

    // 提交登入
    await page.click('#login-modal button:has-text("登入")');

    // 驗證錯誤訊息（行內文字：data.error 或「登入失敗」）
    await page.waitForFunction(
      () => {
        const errEl = document.getElementById('login-error');
        if (!errEl) return false;
        const text = errEl.textContent;
        // 等待顯示實際錯誤訊息（非「登入中...」）
        return text.length > 0 && !text.includes('登入中') &&
          (text.includes('錯誤') || text.includes('失敗'));
      },
      { timeout: 10000 }
    );

    // 驗證仍在登入頁
    const loginModalVisible = await page.evaluate(() => {
      const loginModal = document.getElementById('login-modal');
      return loginModal && !loginModal.classList.contains('hidden');
    });
    expect(loginModalVisible).toBeTruthy();
  });

  test('未登入時訪問受保護頁面應跳轉到登入頁', async ({ page }) => {
    // 清除 localStorage 並強制重新載入頁面，觸發 verifyToken()
    await page.evaluate(() => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
    });
    // 強制完整頁面重載（hash change 不會重跑 verifyToken）
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 應該顯示登入 modal
    const loginModalVisible = await page.evaluate(() => {
      const loginModal = document.getElementById('login-modal');
      return loginModal && !loginModal.classList.contains('hidden');
    });
    expect(loginModalVisible).toBeTruthy();
  });

  test('記住我功能應正常運作', async ({ page }) => {
    const user = generateTestUser();

    // 註冊
    await registerUser(page, user);

    // 等待跳轉到登入頁
    await page.waitForFunction(
      () => {
        const loginModal = document.getElementById('login-modal');
        return loginModal && !loginModal.classList.contains('hidden');
      },
      { timeout: 15000 }
    );

    // 填寫登入表單
    await page.fill('#login-modal input[name="email"]', user.email);
    await page.fill('#login-modal input[name="password"]', user.password);

    // 勾選記住我
    await page.check('#remember-me');

    // 提交登入
    await page.click('#login-modal button:has-text("登入")');

    // 等待登入成功
    await page.waitForFunction(
      () => {
        const loginModal = document.getElementById('login-modal');
        return loginModal && loginModal.classList.contains('hidden');
      },
      { timeout: 10000 }
    );

    // 驗證 token 存在
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).not.toBeNull();

    // 驗證 rememberedEmail 已儲存
    const rememberedEmail = await page.evaluate(() => localStorage.getItem('rememberedEmail'));
    expect(rememberedEmail).toBe(user.email);
  });
});
