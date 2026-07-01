/**
 * api.js — 統一 API 呼叫（v2）。由 js-refactored/api.js 移植：
 * Token 管理、自動帶 Authorization、401 過期處理。
 */

import { backendUrl } from './config.js';

let is401Handling = false;

export function getAuthToken() { return localStorage.getItem('authToken') || ''; }
export function setAuthToken(token) { localStorage.setItem('authToken', token); }
export function removeAuthToken() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('userData');
}
export function getUserData() {
  const d = localStorage.getItem('userData');
  return d ? JSON.parse(d) : null;
}
export function setUserData(data) { localStorage.setItem('userData', JSON.stringify(data)); }

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

/** 呼叫並解析 JSON；非 2xx 丟出 error 訊息 */
export async function apiJson(endpoint, options = {}) {
  const res = await apiCall(endpoint, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `請求失敗 (${res.status})`);
  return data;
}

export function resetAuthGuard() { is401Handling = false; }
