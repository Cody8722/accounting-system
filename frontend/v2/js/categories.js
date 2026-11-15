/**
 * categories.js — 使用者自訂分類：載入、本機快取、套用。
 * 後端 GET/PUT /api/user/categories（存在 users.category_config；null = 內建預設）。
 * 設定先從 localStorage 快取同步套用（畫面第一次渲染就是對的分類，離線也能用），
 * 再向後端確認；跟快取不同才通知畫面重繪。編輯介面在 category-editor.js（用到才載入）。
 */

import { apiCall, apiJson, getUserData } from './api.js';
import { applyCategoryConfig, storagePrefix } from './config.js';

const NS = typeof window !== 'undefined' ? storagePrefix(window.location.pathname) : '';

/** 各分類的使用筆數（記錄 + 定期項目），最後一次向後端取得的結果；刪除分類時提示用 */
let lastUsage = {};

function cacheKey() {
  const u = getUserData() || {};
  return `${NS}categories:${u.id || u._id || u.email || ''}`;
}

/** 把設定存進本機快取；null 代表預設，直接清掉 */
export function cacheCategoryConfig(cfg) {
  try {
    if (cfg) localStorage.setItem(cacheKey(), JSON.stringify(cfg));
    else localStorage.removeItem(cacheKey());
  } catch { /* 儲存不可用（無痕等）：下次開啟再向後端取 */ }
}

function readCache() {
  try {
    const raw = localStorage.getItem(cacheKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * 向後端取分類設定與使用筆數。刻意不走 apiJson：它的 GET 有「資料版本閘門」，版本相同就直接回
 * IndexedDB 的舊快取，而資料版本只涵蓋記錄／預算／定期／錢包，不含分類——改完分類版本不變，
 * 會一直拿到改之前的舊回應。分類很小、也有自己的本機快取，直接打 API 最單純。
 * 失敗（離線、HTTP 錯誤）會丟錯。
 */
async function fetchCategoryResponse() {
  const res = await apiCall('/api/user/categories');
  if (!res.ok) throw new Error(`取得分類失敗 (${res.status})`);
  return res.json();
}

/** 啟動時同步套用本機快取（必須在第一次渲染前呼叫） */
export function applyCachedCategories() {
  applyCategoryConfig(readCache());
}

/**
 * 向後端取最新設定並套用。回傳 true 表示跟目前快取不同（呼叫端據此重繪）。
 * 取不到（離線、後端錯誤）就維持現狀回傳 false。
 */
export async function refreshCategories() {
  let res;
  try {
    res = await fetchCategoryResponse();
  } catch {
    return false;
  }
  lastUsage = res.usage || {};
  const changed = JSON.stringify(res.config || null) !== JSON.stringify(readCache());
  if (changed) {
    applyCategoryConfig(res.config);
    cacheCategoryConfig(res.config);
  }
  return changed;
}

/**
 * 給編輯器用：向後端取最新設定（有差異就套用並更新快取）與各分類使用筆數。
 * 編輯器必須拿到最新設定才能開——全新瀏覽器沒有快取、背景同步又還沒回來時，
 * 若直接用內建預設開編輯器，一按儲存就會把使用者原本的自訂分類蓋掉。
 * 取不到（離線等）回傳 null，由呼叫端擋下。
 */
export async function loadCategoryState() {
  let res;
  try {
    res = await fetchCategoryResponse();
  } catch {
    return null;
  }
  lastUsage = res.usage || {};
  if (JSON.stringify(res.config || null) !== JSON.stringify(readCache())) {
    applyCategoryConfig(res.config);
    cacheCategoryConfig(res.config);
  }
  return { usage: lastUsage };
}

/** 儲存設定（cfg=null 還原預設）。成功後套用並更新快取，回傳後端回應 */
export async function saveCategoryConfig(cfg, renames = []) {
  const body = cfg ? { config: cfg, renames } : { config: null };
  const res = await apiJson('/api/user/categories', { method: 'PUT', body: JSON.stringify(body) });
  applyCategoryConfig(res.config);
  cacheCategoryConfig(res.config);
  return res;
}
