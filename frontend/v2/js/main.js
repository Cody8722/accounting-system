/**
 * main.js — v2 進入點：主題初始化、登入 gate、掛載 App、Service Worker。
 */

import { initTheme } from './theme.js';
import { verifyToken, renderAuth } from './auth.js';
import { removeAuthToken } from './api.js';
import { initRouter } from './router.js';
import { backendUrl } from './config.js';

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

// Service Worker（PWA）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => { /* 忽略 */ });
  });
}

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  console.log('🎯 [v2] 後端 URL:', backendUrl);
}

boot();
