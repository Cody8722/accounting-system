/**
 * router.js — 響應式外殼與畫面切換。
 * 手機 (<900px)：手機外框 + 底部導覽 + FAB；電腦 (≥900px)：常駐側欄 + 主內容。
 * 畫面：ledger(帳本/明細) / stats / budget / settings；FAB/側欄鈕開「記一筆」。
 */

import { state, on, emit } from './store.js';
import { getUserData } from './api.js';
import { escapeHtml } from './utils.js';
import { themeToggleIcon, cycleTheme } from './theme.js';
import { openAdd } from './add.js';
import { renderLedgerMobile, renderLedgerDesktop } from './ledger.js';
import { renderStatsMobile, renderStatsDesktop } from './stats.js';
import { renderBudgetMobile, renderBudgetDesktop } from './budget.js';
import { renderSettingsMobile, renderSettingsDesktop } from './settings.js';

const NAV = [
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
  desktop: { ledger: renderLedgerDesktop, stats: renderStatsDesktop, budget: renderBudgetDesktop, settings: renderSettingsDesktop },
};

function renderView() {
  const screen = root.querySelector('[data-el="screen"]');
  if (!screen) return;
  const fn = RENDERERS[mode][state.view];
  if (fn) fn(screen);
  // 更新導覽 active
  root.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.view));
}

export function setView(view) {
  state.view = view;
  renderView();
}

function buildMobile() {
  const nav = NAV.slice(0, 2), navR = NAV.slice(2);
  const tab = (n) => `<button class="tab" data-nav="${n.key}"><i class="ti ${n.icon}"></i><span>${n.mLabel}</span></button>`;
  root.innerHTML = `
    <div class="phone-backdrop">
      <div class="phone-frame">
        <div class="status-bar">
          <span class="clock">9:41</span>
          <div class="icons"><i class="ti ti-antenna-bars-5"></i><i class="ti ti-wifi"></i><i class="ti ti-battery-3" style="font-size:19px"></i></div>
        </div>
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
          <div class="avatar" style="width:38px;height:38px;font-size:16px">${escapeHtml((user.name || 'U').slice(0, 1))}</div>
          <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:14px;color:var(--text)">${escapeHtml(user.name || '使用者')}</div><div style="font-size:12px;color:var(--muted2);overflow:hidden;text-overflow:ellipsis">${escapeHtml(user.email || '')}</div></div>
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
  if (mode === 'mobile') buildMobile(); else buildDesktop();
  renderView();
}

export function initRouter(rootEl) {
  root = rootEl;
  mount();
  // 響應式：跨越 900px 斷點時重建外殼
  let lastMode = mode;
  window.addEventListener('resize', () => {
    const m = currentMode();
    if (m !== lastMode) { lastMode = m; mount(); }
  });
  // 資料/月份變動 → 重繪當前畫面
  on('records:changed', renderView);
  on('month:changed', renderView);
  // 記一筆關閉後刷新（可能有連續記帳）
  window.addEventListener('add:closed', () => emit('records:changed'));
}
