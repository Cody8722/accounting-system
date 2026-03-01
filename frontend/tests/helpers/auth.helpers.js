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
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');

  // 等待註冊 modal 顯示（移除 hidden class）
  await page.waitForSelector('#register-modal:not(.hidden)', { timeout: 5000 });

  // 等待輸入框可見
  await page.waitForSelector('input[name="name"]', { state: 'visible', timeout: 5000 });

  // 填寫註冊表單
  await page.fill('input[name="name"]', user.name);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  // 提交註冊
  await page.click('button:has-text("註冊")');

  // 等待成功訊息
  await page.waitForSelector('.swal2-success', { timeout: 5000 });
}

/**
 * 登入用戶
 * @param {import('@playwright/test').Page} page
 * @param {Object} credentials - 登入憑證
 */
export async function loginUser(page, credentials) {
  await page.goto('/#login');
  await page.waitForLoadState('networkidle');

  // 等待登入 modal 顯示（移除 hidden class）
  await page.waitForSelector('#login-modal:not(.hidden)', { timeout: 5000 });

  // 等待輸入框可見
  await page.waitForSelector('input[name="email"]', { state: 'visible', timeout: 5000 });

  // 填寫登入表單
  await page.fill('input[name="email"]', credentials.email);
  await page.fill('input[name="password"]', credentials.password);

  // 提交登入
  await page.click('button:has-text("登入")');

  // 等待導航到儀表板
  await page.waitForURL('**/#dashboard', { timeout: 5000 });
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
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return !!token;
}

/**
 * 清除認證狀態
 * @param {import('@playwright/test').Page} page
 */
export async function clearAuthState(page) {
  // 如果頁面還在 about:blank，先導航到首頁
  const currentUrl = page.url();
  if (currentUrl === 'about:blank' || !currentUrl.startsWith('http')) {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  }

  await page.evaluate(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
  });
}
