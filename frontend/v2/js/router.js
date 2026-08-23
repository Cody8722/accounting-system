/**
 * router.js — 響應式外殼與畫面切換。
 * 手機 (<900px)：手機外框 + 底部導覽 + FAB；電腦 (≥900px)：常駐側欄 + 主內容。
 * 畫面：ledger(帳本/明細) / stats / budget / settings；FAB/側欄鈕開「記一筆」。
 */

import { state, on, emit } from './store.js';
import { getUserData } from './api.js';
import { escapeHtml } from './utils.js';
import { themeToggleIcon, cycleTheme } from './theme.js';
import { openAdd, closeAdd } from './add.js';
import { forceUnlock } from './lock.js';
import { renderDashboardDesktop } from './dashboard.js';
import { renderLedgerMobile, renderLedgerDesktop } from './ledger.js';
import { renderStatsMobile, renderStatsDesktop } from './stats.js';
import { renderBudgetMobile, renderBudgetDesktop } from './budget.js';
import { renderSettingsMobile, renderSettingsDesktop } from './settings.js';

// desktopOnly：概覽為電腦版專屬（資訊密度優先），手機版底部導覽不顯示
const NAV = [
  { key: 'dashboard', dLabel: '概覽', icon: 'ti-layout-dashboard', desktopOnly: true },
  { key: 'ledger', mLabel: '帳本', dLabel: '明細', icon: 'ti-notebook' },
  { key: 'stats', mLabel: '統計', dLabel: '統計', icon: 'ti-chart-donut' },
  { key: 'budget', mLabel: '預算', dLabel: '預算', icon: 'ti-target-arrow' },
  { key: 'settings', mLabel: '我的', dLabel: '我的', icon: 'ti-user' },
];

let root = null;
let mode = null; // 'mobile' | 'desktop'

function currentMode() { return window.innerWidth >= 900 ? 'desktop' : 'mobile'; }

const RENDERERS = {
  mobile: { ledger: renderLedgerMobile, stats: renderStatsMobile, budget: renderBudgetMobile, settings: renderSettingsMobile },
  desktop: { dashboard: renderDashboardDesktop, ledger: renderLedgerDesktop, stats: renderStatsDesktop, budget: renderBudgetDesktop, settings: renderSettingsDesktop },
};

function renderView() {
  const screen = root.querySelector('[data-el="screen"]');
  if (!screen) return;
  const fn = RENDERERS[mode][state.view];
  if (!fn) return;
  fn(screen);
  // 更新導覽 active
  root.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.view));
}

export function setView(view) {
  state.view = view;
  renderView();
}

function buildMobile() {
  const mnav = NAV.filter((n) => !n.desktopOnly);
  const nav = mnav.slice(0, 2), navR = mnav.slice(2);
  const tab = (n) => `<button class="tab" data-nav="${n.key}"><i class="ti ${n.icon}"></i><span>${n.mLabel}</span></button>`;
  root.innerHTML = `
    <div class="phone-backdrop">
      <div class="phone-frame">
        <div class="screen-scroll" style="flex:1;position:relative">
          <div data-el="screen" style="position:absolute;inset:0;display:flex;flex-direction:column"></div>
        </div>
        <div class="tabbar">
          ${nav.map(tab).join('')}
          <div class="fab-slot"><button class="fab" data-el="fab"><i class="ti ti-plus"></i></button></div>
          ${navR.map(tab).join('')}
        </div>
      </div>
    </div>`;
  root.querySelector('[data-el="fab"]').onclick = () => openAdd(state.view === 'ledger' ? 'expense' : 'expense');
  root.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => setView(b.dataset.nav));
}

function buildDesktop() {
  const user = getUserData() || {};
  root.innerHTML = `
    <div class="desktop">
      <aside class="sidebar">
        <div class="brand"><div class="brand-badge"><i class="ti ti-wallet"></i></div><span class="brand-name">記帳本</span></div>
        <button class="btn-primary" data-el="add"><i class="ti ti-plus"></i>記一筆</button>
        <nav class="sidenav">
          ${NAV.map((n) => `<div class="row" data-nav="${n.key}"><i class="ti ${n.icon}"></i><span>${n.dLabel}</span></div>`).join('')}
        </nav>
        <div class="user">
          <div class="avatar" style="width:38px;height:38px;font-size:var(--text-lg)">${escapeHtml((user.name || 'U').slice(0, 1))}</div>
          <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:var(--text-emphasis);color:var(--text)">${escapeHtml(user.name || '使用者')}</div><div style="font-size:var(--text-base);color:var(--muted2);overflow:hidden;text-overflow:ellipsis">${escapeHtml(user.email || '')}</div></div>
          <button class="icon-btn" data-el="theme" style="width:34px;height:34px;border-radius:9px"><i class="ti ${themeToggleIcon()}"></i></button>
        </div>
      </aside>
      <main class="desktop-main" data-el="screen"></main>
    </div>`;
  root.querySelector('[data-el="add"]').onclick = () => openAdd('expense');
  root.querySelector('[data-el="theme"]').onclick = () => { cycleTheme(); root.querySelector('[data-el="theme"] i').className = `ti ${themeToggleIcon()}`; };
  root.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => setView(b.dataset.nav));
}

function mount() {
  mode = currentMode();
  // 該模式沒有此畫面的 renderer（例如手機沒有 dashboard）→ 退回明細
  if (!RENDERERS[mode][state.view]) state.view = 'ledger';
  if (mode === 'mobile') buildMobile(); else buildDesktop();
  renderView();
}

export function initRouter(rootEl) {
  root = rootEl;
  // 電腦版登入後預設落地在「概覽」；手機版維持「帳本」
  state.view = currentMode() === 'desktop' ? 'dashboard' : 'ledger';
  mount();
  // 響應式：跨越 900px 斷點時重建外殼
  let lastMode = mode;
  window.addEventListener('resize', () => {
    const m = currentMode();
    if (m !== lastMode) {
      lastMode = m;
      closeAdd();
      // 鎖定模式僅限手機觸發；跨到桌面時強制解鎖，避免桌面版意外繼承手機端設定的篩選
      if (m === 'desktop') forceUnlock();
      mount();
    }
  });
  // 儀表板/摘要卡「看全部」導頁（透過事件解耦，避免 router↔dashboard 循環 import）
  on('nav', (v) => setView(v));
  // 資料/月份變動 → 重繪當前畫面
  on('records:changed', renderView);
  on('month:changed', renderView);
  // 鎖定狀態改變（進入/解除/切換選項）→ 重繪當前畫面套用新篩選
  on('lock:changed', renderView);
  // 錢包新增/改名/封存 → 重繪（帳本頁餘額摘要條等需要反映最新清單）
  on('wallets:changed', renderView);
  // 記一筆關閉後刷新（可能有連續記帳）
  window.addEventListener('add:closed', () => emit('records:changed'));
}
