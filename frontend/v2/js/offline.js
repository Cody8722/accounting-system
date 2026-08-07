/**
 * offline.js — 離線核心（Phase 1）：IndexedDB 讀取快取 + 線上/離線偵測。
 *
 * cache store：key = API endpoint 字串（含 query），value = { data, ts }。
 * IndexedDB 不可用（無痕、舊瀏覽器、被停用）時全部降級為 no-op，
 * 不拋錯、不影響線上行為。所有瀏覽器 API 只在函式內存取（可被 node import）。
 */

const DB_NAME = 'accounting-offline';
const DB_VERSION = 1;
const STORE_CACHE = 'cache';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) db.createObjectStore(STORE_CACHE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

function store(db, mode) {
  return db.transaction(STORE_CACHE, mode).objectStore(STORE_CACHE);
}

/** 寫入 GET 回應快取（key=endpoint）。失敗靜默，不影響呼叫端。 */
export async function putCache(key, data) {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise((resolve, reject) => {
      const r = store(db, 'readwrite').put({ data, ts: Date.now() }, key);
      r.onsuccess = resolve;
      r.onerror = () => reject(r.error);
    });
  } catch {
    /* 忽略：快取寫入失敗不該影響正常流程 */
  }
}

/** 讀取快取；回 { data, ts } 或 null。 */
export async function getCache(key) {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise((resolve) => {
      const r = store(db, 'readonly').get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** 是否線上。navigator.onLine 只在明確為 false 時視為離線（保守，避免誤判）。 */
export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}
