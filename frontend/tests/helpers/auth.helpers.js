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
  await page.goto('/#register', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 });

  // 等待註冊 modal 顯示
  await page.waitForSelector('#register-modal:not(.hidden)', { timeout: 10000 });
  await page.waitForSelector('#register-modal input[name="name"]', { state: 'visible', timeout: 10000 });

  // 填寫註冊表單
  await page.fill('#register-modal input[name="name"]', user.name);
  await page.fill('#register-modal input[name="email"]', user.email);
  await page.fill('#register-modal input[name="password"]', user.password);
  await page.fill('#register-modal input[name="password-confirm"]', user.password);

  // 提交註冊
  await page.click('#register-modal button:has-text("註冊")');

  // 等待成功訊息（前端使用行內文字，不是 SweetAlert2）
  await page.waitForSelector('#register-error:not(.hidden)', { timeout: 10000 });
  // 等待出現成功文字
  await page.waitForFunction(
    () => {
      const el = document.getElementById('register-error');
      return el && el.textContent.includes('註冊成功');
    },
    { timeout: 10000 }
  );
}

/**
 * 登入用戶
 * @param {import('@playwright/test').Page} page
 * @param {Object} credentials - 登入憑證
 */
export async function loginUser(page, credentials) {
  await page.goto('/#login', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 });

  // 等待登入 modal 顯示
  await page.waitForSelector('#login-modal:not(.hidden)', { timeout: 10000 });
  await page.waitForSelector('#login-modal input[name="email"]', { state: 'visible', timeout: 10000 });

  // 填寫登入表單
  await page.fill('#login-modal input[name="email"]', credentials.email);
  await page.fill('#login-modal input[name="password"]', credentials.password);

  // 提交登入
  await page.click('#login-modal button:has-text("登入")');

  // 等待登入成功 - 前端隱藏 auth modal 並顯示 mainContent
  // 登入成功會設定 hash 為 dashboard
  await page.waitForFunction(
    () => {
      const loginModal = document.getElementById('login-modal');
      return loginModal && loginModal.classList.contains('hidden');
    },
    { timeout: 10000 }
  );
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
