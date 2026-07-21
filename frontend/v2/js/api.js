/**
 * api.js — 統一 API 呼叫（v2）。由 js-refactored/api.js 移植：
 * Token 管理、自動帶 Authorization、401 過期處理。
 */

import { backendUrl, storagePrefix } from './config.js';

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

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 && token) {
    removeAuthToken();
    if (!is401Handling) {
      is401Handling = true;
      window.dispatchEvent(new CustomEvent('auth:token-invalid'));
      setTimeout(() => { is401Handling = false; }, 5000);
    }
    throw new Error('登入已過期，請重新登入');
  }
  return response;
}

/** 呼叫並解析 JSON；非 2xx 丟出 error 訊息（Error 物件附帶 .status 與 .body 完整回應，
 * 供需要讀取額外欄位的呼叫端使用，如支出現金不足時 409 回應裡的提領金額試算） */
export async function apiJson(endpoint, options = {}) {
  const res = await apiCall(endpoint, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `請求失敗 (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export function resetAuthGuard() { is401Handling = false; }
