/**
 * auth.js — 登入 / 註冊 / 驗證 / 登出 / 改密碼（v2 精簡版，自帶 DOM）。
 * 端點契約與現行後端一致：
 *   POST /api/auth/login {email,password} -> {token,user}
 *   POST /api/auth/register {name,email,password}
 *   GET  /api/auth/verify -> {user}
 *   POST /api/auth/logout
 *   POST /api/user/change-password {old_password,new_password}
 */

import { apiCall, apiJson, setAuthToken, setUserData, removeAuthToken, getAuthToken, getUserData, resetAuthGuard } from './api.js';
import { showToast } from './utils.js';
import { isOnline, clearOfflineData } from './offline.js';
import { tokenLocallyValid } from './jwt.js';

export { getUserData };

/**
 * 驗證登入狀態，回傳三態：
 *   'valid'           線上驗證通過（並刷新 userData）
 *   'invalid'         無 token，或線上驗證確定失效（401）→ 應跳登入
 *   'offline-trusted' 離線／連不上，但本地有未過期 token + userData → 信任進場（離線模式）
 * 離線只放行「進不進得去 App」；任何寫回後端仍需後端驗證 token，不降低後端安全性。
 */
export async function verifyToken() {
  const token = getAuthToken();
  if (!token) return 'invalid';

  // 離線：不打 API，直接依本地憑證（未過期 + 有 userData）判斷
  if (!isOnline()) {
    return tokenLocallyValid(token) && getUserData() ? 'offline-trusted' : 'invalid';
  }

  try {
    const res = await apiCall('/api/auth/verify', { cache: 'no-store' });
    if (res.ok) { const data = await res.json(); setUserData(data.user); return 'valid'; }
    return 'invalid'; // 線上但非 2xx（401 已由 apiCall 丟出並清憑證）
  } catch (err) {
    // apiCall 對 401 會丟「登入已過期」且清掉本地憑證 → 下方檢查會是 false → invalid。
    // 對網路錯誤（err.offline）→ 本地未過期就信任進場。
    if (err.offline && tokenLocallyValid(token) && getUserData()) return 'offline-trusted';
    return 'invalid';
  }
}

export async function logout() {
  try { await apiCall('/api/auth/logout', { method: 'POST' }); } catch { /* 忽略 */ }
  removeAuthToken();
  // outbox/cache 是全域 IndexedDB store、不依 user 分區——同一台裝置換帳號登入時，
  // 沒清掉的 outbox 會被下一位使用者登入後的 flushOutbox() 自動用他的 token 送出去，
  // cache 也可能被下一位使用者剛好相同的 data-version 簽章沿用，見 clearOfflineData()。
  await clearOfflineData();
  location.reload();
}

export async function changePassword(oldPassword, newPassword) {
  const data = await apiJson('/api/user/change-password', {
    method: 'POST',
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
  return data;
}

/**
 * 在 container 內渲染登入/註冊畫面；成功後呼叫 onSuccess(user)。
 */
export function renderAuth(container, onSuccess) {
  let mode = 'login'; // 'login' | 'register'
  container.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div style="width:52px;height:52px;border-radius:15px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 14px"><i class="ti ti-wallet" style="font-size:28px"></i></div>
        <div class="auth-title" data-el="title">歡迎回來</div>
        <div class="auth-sub" data-el="sub">登入以繼續記帳</div>
        <form data-el="form">
          <input class="auth-field" data-el="name" type="text" placeholder="顯示名稱" autocomplete="name" style="display:none">
          <input class="auth-field" data-el="email" type="email" placeholder="Email" autocomplete="email" required>
          <input class="auth-field" data-el="password" type="password" placeholder="密碼" autocomplete="current-password" required>
          <div class="err hidden" data-el="err"></div>
          <button class="btn-primary" data-el="submit" type="submit" style="width:100%;margin-top:6px">登入</button>
        </form>
        <div style="text-align:center;margin-top:16px;font-size:13px;color:var(--muted2)">
          <span data-el="switchText">還沒有帳號？</span>
          <button class="link" data-el="switch" type="button">註冊</button>
        </div>
      </div>
    </div>`;

  const q = (s) => container.querySelector(`[data-el="${s}"]`);
  const form = q('form'), err = q('err'), submit = q('submit');

  function setMode(m) {
    mode = m;
    const isReg = m === 'register';
    q('name').style.display = isReg ? '' : 'none';
    q('name').required = isReg;
    q('title').textContent = isReg ? '建立帳號' : '歡迎回來';
    q('sub').textContent = isReg ? '開始你的記帳生活' : '登入以繼續記帳';
    submit.textContent = isReg ? '註冊' : '登入';
    q('switchText').textContent = isReg ? '已經有帳號？' : '還沒有帳號？';
    q('switch').textContent = isReg ? '登入' : '註冊';
    q('password').autocomplete = isReg ? 'new-password' : 'current-password';
    err.classList.add('hidden');
  }
  q('switch').addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('hidden');
    submit.disabled = true;
    const email = q('email').value.trim();
    const password = q('password').value;
    const name = q('name').value.trim();
    try {
      if (mode === 'register') {
        const res = await apiCall('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '註冊失敗');
        showToast('註冊成功，請登入', 'success');
        setMode('login');
        q('password').value = '';
        return;
      }
      const res = await apiCall('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '登入失敗');
      setAuthToken(data.token);
      setUserData(data.user);
      resetAuthGuard();
      onSuccess(data.user);
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    } finally {
      submit.disabled = false;
    }
  });

  setMode('login');
}
