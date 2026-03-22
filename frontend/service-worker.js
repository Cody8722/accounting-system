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
const CACHE_NAME = 'accounting-system-v1.9.0';  // ← 記得更新這裡！
const OFFLINE_QUEUE_NAME = 'offline-queue';
const FETCH_TIMEOUT = 8000; // 8 seconds timeout for fetch requests
// JWT Token 有效期為 7 天，API 快取超過此時限後視為過期，不在離線時回傳
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

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
        // 逐一快取，單一資源失敗（如部署期間伺服器重啟 502）不會中斷整個安裝
        return Promise.all(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err =>
              console.warn('Service Worker: 快取失敗（將在下次請求時重試）:', url, err.message)
            )
          )
        );
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

  // 只處理 GET 請求
  if (request.method === 'GET') {
    // 跳過 chrome-extension:// 和其他非 http(s) 協議
    // 注意：url 已在上方（第 84 行）定義，此處直接使用
    if (!url.protocol.startsWith('http')) {
      return;
    }

    // CDN 資源：完全不攔截，讓瀏覽器直接處理
    // 這樣可以避免 CORS 錯誤
    if (CDN_URLS.some(cdn => request.url.includes(cdn))) {
      return; // 不使用 event.respondWith，直接讓瀏覽器處理
    }

    // 認證端點（GET）：永不快取，每次都去伺服器驗證
    // 只針對 GET，POST login 讓瀏覽器直接處理即可
    if (request.url.includes('/status') || request.url.includes('/api/auth/')) {
      event.respondWith(
        fetch(new Request(request, { cache: 'no-store' }))
          .catch(() => Response.error())
      );
      return;
    }

    // JS 模塊（/js-refactored/）：Cache First 策略
    // SW 升版 → activate 清除舊 CACHE_NAME → 下次重新從網路載入
    // 解決：瀏覽器 HTTP heuristic caching 不受 SW 版本控制的問題
    if (url.pathname.startsWith('/js-refactored/')) {
      event.respondWith(
        caches.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, response.clone());
              }).catch((err) => {
                console.warn('Service Worker: JS 快取寫入失敗:', err.name);
              });
            }
            return response;
          }).catch(() => {
            // 網路失敗且無快取：返回空模組避免 SW unhandled rejection
            return new Response('', { status: 503, headers: { 'Content-Type': 'application/javascript' } });
          });
        })
      );
      return;
    }

    // 本地靜態資源：Cache First 策略（使用 pathname 精確比對，避免 '/' 匹配所有 URL）
    if (STATIC_ASSETS.includes(url.pathname)) {
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

    // 匯出/匯入端點：直接走網路，不快取（下載用途，快取無意義且可能汙染舊內容）
    if (request.url.includes('/accounting/export') || request.url.includes('/accounting/import')) {
      event.respondWith(
        fetch(new Request(request, { cache: 'no-store' }))
          .catch(() => Response.error())
      );
      return;
    }

    // API 請求：Network First 策略（優先網路，失敗才用快取）
    // 使用 cache: 'no-store' 強制略過瀏覽器 HTTP cache，
    // 確保 Network First 真的去伺服器取最新資料（手機端 HTTP cache 較積極，容易拿到舊統計）
    if (request.url.includes('/admin/api/')) {
      const networkRequest = new Request(request, { cache: 'no-store' });
      event.respondWith(
        fetch(networkRequest)
          .then((response) => {
            // 成功取得資料，快取回應（作為離線備援）
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              }).catch((err) => {
                // iOS CacheStorage 空間有限（約 50MB），QuotaExceededError 時靜默忽略
                // 避免未捕獲的 Promise rejection 在 iOS WebKit 被轉成 402
                console.warn('Service Worker: 快取寫入失敗（忽略）:', err.name);
              });
            }
            return response;
          })
          .catch(() => {
            // 網路失敗，嘗試從快取取得
            return caches.match(request).then((cachedResponse) => {
              if (cachedResponse) {
                // 檢查快取是否已超過 JWT 有效期（7 天）
                // 超過 7 天的快取不回傳，避免用戶重新登入後看到過期資料
                const dateHeader = cachedResponse.headers.get('Date');
                if (dateHeader) {
                  const cacheAge = Date.now() - new Date(dateHeader).getTime();
                  if (cacheAge > CACHE_MAX_AGE) {
                    console.warn('Service Worker: API 快取已超過 7 天（與 JWT 同步失效），不使用過期資料');
                    return new Response(
                      JSON.stringify({ error: '離線模式：快取已過期，請重新連線', offline: true }),
                      { status: 503, headers: { 'Content-Type': 'application/json' } }
                    );
                  }
                }
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

  // 其他 GET 請求（如 /api/auth/validate-password 等未列舉端點）：不攔截，讓瀏覽器直接處理
  // iOS Standalone 模式下，直接呼叫 event.respondWith(fetch(request)) 若失敗會產生合成 402/499
  // 只要不呼叫 event.respondWith，瀏覽器就會用原生 fetch 處理，避免此問題
  return;
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
          } else if (response.status === 401 || response.status === 403) {
            // Token 已過期或無效，刪除此項目避免無限重試
            // iOS 上若不刪除，每次連線恢復都會重試，連帶觸發 rate limiter
            await deleteFromOfflineQueue(item.timestamp);
            console.warn('Service Worker: 離線請求因 Token 過期被丟棄:', item.url, response.status);
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
