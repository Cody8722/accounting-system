/**
 * lock.js — 手機版明細頁「鎖定模式」：複選錢包＋分類鎖定篩選，套用到
 * 帳本/統計/預算（及桌面概覽，但鎖定只能從手機觸發，見下方平台限制）。
 *
 * 狀態設計：
 *  - 純記憶體（模組級變數），不寫 localStorage → 重開 App（重新載入頁面）
 *    自然清空，不需要額外清除邏輯。
 *  - 解鎖手勢：連續觸發兩次「返回」在短時間窗（1.5s）內才解鎖，第一次只是
 *    攔截並重新埋一次 history 陷阱（不離開頁面）。
 *  - 平台限制：iOS PWA／桌面瀏覽器沒有可靠的「返回鍵」事件可攔截（standalone
 *    模式下通常沒有系統返回鍵、也沒有可預期的 popstate 觸發時機），所以額外提供
 *    一個「鎖定中」徽章，用同一套「短時間內點兩次」規則作為跨平台的替代解鎖方式，
 *    確保鎖定不會讓沒有實體返回鍵的使用者被卡住。
 */

import { emit } from './store.js';

const UNLOCK_WINDOW_MS = 1500;

const state = { active: false, walletIds: new Set(), categories: new Set() };

let unlockTimer = null;

function doUnlock() {
  state.active = false;
  state.walletIds = new Set();
  state.categories = new Set();
  emit('lock:changed');
}

/** 「兩次動作在短時間窗內」的共用判定；供 popstate 與手動點擊徽章共用同一套規則 */
function registerUnlockAttempt() {
  if (!state.active) return false;
  if (unlockTimer) {
    clearTimeout(unlockTimer);
    unlockTimer = null;
    doUnlock();
    return true; // 這次真的解鎖了
  }
  unlockTimer = setTimeout(() => { unlockTimer = null; }, UNLOCK_WINDOW_MS);
  return false; // 第一下，還在等第二下
}

function onPopState() {
  if (!state.active) return;
  const unlocked = registerUnlockAttempt();
  if (!unlocked) {
    // 還沒解鎖：重新埋一次陷阱，吃掉這次「返回」，不讓使用者真的離開頁面
    history.pushState({ __lock: true }, '', location.href);
  }
}
window.addEventListener('popstate', onPopState);

/** 手動觸發一次解鎖嘗試（供「鎖定中」徽章點擊使用，iOS/桌面等無實體返回鍵平台的替代解鎖方式） */
export function tapUnlockBadge() {
  if (!state.active) return;
  if (!registerUnlockAttempt()) {
    // 提示使用者「再點一次」——短暫的視覺回饋，不阻塞
    emit('lock:tap-pending');
  }
}

export function isLocked() { return state.active; }
export function lockSelection() { return { walletIds: [...state.walletIds], categories: [...state.categories] }; }

/** 依目前鎖定狀態組出查詢字串片段（如 '&wallet_ids=..&categories=..'），未鎖定回傳空字串 */
export function lockQueryParams() {
  if (!state.active) return '';
  const parts = [];
  if (state.walletIds.size) parts.push(`wallet_ids=${[...state.walletIds].join(',')}`);
  if (state.categories.size) parts.push(`categories=${[...state.categories].map(encodeURIComponent).join(',')}`);
  return parts.length ? `&${parts.join('&')}` : '';
}

/** 開始鎖定（walletIds/categories 為 id/名稱陣列，可皆空＝只是想暫時凍結畫面但不篩選任何條件也允許） */
export function engageLock({ walletIds = [], categories = [] } = {}) {
  state.active = true;
  state.walletIds = new Set(walletIds);
  state.categories = new Set(categories);
  history.pushState({ __lock: true }, '', location.href); // 埋入第一個歷史陷阱
  emit('lock:changed');
}

/** 桌面版強制解鎖（跨斷點時使用，見 router.js；鎖定僅限手機觸發，不應該讓桌面繼承） */
export function forceUnlock() {
  if (unlockTimer) { clearTimeout(unlockTimer); unlockTimer = null; }
  if (state.active) doUnlock();
}

/** 鎖定中的小徽章 HTML；未鎖定回傳空字串 */
export function lockBadgeHtml() {
  if (!state.active) return '';
  const n = state.walletIds.size + state.categories.size;
  return `<button type="button" data-el="lockBadge" style="display:flex;align-items:center;gap:6px;background:var(--accent);color:#fff;border:none;border-radius:999px;padding:6px 12px;font-size:var(--text-base);font-weight:600;cursor:pointer;margin-bottom:10px">
    <i class="ti ti-lock"></i>已鎖定篩選${n ? `（${n}）` : ''} · 連按兩次返回或點此解鎖
  </button>`;
}

/** 綁定徽章點擊（在各頁面 render 完 lockBadgeHtml() 後呼叫一次） */
export function bindLockBadge(container) {
  const badge = container.querySelector('[data-el="lockBadge"]');
  if (badge) badge.onclick = () => tapUnlockBadge();
}

/* ============ 鎖定選擇面板（複選錢包 + 分類） ============ */

export async function openLockPicker() {
  const { fetchWallets } = await import('./wallet.js');
  const { CATEGORY_TREE } = await import('./config.js');
  const { escapeHtml } = await import('./utils.js');

  let wallets = [];
  try { wallets = await fetchWallets(); } catch { /* 沒有錢包也能只鎖分類 */ }

  const sel = lockSelection();
  const selWallets = new Set(sel.walletIds);
  const selCats = new Set(sel.categories);
  const allLeaves = [...CATEGORY_TREE.expense, ...CATEGORY_TREE.income].flatMap((g) => g.items);

  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span style="font-weight:600;font-size:17px;color:var(--text)">鎖定篩選</span>
      <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
    </div>
    <div style="font-size:var(--text-base);color:var(--muted2);margin-bottom:14px">複選錢包／分類後鎖定，套用到帳本/統計/預算，直到連按兩次返回鍵解鎖</div>
    ${wallets.length ? `<div style="font-size:13px;color:var(--muted2);margin-bottom:8px">錢包</div>
    <div data-el="walletChips" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      ${wallets.map((w) => `<button type="button" class="chip${selWallets.has(w.id) ? ' active' : ''}" data-wallet="${w.id}"><i class="ti ${w.icon || 'ti-tag'}"></i><span>${escapeHtml(w.name)}</span></button>`).join('')}
    </div>` : ''}
    <div style="font-size:13px;color:var(--muted2);margin-bottom:8px">分類</div>
    <div data-el="catChips" style="display:flex;flex-wrap:wrap;gap:8px;max-height:220px;overflow-y:auto;margin-bottom:20px">
      ${allLeaves.map((l) => `<button type="button" class="chip${selCats.has(l) ? ' active' : ''}" data-cat="${escapeHtml(l)}"><span>${escapeHtml(l)}</span></button>`).join('')}
    </div>
    <button class="btn-primary" data-confirm="1" style="width:100%">鎖定</button>
  </div>`;

  ov.querySelectorAll('[data-wallet]').forEach((b) => b.onclick = () => {
    const id = b.dataset.wallet;
    if (selWallets.has(id)) selWallets.delete(id); else selWallets.add(id);
    b.classList.toggle('active');
  });
  ov.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => {
    const c = b.dataset.cat;
    if (selCats.has(c)) selCats.delete(c); else selCats.add(c);
    b.classList.toggle('active');
  });
  ov.querySelector('[data-confirm]').onclick = () => {
    engageLock({ walletIds: [...selWallets], categories: [...selCats] });
    ov.remove();
  };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  document.body.appendChild(ov);
}
