/**
 * api.js — 統一 API 呼叫（v2）。由 js-refactored/api.js 移植：
 * Token 管理、自動帶 Authorization、401 過期處理。
 */

import { backendUrl, storagePrefix } from './config.js';
import { getCache, putCache } from './offline.js';

let is401Handling = false;

// 正式/測試同 origin，用路徑前綴分隔 localStorage，避免登入狀態互相覆蓋/借用。
// 正式(/) 前綴為 ''（key 維持 authToken/userData，不動既有正式登入）；測試(/test/) 為 'test:'。
const NS = typeof window !== 'undefined' ? storagePrefix(window.location.pathname) : '';
const K_TOKEN = `${NS}authToken`;
const K_USER = `${NS}userData`;

export function getAuthToken() { return localStorage.getItem(K_TOKEN) || ''; }
export function setAuthToken(token) { localStorage.setItem(K_TOKEN, token); }
export function removeAuthToken() {
  localStorage.removeItem(K_TOKEN);
  localStorage.removeItem(K_USER);
}
export function getUserData() {
  const d = localStorage.getItem(K_USER);
  return d ? JSON.parse(d) : null;
}
export function setUserData(data) { localStorage.setItem(K_USER, JSON.stringify(data)); }

/**
 * 呼叫後端 API（endpoint 可為相對路徑或完整 URL）。
 * @returns {Promise<Response>}
 */
export async function apiCall(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${backendUrl}${endpoint}`;
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (e) {
    // 網路層失敗（離線、連線中斷、DNS）：fetch 拋 TypeError，與 HTTP 狀態碼錯誤區分開，
    // 讓上層可據此回退快取或提示離線，而不是誤判成登入失效（避免網路抖動就把人踢登出）。
    const err = new Error('無法連線伺服器，此操作需恢復連線後再試');
    err.offline = true;
    err.cause = e;
    throw err;
  }

  if (response.status === 401 && token) {
    removeAuthToken();
    if (!is401Handling) {
      is401Handling = true;
      window.dispatchEvent(new CustomEvent('auth:token-invalid'));
      setTimeout(() => { is401Handling = false; }, 5000);
    }
    const err = new Error('登入已過期，請重新登入');
    err.authExpired = true;
    throw err;
  }
  return response;
}

/** 呼叫並解析 JSON；非 2xx 丟出 error 訊息（Error 物件附帶 .status 與 .body 完整回應，
 * 供需要讀取額外欄位的呼叫端使用，如支出現金不足時 409 回應裡的提領金額試算） */
export async function apiJson(endpoint, options = {}) {
  const isGet = (options.method || 'GET').toUpperCase() === 'GET';
  try {
    const res = await apiCall(endpoint, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `請求失敗 (${res.status})`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    // 成功的 GET 順手快取（fire-and-forget），供離線時回退。
    if (isGet) putCache(endpoint, data);
    return data;
  } catch (err) {
    // 離線的 GET → 回退到最後一次成功快取；無快取則維持丟錯（讓呼叫端顯示離線訊息）。
    if (isGet && err.offline) {
      const cached = await getCache(endpoint);
      if (cached) return cached.data;
    }
    throw err;
  }
}

export function resetAuthGuard() { is401Handling = false; }
