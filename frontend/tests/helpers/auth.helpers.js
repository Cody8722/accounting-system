/**
 * 認證測試輔助函數
 *
 * 效能優化說明：
 * - 移除 waitForLoadState('networkidle')：Service Worker 的背景 fetch 會讓 networkidle 掛很久
 * - 移除硬編碼 waitForTimeout：改用明確的 DOM 狀態等待
 * - clearAuthState 不做完整 page.goto，直接清除 localStorage
 */

/** 生成唯一的測試用戶 Email */
export function generateTestEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

/** 生成強密碼 */
export function generateStrongPassword() {
  return 'MyS3cur3P@ssw0rd!XyZ';
}

/** 生成測試用戶資料 */
export function generateTestUser() {
  return {
    email: generateTestEmail(),
    password: generateStrongPassword(),
    name: `測試用戶 ${Date.now()}`,
  };
}

/**
 * 清除認證狀態（localStorage）
 * 只在頁面已載入時才能呼叫 evaluate，否則先 goto 再清除。
 */
export async function clearAuthState(page) {
  const clearStorage = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('rememberedEmail');
  };

  try {
    // 嘗試直接清除（頁面已有 context 時最快）
    await page.evaluate(clearStorage);
  } catch {
    // 頁面尚未載入：先導航再清除
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.evaluate(clearStorage);
    } catch (err) {
      console.warn('[clearAuthState] Could not clear auth state:', err.message);
    }
  }
}

/**
 * 註冊新用戶
 * @param {import('@playwright/test').Page} page
 * @param {{ email: string, password: string, name: string }} user
 */
export async function registerUser(page, user) {
  await page.goto('/#register', { waitUntil: 'domcontentloaded', timeout: 10000 });

  await page.waitForSelector('#register-modal:not(.hidden)', { timeout: 10000 });
  await page.waitForSelector('#register-modal input[name="name"]', { state: 'visible', timeout: 10000 });

  await page.fill('#register-modal input[name="name"]', user.name);
  await page.fill('#register-modal input[name="email"]', user.email);
  await page.fill('#register-modal input[name="password"]', user.password);
  await page.fill('#register-modal input[name="password-confirm"]', user.password);

  const registerResponsePromise = page
    .waitForResponse(r => r.url().includes('/api/auth/register'), { timeout: 15000 })
    .catch(() => null);

  await page.click('#register-modal button:has-text("註冊")', { force: true });

  const resp = await registerResponsePromise;
  if (resp && resp.status() !== 201 && resp.status() !== 200) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Registration failed (${resp.status()}): ${body}`);
  }

  // 等待跳轉到登入 modal
  await page.waitForFunction(
    () => document.getElementById('login-modal')?.classList.contains('hidden') === false,
    { timeout: 15000 }
  );
}

/**
 * 登入用戶
 * @param {import('@playwright/test').Page} page
 * @param {{ email: string, password: string }} credentials
 */
export async function loginUser(page, credentials) {
  // 若尚未在登入頁，導航過去
  const loginModal = await page.$('#login-modal:not(.hidden)');
  if (!loginModal) {
    await page.goto('/#login', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForSelector('#login-modal:not(.hidden)', { timeout: 10000 });
  }

  await page.waitForSelector('#login-modal input[name="email"]', { state: 'visible', timeout: 8000 });

  await page.fill('#login-modal input[name="email"]', credentials.email);
  await page.fill('#login-modal input[name="password"]', credentials.password);

  const loginResponsePromise = page
    .waitForResponse(r => r.url().includes('/api/auth/login'), { timeout: 15000 })
    .catch(() => null);

  await page.click('#login-modal button:has-text("登入")', { force: true });

  const resp = await loginResponsePromise;
  if (resp && resp.status() !== 200) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Login failed (${resp.status()}): ${body}`);
  }

  await page.waitForFunction(
    () => document.getElementById('login-modal')?.classList.contains('hidden') === true,
    { timeout: 20000 }
  );
}

/**
 * 登出用戶
 * @param {import('@playwright/test').Page} page
 */
export async function logoutUser(page) {
  await page.click('.sidebar-item[data-page="settings"]');
  await page.waitForSelector('#page-settings.active', { timeout: 5000 });
  await page.click('button:has-text("登出")');
  await page.waitForFunction(
    () => document.getElementById('login-modal')?.classList.contains('hidden') === false,
    { timeout: 5000 }
  );
}

/**
 * 檢查是否已登入
 * @param {import('@playwright/test').Page} page
 */
export async function isLoggedIn(page) {
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  return !!token;
}
