/**
 * api.js — 統一 API 呼叫（v2）。由 js-refactored/api.js 移植：
 * Token 管理、自動帶 Authorization、401 過期處理。
 */

import { backendUrl, storagePrefix } from './config.js';
import { getCache, putCache, isOnline } from './offline.js';

let is401Handling = false;

// ==================== 輕量更新檢查（資料版本閘門） ====================
// GET 請求先比對伺服器資料版本簽章，相同就沿用本地快取、不重抓完整資料。
// 記憶體去抖：短時間內（同一頁多個端點）共用一次 /data-version 查詢。
const DATA_VERSION_ENDPOINT = '/admin/api/accounting/data-version';
const VERSION_DEBOUNCE_MS = 5000;
let versionPromise = null;
let versionFetchedAt = 0;

/** 取得目前伺服器資料版本（5 秒記憶體去抖）；查詢本身失敗回 null——
 * 呼叫端據此 fail-safe 往「照常抓資料」退，絕不會因版本查詢失敗而顯示過期資料。 */
function getServerVersion() {
  const now = Date.now();
  if (versionPromise && now - versionFetchedAt < VERSION_DEBOUNCE_MS) return versionPromise;
  versionFetchedAt = now;
  versionPromise = (async () => {
    try {
      const res = await apiCall(DATA_VERSION_ENDPOINT, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      return data && typeof data.version === 'string' ? data.version : null;
    } catch {
      return null;
    }
  })();
  return versionPromise;
}

/** 讓記憶體版本立即失效，下次 GET 會強制重查伺服器版本。任何成功的寫入（線上或
 * 離線同步送出）都會自動觸發（見 apiCall），不需呼叫端逐一記得呼叫。 */
export function invalidateDataVersion() {
  versionPromise = null;
  versionFetchedAt = 0;
}

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
  // FormData（照片上傳等）不能手動設 Content-Type——瀏覽器要自己補上正確的
  // multipart boundary，手動設成 application/json 會讓後端解析不到檔案。
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
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
  // 任何成功的非 GET 請求（寫入）都讓資料版本快取失效，確保緊接著的重抓（包含呼叫端
  // 自己緊接著做的 refresh，如定期收支面板新增後的 refresh()）不會被短暫的版本記憶體
  // 快取誤判成「未變」而顯示舊資料。掛在這裡自動涵蓋所有寫入路徑（含 sync.js 逐筆送出
  // outbox），不需要每個寫入呼叫點各自記得呼叫，不會漏。
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && response.ok) invalidateDataVersion();
  return response;
}

/** 呼叫並解析 JSON；非 2xx 丟出 error 訊息（Error 物件附帶 .status 與 .body 完整回應，
 * 供需要讀取額外欄位的呼叫端使用，如支出現金不足時 409 回應裡的提領金額試算） */
export async function apiJson(endpoint, options = {}) {
  const isGet = (options.method || 'GET').toUpperCase() === 'GET';
  // 版本閘門：僅線上的 GET、且非 data-version 端點本身適用（後者靠 apiCall 直呼，
  // 避免自我遞迴）。離線時完全略過，維持 Phase 1 既有的「離線回退快取」行為不變。
  const useVersionGate = isGet && endpoint !== DATA_VERSION_ENDPOINT && isOnline();
  let serverVersion = null;

  if (useVersionGate) {
    const [version, cached] = await Promise.all([getServerVersion(), getCache(endpoint)]);
    serverVersion = version;
    // 版本查詢成功（非 null）且與快取記的版本相符 → 直接用快取，不重抓完整資料。
    if (serverVersion !== null && cached && cached.version === serverVersion) {
      return cached.data;
    }
  }

  try {
    const res = await apiCall(endpoint, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `請求失敗 (${res.status})`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    // 成功的 GET 順手快取（fire-and-forget），供離線時回退；一併記下本次的伺服器版本，
    // 供下次比對。versionGate 查詢失敗（serverVersion===null）則存 null，代表版本未知，
    // 下次比對必定不相符、會重新走完整流程（fail-safe，不會顯示過期資料）。
    if (isGet) putCache(endpoint, data, useVersionGate ? serverVersion : null);
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
