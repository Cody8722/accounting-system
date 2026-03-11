/**
 * 認證測試輔助函數
 */

/**
 * 生成唯一的測試用戶 Email
 */
export function generateTestEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

/**
 * 生成強密碼
 */
export function generateStrongPassword() {
  return 'MyS3cur3P@ssw0rd!XyZ';
}

/**
 * 生成測試用戶資料
 */
export function generateTestUser() {
  return {
    email: generateTestEmail(),
    password: generateStrongPassword(),
    name: `測試用戶 ${Date.now()}`
  };
}

/**
 * 註冊新用戶
 * @param {import('@playwright/test').Page} page
 * @param {Object} user - 用戶資料
 */
export async function registerUser(page, user) {
  try {
    console.log('📝 Starting registration process...');
    console.log(`📧 Email: ${user.email}`);
    console.log(`👤 Name: ${user.name}`);

    await page.goto('/#register', { waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log('✓ Navigated to register page');

    await page.waitForLoadState('networkidle', { timeout: 10000 });
    console.log('✓ Network idle');

    // 等待註冊 modal 顯示
    await page.waitForSelector('#register-modal:not(.hidden)', { timeout: 10000 });
    console.log('✓ Register modal visible');

    await page.waitForSelector('#register-modal input[name="name"]', { state: 'visible', timeout: 10000 });
    console.log('✓ Registration form visible');

    // 填寫註冊表單
    await page.fill('#register-modal input[name="name"]', user.name);
    await page.fill('#register-modal input[name="email"]', user.email);
    await page.fill('#register-modal input[name="password"]', user.password);
    await page.fill('#register-modal input[name="password-confirm"]', user.password);
    console.log('✓ Registration form filled');

    // 監聽註冊 API 請求
    const registerRequestPromise = page.waitForResponse(
      response => response.url().includes('/api/auth/register'),
      { timeout: 15000 }
    ).catch(() => null);

    // 提交註冊 - 使用 force: true 來繞過可視性檢查，因為按鈕可能因表單太長而在視窗外
    await page.click('#register-modal button:has-text("註冊")', { force: true });
    console.log('✓ Register button clicked');

    // 等待註冊 API 回應
    const registerResponse = await registerRequestPromise;
    if (registerResponse) {
      const status = registerResponse.status();
      console.log(`📨 Register API response status: ${status}`);

      if (status !== 201 && status !== 200) {
        const responseBody = await registerResponse.text().catch(() => 'Unable to read response');
        console.error(`❌ Registration failed with status ${status}:`, responseBody);
        await page.screenshot({ path: `register-error-${Date.now()}.png`, fullPage: true });
        throw new Error(`Registration API returned status ${status}: ${responseBody}`);
      }
    }

    // 等待成功後跳轉到登入頁（success message → modal close → #login）
    await page.waitForFunction(
      () => {
        const loginModal = document.getElementById('login-modal');
        return loginModal && !loginModal.classList.contains('hidden');
      },
      { timeout: 10000 }
    );
    console.log('✓ Redirected to login page after registration');

    console.log('✅ Registration completed successfully!');

  } catch (error) {
    console.error('❌ Registration failed!');
    console.error('Error:', error.message);
    console.error('Current URL:', page.url());

    try {
      const errorMessage = await page.evaluate(() => {
        const registerError = document.getElementById('register-error');
        return registerError ? registerError.textContent : 'No error message';
      });
      console.error('Page error message:', errorMessage);
      await page.screenshot({ path: `register-failure-${Date.now()}.png`, fullPage: true });
    } catch (debugError) {
      console.error('Failed to collect debug info:', debugError.message);
    }

    throw error;
  }
}

/**
 * 登入用戶
 * @param {import('@playwright/test').Page} page
 * @param {Object} credentials - 登入憑證
 */
export async function loginUser(page, credentials) {
  try {
    console.log('🔐 Starting login process...');
    console.log(`📧 Email: ${credentials.email}`);
    console.log(`🌐 Current URL: ${page.url()}`);

    // 導航到登入頁面
    await page.goto('/#login', { waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log('✓ Navigated to login page');

    await page.waitForLoadState('networkidle', { timeout: 10000 });
    console.log('✓ Network idle');

    // 等待登入 modal 顯示
    await page.waitForSelector('#login-modal:not(.hidden)', { timeout: 10000 });
    console.log('✓ Login modal visible');

    await page.waitForSelector('#login-modal input[name="email"]', { state: 'visible', timeout: 10000 });
    console.log('✓ Email input visible');

    // 檢查後端連接
    const apiStatus = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/health');
        return { ok: response.ok, status: response.status };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
    console.log('📡 API health check:', apiStatus);

    // 填寫登入表單
    await page.fill('#login-modal input[name="email"]', credentials.email);
    await page.fill('#login-modal input[name="password"]', credentials.password);
    console.log('✓ Credentials filled');

    // 監聽網絡請求以診斷登入問題
    const loginRequestPromise = page.waitForResponse(
      response => response.url().includes('/api/auth/login'),
      { timeout: 15000 }
    ).catch(() => null);

    // 提交登入 - 使用 force: true 來繞過可視性檢查
    await page.click('#login-modal button:has-text("登入")', { force: true });
    console.log('✓ Login button clicked');

    // 等待登入 API 回應
    const loginResponse = await loginRequestPromise;
    if (loginResponse) {
      const status = loginResponse.status();
      console.log(`📨 Login API response status: ${status}`);

      if (status !== 200) {
        const responseBody = await loginResponse.text().catch(() => 'Unable to read response');
        console.error(`❌ Login failed with status ${status}:`, responseBody);

        // 截圖以幫助調試
        await page.screenshot({ path: `login-error-${Date.now()}.png`, fullPage: true });
        throw new Error(`Login API returned status ${status}: ${responseBody}`);
      }
    } else {
      console.warn('⚠️ No login API response detected');
    }

    // 等待登入成功 - 前端隱藏 auth modal 並顯示 mainContent
    await page.waitForFunction(
      () => {
        const loginModal = document.getElementById('login-modal');
        return loginModal && loginModal.classList.contains('hidden');
      },
      { timeout: 20000 }  // 增加超时时间到 20 秒（CI 环境可能较慢）
    );
    console.log('✓ Login modal hidden - login successful');

    // 额外等待确保 DOM 更新完成
    await page.waitForTimeout(1000);
    console.log('✓ Waited for DOM updates to complete');

    // 驗證認證狀態
    const authToken = await page.evaluate(() => localStorage.getItem('authToken'));
    if (!authToken) {
      console.warn('⚠️ Warning: No auth token found in localStorage after login');
    } else {
      console.log('✓ Auth token stored in localStorage');
    }

    console.log(`✅ Login completed successfully! Current URL: ${page.url()}`);

  } catch (error) {
    console.error('❌ Login failed!');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Current URL:', page.url());

    try {
      const pageTitle = await page.title();
      console.error('Page title:', pageTitle);

      // 檢查是否有錯誤訊息顯示
      const errorMessage = await page.evaluate(() => {
        const loginError = document.getElementById('login-error');
        return loginError ? loginError.textContent : 'No error message found';
      });
      console.error('Page error message:', errorMessage);

      // 檢查 localStorage 狀態
      const storageState = await page.evaluate(() => ({
        authToken: localStorage.getItem('authToken'),
        userData: localStorage.getItem('userData')
      }));
      console.error('localStorage state:', storageState);

      // 截圖以幫助調試
      await page.screenshot({ path: `login-failure-${Date.now()}.png`, fullPage: true });
    } catch (debugError) {
      console.error('Failed to collect debug info:', debugError.message);
    }

    throw new Error(`Login failed: ${error.message}`);
  }
}

/**
 * 登出用戶
 * @param {import('@playwright/test').Page} page
 */
export async function logoutUser(page) {
  await page.click('a[href="#settings"]');
  await page.waitForLoadState('networkidle');

  await page.click('button:has-text("登出")');
  await page.waitForURL('**/#login', { timeout: 5000 });
}

/**
 * 檢查是否已登入
 * @param {import('@playwright/test').Page} page
 */
export async function isLoggedIn(page) {
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  return !!token;
}

/**
 * 清除認證狀態
 * @param {import('@playwright/test').Page} page
 */
export async function clearAuthState(page) {
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForLoadState('load', { timeout: 10000 });
    await page.evaluate(() => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
      localStorage.removeItem('rememberedEmail');
    });
    await page.waitForTimeout(500);
  } catch (error) {
    try {
      await page.evaluate(() => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        localStorage.removeItem('rememberedEmail');
      });
    } catch (retryError) {
      console.warn('Could not clear auth state:', retryError.message);
    }
  }
}
