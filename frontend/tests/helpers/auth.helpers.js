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
  // 使用 waitUntil: 'domcontentloaded' 避免等待過長，並設置 timeout
  await page.goto('/#register', { waitUntil: 'domcontentloaded', timeout: 10000 });

  // 等待頁面穩定
  await page.waitForLoadState('networkidle', { timeout: 10000 });

  // 等待註冊 modal 顯示（移除 hidden class）
  await page.waitForSelector('#register-modal:not(.hidden)', { timeout: 10000 });

  // 等待輸入框可見並可交互
  await page.waitForSelector('#register-modal input[name="name"]', { state: 'visible', timeout: 10000 });

  // 填寫註冊表單
  await page.fill('#register-modal input[name="name"]', user.name);
  await page.fill('#register-modal input[name="email"]', user.email);
  await page.fill('#register-modal input[name="password"]', user.password);
  await page.fill('#register-modal input[name="password-confirm"]', user.password);

  // 提交註冊
  await page.click('#register-modal button:has-text("註冊")');

  // 等待成功訊息 (SweetAlert2 modal with success icon)
  await page.waitForSelector('.swal2-popup .swal2-icon.swal2-success', { timeout: 10000 });
}

/**
 * 登入用戶
 * @param {import('@playwright/test').Page} page
 * @param {Object} credentials - 登入憑證
 */
export async function loginUser(page, credentials) {
  // 使用 waitUntil: 'domcontentloaded' 避免等待過長，並設置 timeout
  await page.goto('/#login', { waitUntil: 'domcontentloaded', timeout: 10000 });

  // 等待頁面穩定
  await page.waitForLoadState('networkidle', { timeout: 10000 });

  // 等待登入 modal 顯示（移除 hidden class）
  await page.waitForSelector('#login-modal:not(.hidden)', { timeout: 10000 });

  // 等待輸入框可見並可交互
  await page.waitForSelector('#login-modal input[name="email"]', { state: 'visible', timeout: 10000 });

  // 填寫登入表單
  await page.fill('#login-modal input[name="email"]', credentials.email);
  await page.fill('#login-modal input[name="password"]', credentials.password);

  // 提交登入
  await page.click('#login-modal button:has-text("登入")');

  // 等待導航到儀表板
  await page.waitForURL('**/#dashboard', { timeout: 10000 });
}

/**
 * 登出用戶
 * @param {import('@playwright/test').Page} page
 */
export async function logoutUser(page) {
  // 點擊設定選單
  await page.click('a[href="#settings"]');
  await page.waitForLoadState('networkidle');

  // 點擊登出按鈕
  await page.click('button:has-text("登出")');

  // 等待導航到登入頁
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
    // Navigate to the home page first to ensure we have a stable context
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10000 });

    // Wait for page to be ready
    await page.waitForLoadState('load', { timeout: 10000 });

    // Clear localStorage
    await page.evaluate(() => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
    });

    // Wait a bit to ensure state is cleared
    await page.waitForTimeout(500);
  } catch (error) {
    // If navigation fails, try to clear without navigation
    try {
      await page.evaluate(() => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
      });
    } catch (retryError) {
      // Log but don't fail the test
      console.warn('Could not clear auth state:', retryError.message);
    }
  }
}
