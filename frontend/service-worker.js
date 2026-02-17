// ⚠️ 重要提醒：每次更新前端時，務必修改此版本號！⚠️
//
// 版本號規則（語義化版本控制 Semantic Versioning）：
// - 格式：accounting-system-v{major}.{minor}.{patch}
// - MAJOR（主版本）：不兼容的 API 修改或重大重構
// - MINOR（次版本）：向下兼容的功能性新增
// - PATCH（修訂版本）：向下兼容的問題修正、優化
//
// 範例：
//   v1.0.0 → v1.0.1  (修復 bug)
//   v1.0.1 → v1.1.0  (新增功能)
//   v1.1.0 → v2.0.0  (重大更新)
//
const CACHE_NAME = 'accounting-system-v1.2.0';  // ← 記得更新這裡！
const OFFLINE_QUEUE_NAME = 'offline-queue';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const FETCH_TIMEOUT = 8000; // 8 seconds timeout for fetch requests

// 需要快取的靜態資源（只包含本地資源）
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png'
];

// CDN資源（使用runtime caching，不在安裝時cache）
const CDN_URLS = [
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com'
];

// Fetch with timeout helper
async function fetchWithTimeout(request, timeout = FETCH_TIMEOUT) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    )
  ]);
}

// 安裝 Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// 啟用 Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 攔截 fetch 請求
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 特別處理：/status 端點永不快取（登入驗證用）
  if (request.url.includes('/status')) {
    event.respondWith(fetch(request));
    return;
  }

  // 只處理 GET 請求
  if (request.method === 'GET') {
    // 跳過 chrome-extension:// 和其他非 http(s) 協議
    const url = new URL(request.url);
    if (!url.protocol.startsWith('http')) {
      return;
    }

    // CDN 資源：完全不攔截，讓瀏覽器直接處理
    // 這樣可以避免 CORS 錯誤
    if (CDN_URLS.some(cdn => request.url.includes(cdn))) {
      return; // 不使用 event.respondWith，直接讓瀏覽器處理
    }

    // 本地靜態資源：Cache First 策略
    if (STATIC_ASSETS.some(asset => request.url.includes(asset))) {
      event.respondWith(
        caches.match(request)
          .then((response) => {
            return response || fetch(request).then((fetchResponse) => {
              return caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, fetchResponse.clone());
                return fetchResponse;
              });
            });
          })
      );
      return;
    }

    // API 請求：Network First 策略（優先網路，失敗才用快取）
    if (request.url.includes('/admin/api/')) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            // 成功取得資料，快取回應
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch(() => {
            // 網路失敗，嘗試從快取取得
            return caches.match(request).then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // 如果快取也沒有，返回離線提示
              return new Response(
                JSON.stringify({
                  error: '離線模式：無法連接伺服器',
                  offline: true
                }),
                {
                  status: 503,
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
          })
      );
      return;
    }
  }

  // POST/PUT/DELETE 請求：處理離線同步
  if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
    if (request.url.includes('/admin/api/')) {
      event.respondWith(
        fetch(request.clone())
          .catch(() => {
            // 網路失敗，儲存到離線佇列
            return saveToOfflineQueue(request.clone())
              .then(() => {
                return new Response(
                  JSON.stringify({
                    message: '記錄已儲存，將在連線後同步',
                    offline: true,
                    queued: true
                  }),
                  {
                    status: 202,
                    headers: { 'Content-Type': 'application/json' }
                  }
                );
              });
          })
      );
      return;
    }
  }

  // 其他請求：直接通過
  event.respondWith(fetch(request));
});

// 儲存離線請求到 IndexedDB
async function saveToOfflineQueue(request) {
  const db = await openOfflineDB();
  const body = await request.text();

  const queueItem = {
    url: request.url,
    method: request.method,
    headers: Array.from(request.headers.entries()),
    body: body,
    timestamp: Date.now()
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([OFFLINE_QUEUE_NAME], 'readwrite');
    const store = transaction.objectStore(OFFLINE_QUEUE_NAME);
    const addRequest = store.add(queueItem);

    addRequest.onsuccess = () => resolve();
    addRequest.onerror = () => reject(addRequest.error);
  });
}

// 打開 IndexedDB
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('AccountingOfflineDB', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE_NAME)) {
        db.createObjectStore(OFFLINE_QUEUE_NAME, { keyPath: 'timestamp' });
      }
    };
  });
}

// 同步離線佇列（當網路恢復時）
async function syncOfflineQueue() {
  const db = await openOfflineDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([OFFLINE_QUEUE_NAME], 'readonly');
    const store = transaction.objectStore(OFFLINE_QUEUE_NAME);
    const request = store.getAll();

    request.onsuccess = async () => {
      const queue = request.result;

      if (queue.length === 0) {
        resolve();
        return;
      }

      console.log(`Service Worker: Syncing ${queue.length} offline requests`);

      // 依序執行佇列中的請求
      for (const item of queue) {
        try {
          const headers = new Headers(item.headers);
          const response = await fetch(item.url, {
            method: item.method,
            headers: headers,
            body: item.body
          });

          if (response.ok) {
            // 成功同步，從佇列中刪除
            await deleteFromOfflineQueue(item.timestamp);
            console.log('Service Worker: Synced request:', item.url);
          }
        } catch (error) {
          console.error('Service Worker: Failed to sync request:', item.url, error);
        }
      }

      resolve();
    };

    request.onerror = () => reject(request.error);
  });
}

// 從離線佇列中刪除
async function deleteFromOfflineQueue(timestamp) {
  const db = await openOfflineDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([OFFLINE_QUEUE_NAME], 'readwrite');
    const store = transaction.objectStore(OFFLINE_QUEUE_NAME);
    const request = store.delete(timestamp);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// 監聽 sync 事件（Background Sync API）
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background Sync triggered');

  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(syncOfflineQueue());
  }
});

// 監聽 message 事件（來自主頁面的手動同步請求）
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_OFFLINE_QUEUE') {
    console.log('Service Worker: Manual sync requested');
    syncOfflineQueue()
      .then(() => {
        event.ports[0].postMessage({ success: true });
      })
      .catch((error) => {
        event.ports[0].postMessage({ success: false, error: error.message });
      });
  }

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 監聽線上狀態變化
self.addEventListener('online', () => {
  console.log('Service Worker: Network connection restored, syncing...');
  syncOfflineQueue();
});
