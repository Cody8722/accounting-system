/**
 * offline.js — 離線核心（Phase 1）：IndexedDB 讀取快取 + 線上/離線偵測。
 *
 * cache store：key = API endpoint 字串（含 query），value = { data, ts }。
 * IndexedDB 不可用（無痕、舊瀏覽器、被停用）時全部降級為 no-op，
 * 不拋錯、不影響線上行為。所有瀏覽器 API 只在函式內存取（可被 node import）。
 */

const DB_NAME = 'accounting-offline';
const DB_VERSION = 2;
const STORE_CACHE = 'cache';
// outbox：離線寫入佇列（Phase 2）。key=自動遞增 seq（天然 FIFO），clientId 唯一索引供合併查找。
const STORE_OUTBOX = 'outbox';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    // 只 resolve 一次；任何路徑（成功/錯誤/被擋/逾時）都必須讓 promise 收斂，
    // 否則 await openDb() 會永遠掛住，拖垮所有依賴它的畫面（如明細頁的待同步疊加）。
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      done(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) db.createObjectStore(STORE_CACHE);
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const os = db.createObjectStore(STORE_OUTBOX, { keyPath: 'seq', autoIncrement: true });
        os.createIndex('clientId', 'clientId', { unique: true });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // 未來版本升級時（可能來自另一分頁或 SW 重整後的新頁面），主動關閉本連線，
      // 避免擋住對方的升級（否則對方會 onblocked）。這正是本次「明細卡載入中」的根因。
      db.onversionchange = () => { try { db.close(); } catch { /* 忽略 */ } };
      done(db);
    };
    req.onerror = () => done(null);
    // 升級被其他既有連線擋住 → 不無限等待，降級為「無快取/佇列」，確保畫面照常渲染。
    req.onblocked = () => done(null);
    // 保險絲：任何未預期的卡住，逾時後降級（絕不讓 IndexedDB 拖住 UI）。
    setTimeout(() => done(null), 4000);
  });
  return dbPromise;
}

function store(db, mode) {
  return db.transaction(STORE_CACHE, mode).objectStore(STORE_CACHE);
}

/** 寫入 GET 回應快取（key=endpoint）。version 為寫入當下的伺服器資料版本簽章
 * （輕量更新檢查用），供下次比對是否可沿用快取；未知則傳 null。失敗靜默，不影響呼叫端。 */
export async function putCache(key, data, version = null) {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise((resolve, reject) => {
      const r = store(db, 'readwrite').put({ data, ts: Date.now(), version }, key);
      r.onsuccess = resolve;
      r.onerror = () => reject(r.error);
    });
  } catch {
    /* 忽略：快取寫入失敗不該影響正常流程 */
  }
}

/** 讀取快取；回 { data, ts, version } 或 null。 */
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

/* ==================== outbox（離線寫入佇列，Phase 2） ==================== */

function outboxStore(db, mode) {
  return db.transaction(STORE_OUTBOX, mode).objectStore(STORE_OUTBOX);
}

/** 產生唯一 clientId（uuid）；供離線記錄與後端冪等去重對帳用。 */
export function genClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `cid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** 入列一筆離線操作。entry 不含 seq（由 autoIncrement 指派）。回傳成功與否。 */
export async function enqueueOutbox(entry) {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const r = outboxStore(db, 'readwrite').add(entry);
      r.onsuccess = () => resolve(true);
      r.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** 取出所有 outbox 項目（依 seq，即 FIFO 順序）。 */
export async function listOutbox() {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const r = outboxStore(db, 'readonly').getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/** 以 clientId 局部更新 outbox 項目（保留原 seq）。回傳成功與否。 */
export async function updateOutbox(clientId, patch) {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const os = outboxStore(db, 'readwrite');
      const g = os.index('clientId').get(clientId);
      g.onsuccess = () => {
        const cur = g.result;
        if (!cur) return resolve(false);
        const p = os.put({ ...cur, ...patch });
        p.onsuccess = () => resolve(true);
        p.onerror = () => resolve(false);
      };
      g.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** 以 clientId 移除 outbox 項目。回傳成功與否。 */
export async function removeOutbox(clientId) {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const os = outboxStore(db, 'readwrite');
      const g = os.index('clientId').getKey(clientId);
      g.onsuccess = () => {
        if (g.result === undefined) return resolve(false);
        const d = os.delete(g.result);
        d.onsuccess = () => resolve(true);
        d.onerror = () => resolve(false);
      };
      g.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * 待同步記錄（供 UI 疊加顯示）：把 outbox 每筆的 record 攤平成「像 server 記錄」的物件，
 * 附上 _pending / _clientId / _status / _error 供渲染與合併判斷。
 */
export async function pendingRecords() {
  const entries = await listOutbox();
  return entries.map((e) => ({
    ...e.record,
    _pending: true,
    _clientId: e.clientId,
    _status: e.status,
    _error: e.error || null,
  }));
}

/**
 * 登出時呼叫：整個清空 cache 與 outbox 兩個 store。
 *
 * 兩個 store 都是全域的（不依 user 分區，key 只是 API endpoint 字串／自動遞增
 * seq），同一台裝置換帳號登入時：
 *   - outbox 若還留著上一個使用者的離線寫入，下一位使用者登入、App 一載入
 *     就會被 main.js 的 flushOutbox() 自動送出去（不需要任何人手動觸發），
 *     等於把 A 的資料用 B 的 token 寫進 B 的帳戶
 *   - cache 若剛好命中下一位使用者當下的 data-version 簽章（例如兩個帳號都
 *     是全新空帳戶，簽章必然相同），會沿用舊使用者的快取內容
 * 因此登出必須整批清空，不是保留給下一位使用者沿用。失敗靜默，不影響登出流程
 * 本身（跟 putCache/getCache 一致的降級原則）。
 */
export async function clearOfflineData() {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CACHE, STORE_OUTBOX], 'readwrite');
      tx.objectStore(STORE_CACHE).clear();
      tx.objectStore(STORE_OUTBOX).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* 忽略：清除失敗不該擋住登出 */
  }
}
