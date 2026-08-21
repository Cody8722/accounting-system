/**
 * service-worker.js — v2 PWA 快取。
 * ⚠️ 每次改動 v2 前端請更新 CACHE_NAME 版本號，讓用戶端取得新版。
 * 策略：App 殼與靜態資源 cache-first；API 請求一律走網路（不快取）。
 */
const CACHE_NAME = 'accounting-v2-1.12.0';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/tokens.css',
  './vendor/jsqr.js',
  './vendor/tabler-icons/tabler-icons.min.css',
  './vendor/tabler-icons/tabler-icons.woff2',
  './js/main.js',
  './js/config.js',
  './js/version.js',
  './js/offline.js',
  './js/sync.js',
  './js/jwt.js',
  './js/api.js',
  './js/utils.js',
  './js/theme.js',
  './js/auth.js',
  './js/store.js',
  './js/router.js',
  './js/charts.js',
  './js/dashboard.js',
  './js/pin.js',
  './js/add.js',
  './js/ledger.js',
  './js/stats.js',
  './js/budget.js',
  './js/settings.js',
  './js/invoice.js',
  './js/wallet.js',
  './js/lock.js',
  './js/photos.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // API（後端）請求：不介入，直接走網路
  if (/\/api\//.test(url.pathname) || /:5001$/.test(url.host) || url.port === '5001') return;
  // 僅處理同源與字型/CDN
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      if (res && res.status === 200 && (url.origin === location.origin || url.host.includes('gstatic') || url.host.includes('jsdelivr'))) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => cached))
  );
});
