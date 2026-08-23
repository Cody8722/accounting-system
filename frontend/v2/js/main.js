/**
 * main.js — v2 進入點：主題初始化、登入 gate、掛載 App、Service Worker。
 */

import { initTheme } from './theme.js';
import { verifyToken, renderAuth, renderForcedPasswordChange, getUserData } from './auth.js';
import { removeAuthToken } from './api.js';
import { initRouter } from './router.js';
import { backendUrl, isDevelopment } from './config.js';
import { showToast } from './utils.js';
import { APP_VERSION, RELEASE_NOTE } from './version.js';
import { isOnline } from './offline.js';
import { flushOutbox, pendingCount } from './sync.js';
import { on } from './store.js';

const root = document.getElementById('app');

function startApp() {
  initRouter(root);
}

// 登入成功／既有 session 驗證通過後的共用入口：requires_password_change 為 true
// 時擋在強制改密碼畫面，改完才放行進 App，兩個入口（剛登入 / 既有 session 在
// verify 時才發現被標記）都要經過這道閘門，不能只擋登入當下那一次。
function enterApp(user) {
  if (user && user.requires_password_change) {
    renderForcedPasswordChange(root, () => startApp());
    return;
  }
  startApp();
}

function showAuth() {
  renderAuth(root, (user) => enterApp(user));
}

// 偵測到新版本並自動重整後，跳出「已更新」Toast 說明本次更新內容。
// 用「這次載入到的版本（version.js 的 APP_VERSION）」與 localStorage 記的
// 「上次看到的版本」比對，與 SW 自動重整機制解耦：不論自動或手動重整，同一
// 新版只提示一次。seen === null（首次安裝／舊用戶第一次）只靜默記錄、不跳。
function maybeShowUpdateToast() {
  const KEY = 'lastSeenVersion';
  let seen;
  try {
    seen = localStorage.getItem(KEY);
  } catch {
    return; // localStorage 不可用（無痕等）→ 不提示、不報錯
  }
  if (seen === APP_VERSION) return; // 同版本，不提示
  try { localStorage.setItem(KEY, APP_VERSION); } catch { /* 寫入失敗略過 */ }
  if (seen === null) return; // 首次安裝／舊用戶第一次：靜默記錄，不跳
  if (!RELEASE_NOTE) return; // 沒有說明就不跳（理論上不會發生）
  showToast(`已更新：${RELEASE_NOTE}`, 'success', 4500);
}

// 離線指示（功能簡版；視覺精緻化之後交給 Design）：離線時顯示一顆置頂膠囊，回線隱藏。
function setOfflineBadge(offline) {
  let el = document.getElementById('offline-badge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'offline-badge';
    el.innerHTML = '<i class="ti ti-wifi-off" style="font-size:14px"></i><span>離線模式</span>';
    el.style.cssText = [
      'position:fixed', 'left:50%', 'top:calc(10px + env(safe-area-inset-top))',
      'transform:translateX(-50%)', 'z-index:99990',
      'padding:var(--space-2xs) var(--space-emphasis)', 'border-radius:999px', 'font-size:12px', 'font-weight:600',
      'color:#fff', 'background:#6b7280', 'box-shadow:0 4px 14px rgba(0,0,0,.2)',
      'display:none', 'align-items:center', 'gap:var(--space-2xs)', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
  }
  el.style.display = offline ? 'inline-flex' : 'none';
}

// 待同步計數膠囊（離線寫入佇列尚未同步的筆數）；視覺之後可交 Design。
async function updatePendingBadge() {
  let el = document.getElementById('pending-badge');
  const n = await pendingCount();
  if (!el) {
    el = document.createElement('div');
    el.id = 'pending-badge';
    el.innerHTML = '<i class="ti ti-cloud-upload" style="font-size:14px"></i><span data-el="n"></span>';
    el.style.cssText = [
      'position:fixed', 'left:50%', 'top:calc(46px + env(safe-area-inset-top))',
      'transform:translateX(-50%)', 'z-index:99989',
      'padding:5px 13px', 'border-radius:999px', 'font-size:12px', 'font-weight:600',
      'color:#fff', 'background:var(--accent, #4f7fff)', 'box-shadow:0 4px 14px rgba(0,0,0,.2)',
      'display:none', 'align-items:center', 'gap:var(--space-2xs)', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
  }
  el.querySelector('[data-el="n"]').textContent = `待同步 ${n}`;
  el.style.display = n > 0 ? 'inline-flex' : 'none';
}

function setupOfflineIndicator() {
  setOfflineBadge(!isOnline());
  updatePendingBadge();
  on('outbox:changed', updatePendingBadge);
  on('sync:done', updatePendingBadge);
  on('records:changed', updatePendingBadge); // 離線入列/合併/移除都會 emit records:changed
  window.addEventListener('offline', () => {
    setOfflineBadge(true);
    showToast('已離線，顯示本地快取資料', 'info', 3000);
  });
  window.addEventListener('online', () => {
    setOfflineBadge(false);
    showToast('已恢復連線', 'success', 2500);
    flushOutbox();
  });
}

async function boot() {
  initTheme();
  maybeShowUpdateToast();
  setupOfflineIndicator();
  // token 失效時回到登入
  window.addEventListener('auth:token-invalid', () => { removeAuthToken(); showAuth(); });

  const status = await verifyToken();
  if (status === 'valid' || status === 'offline-trusted') {
    if (status === 'offline-trusted') showToast('離線模式：顯示本地資料', 'info', 3500);
    enterApp(getUserData());
    updatePendingBadge();
    if (status === 'valid') flushOutbox(); // 進場即嘗試把離線佇列送出
  } else {
    showAuth();
  }
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
