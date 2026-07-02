/**
 * v2 E2E 共用輔助。
 * v2 前端在 /v2/，DOM 以 data-el / data-nav 選取（與現行 frontend 不同）。
 * 為避開註冊端點的速率限制（每 IP 每小時 5 次），註冊走後端 API、每個 spec 只註冊一次；
 * 登入則走 v2 UI（登入無此限制）。
 */

export const BACKEND = process.env.BACKEND_URL || 'http://localhost:5001';

/** 產生唯一測試帳號（密碼符合強度政策：≥12、含大小寫+數字+特殊符號） */
export function genUser() {
  const t = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  return { name: `v2測試${t}`, email: `v2-${t}@example.com`, password: 'MyS3cur3P@ssw0rd!XyZ' };
}

/** 以後端 API 註冊（Node fetch，不受瀏覽器 CORS 限制） */
export async function apiRegister(user) {
  const res = await fetch(`${BACKEND}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  if (![200, 201].includes(res.status)) {
    throw new Error(`register failed ${res.status}: ${await res.text()}`);
  }
}

/** 透過 v2 UI 登入，等待 App 外殼出現（桌面側欄或手機導覽） */
export async function loginV2(page, user) {
  await page.goto('/v2/');
  await page.waitForSelector('.auth-card [data-el="email"]', { timeout: 15000 });
  await page.fill('.auth-card [data-el="email"]', user.email);
  await page.fill('.auth-card [data-el="password"]', user.password);
  await page.click('.auth-card [data-el="submit"]');
  await page.waitForSelector('.sidebar, .tabbar', { timeout: 20000 });
}
