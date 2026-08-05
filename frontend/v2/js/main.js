/**
 * main.js — v2 進入點：主題初始化、登入 gate、掛載 App、Service Worker。
 */

import { initTheme } from './theme.js';
import { verifyToken, renderAuth } from './auth.js';
import { removeAuthToken } from './api.js';
import { initRouter } from './router.js';
import { backendUrl, isDevelopment } from './config.js';

const root = document.getElementById('app');

function startApp() {
  initRouter(root);
}

function showAuth() {
  renderAuth(root, () => startApp());
}

async function boot() {
  initTheme();
  // token 失效時回到登入
  window.addEventListener('auth:token-invalid', () => { removeAuthToken(); showAuth(); });

  const ok = await verifyToken();
  if (ok) startApp(); else showAuth();
}

// Service Worker（PWA）：偵測到新版本安裝完成並接管後自動重新整理，
// 使用者升版後不用手動清快取/重新整理兩次就能拿到最新版本。
// service-worker.js 本身已在 install 呼叫 skipWaiting()、activate 呼叫
// clients.claim()，所以新版本裝完會自動接管；這裡只需要在接管當下重整頁面。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then((reg) => {
      // 實測發現：controllerchange 連「首次安裝、從無到有取得控制權」那次也會觸發
      // （並非只有「舊版本換成新版本」才觸發），所以不能無條件重整，否則使用者
      // 第一次打開 App 就會被多重整一次。用 lastController 追蹤「上一次事件發生時
      // 的 controller」——只有從「已經有值」變成「換成別的」才是真正的版本更新。
      let lastController = navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        const isFirstActivation = lastController === null;
        lastController = navigator.serviceWorker.controller;
        if (isFirstActivation || reloaded) return;
        reloaded = true;
        window.location.reload();
      });

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          // installed：新版本已裝好，緊接著會自動 skipWaiting + clients.claim，
          // 觸發上面的 controllerchange 完成重新整理，這裡不需要額外動作。
          if (newWorker.state === 'installed' && isDevelopment()) console.log('[SW] 新版本已安裝，準備接管…');
        });
      });
    }).catch(() => { /* 忽略 */ });
  });
}

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  console.log('🎯 [v2] 後端 URL:', backendUrl);
}

boot();
